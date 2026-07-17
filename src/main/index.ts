import { app, BrowserWindow, globalShortcut, net, Notification, protocol, shell } from 'electron'
import log from 'electron-log/main'
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { EVENTS } from '@shared/ipc'
import { mapDisplayName, modeDisplayName } from '@shared/maps'
import { TeamTracker } from '@shared/teamTracker'
import type { NewMatchEvent } from '@shared/types'
import { openDatabase } from './db/index'
import { getPollState, getSettings, setPollState } from './db/repos'
import { seedBuiltinMarkers } from './db/seed'
import { PubgClient } from './pubg/client'
import { registerIpc } from './ipc'
import { createGepSource } from './services/gep'
import { createMapImageService } from './services/mapimg'
import { createMatchServices } from './services/matches'
import { OverlayManager } from './services/overlay'
import { MatchPoller } from './services/poller'
import { createSquadServices } from './services/squad'
import { createServices } from './services/stats'
import { createTelemetryServices } from './services/telemetry'

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null

// 自定义协议供渲染层流式读取本地底图缓存(必须在 app ready 前注册)
protocol.registerSchemesAsPrivileged([
  { scheme: 'mapimg', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

/** 开发期从项目根目录的 .env.local 读 PUBG_API_KEY,作为设置页未填 Key 时的兜底 */
function loadDevEnv(): void {
  if (!isDev) return
  try {
    const text = readFileSync(join(process.cwd(), '.env.local'), 'utf-8')
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch {
    /* 没有 .env.local 就算了 */
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0e1116',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  mainWindow.on('closed', () => (mainWindow = null))

  // 外链一律走系统浏览器,不在应用内开新窗口
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.whenReady().then(() => {
    log.initialize()
    loadDevEnv()

    const db = openDatabase(join(app.getPath('userData'), 'pubg-buddy.db'))
    seedBuiltinMarkers(db)
    const client = new PubgClient({
      getKey: () => getSettings(db).apiKey || process.env.PUBG_API_KEY || ''
    })
    const services = createServices(db, client)
    const matches = createMatchServices(db, client, services.resolvePlayer)

    const poller = new MatchPoller({
      latest: () => matches.latestForPoll(),
      getStored: (acc) => getPollState(db, acc),
      setStored: (acc, id) => setPollState(db, acc, id),
      onNew: async (matchId) => {
        const summary = await matches.ensureStored(matchId)
        const event: NewMatchEvent = { matchId, summary }
        broadcast(EVENTS.newMatch, event)

        const title = `新比赛 · ${mapDisplayName(summary.mapName)} ${modeDisplayName(summary.gameMode)}`
        const body = summary.me
          ? `#${summary.me.winPlace}/${summary.numTeams} · ${summary.me.kills} 杀 · ${Math.round(summary.me.damage)} 伤害`
          : '点击查看本局全员数据'
        const n = new Notification({ title, body })
        n.on('click', () => {
          mainWindow?.show()
          mainWindow?.focus()
          broadcast(EVENTS.openMatch, matchId)
        })
        n.show()
        log.info(`新比赛入库并通知:${matchId}`)
        // 顺手把这局的 telemetry 拉下来解析(免限流,失败不影响主流程)
        telemetry.downloadAndParse(matchId).catch((e) => log.warn('telemetry 解析失败:', e))
      }
    })

    const squad = createSquadServices(db, client, services.currentSeasonId)
    const telemetry = createTelemetryServices(db, join(app.getPath('userData'), 'telemetry'))

    // 游戏内 HUD 数据管线:真实 GEP(Windows)或模拟注入(开发)喂给同一个 tracker
    const tracker = new TeamTracker()
    const broadcastHud = (e: unknown) => broadcast(EVENTS.hudRoster, e)
    const gep = createGepSource()
    if (gep.available) {
      gep.start((entries) => {
        tracker.upsertMany(entries)
        broadcastHud(tracker.snapshot())
      })
    }

    const mapsDir = join(app.getPath('userData'), 'maps')
    protocol.handle('mapimg', (req) => {
      // mapimg://maps/<文件名>;basename 兜底防路径穿越
      const name = basename(decodeURIComponent(new URL(req.url).pathname))
      return net.fetch(pathToFileURL(join(mapsDir, name)).toString())
    })
    const mapimg = createMapImageService(mapsDir, (mapId) => broadcast(EVENTS.mapimgReady, mapId))
    // 启动 3 秒后开始预取全部 8K 底图(避开启动高峰),之后地图浮窗直接读本地缓存秒开
    setTimeout(() => void mapimg.prefetchAll().catch((e) => log.warn('底图预取异常:', e)), 3000)
    const overlay = new OverlayManager(join(__dirname, '../preload/index.js'))
    overlay.registerShortcuts()

    registerIpc({ db, services, matches, poller, squad, telemetry, tracker, mapimg, overlay, broadcastHud })
    if (getSettings(db).pollEnabled) poller.start()

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })

  app.on('window-all-closed', () => {
    // M2 起有后台轮询后改为驻留托盘;当前阶段直接退出
    app.quit()
  })
}
