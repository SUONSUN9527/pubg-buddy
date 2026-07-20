import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import log from 'electron-log/main'
import { CHANNELS, type Envelope } from '@shared/ipc'
import type { SettingsShape } from '@shared/types'
import type { DB } from './db/index'
import { getSettings, setSettings } from './db/repos'
import { AppError } from './pubg/client'
import type { MapImageService } from './services/mapimg'
import type { MatchServices } from './services/matches'
import type { OverlayManager } from './services/overlay'
import type { MatchPoller } from './services/poller'
import type { SquadServices } from './services/squad'
import type { Services } from './services/stats'
import type { TelemetryServices } from './services/telemetry'
import type { TeamTracker } from '@shared/teamTracker'
import type { GameMode, HudRosterEvent, MarkerType, OverlayKind, RosterEntry } from '@shared/types'
import { listMarkers, removeMarker, saveMarker } from './db/repos'

function wrap<A extends unknown[], T>(fn: (...args: A) => T | Promise<T>) {
  return async (_e: unknown, ...args: A): Promise<Envelope<T>> => {
    try {
      return { ok: true, data: await fn(...args) }
    } catch (e) {
      const code = e instanceof AppError ? e.code : 'UNKNOWN'
      const message = (e as Error).message ?? '未知错误'
      if (code === 'UNKNOWN') log.error('ipc handler error:', e)
      return { ok: false, error: { code, message } }
    }
  }
}

export interface IpcDeps {
  db: DB
  services: Services
  matches: MatchServices
  poller: MatchPoller
  squad: SquadServices
  telemetry: TelemetryServices
  tracker: TeamTracker
  mapimg: MapImageService
  overlay: OverlayManager
  /** 把 HUD 快照广播给所有窗口 */
  broadcastHud(e: HudRosterEvent): void
}

export function registerIpc(deps: IpcDeps): void {
  const { db, services, matches, poller, squad, telemetry, tracker, mapimg, overlay } = deps
  ipcMain.handle(
    CHANNELS.settingsGet,
    wrap(() => getSettings(db))
  )
  ipcMain.handle(
    CHANNELS.settingsSet,
    wrap((patch: Partial<SettingsShape>) => setSettings(db, patch))
  )
  ipcMain.handle(
    CHANNELS.settingsValidate,
    wrap(() => services.validateKey())
  )
  ipcMain.handle(
    CHANNELS.playerStats,
    wrap((name: string, opts?: { lifetime?: boolean; force?: boolean }) => services.playerStats(name, opts))
  )
  ipcMain.handle(
    CHANNELS.matchListMine,
    wrap((limit?: number) => matches.listMyMatches(limit))
  )
  ipcMain.handle(
    CHANNELS.matchGet,
    wrap((id: string) => matches.getMatch(id))
  )
  ipcMain.handle(
    CHANNELS.pollerStatus,
    wrap(() => poller.status())
  )
  ipcMain.handle(
    CHANNELS.pollerSetEnabled,
    wrap((enabled: boolean) => {
      setSettings(db, { pollEnabled: enabled })
      if (enabled) poller.start()
      else poller.stop()
      return poller.status()
    })
  )
  ipcMain.handle(
    CHANNELS.squadList,
    wrap(() => squad.list())
  )
  ipcMain.handle(
    CHANNELS.squadAdd,
    wrap((name: string) => squad.add(name))
  )
  ipcMain.handle(
    CHANNELS.squadRemove,
    wrap((id: number) => squad.remove(id))
  )
  ipcMain.handle(
    CHANNELS.squadCompare,
    wrap((mode: GameMode) => squad.compare(mode))
  )
  ipcMain.handle(
    CHANNELS.hudTeammateStats,
    wrap((names: string[], mode?: GameMode) => squad.statsForNames(names, mode ?? 'squad'))
  )
  ipcMain.handle(
    CHANNELS.hudSimulateRoster,
    wrap((entries: RosterEntry[]) => {
      tracker.upsertMany(entries)
      const snapshot = tracker.snapshot()
      deps.broadcastHud(snapshot)
      return snapshot
    })
  )
  ipcMain.handle(
    CHANNELS.hudSnapshot,
    wrap(() => tracker.snapshot())
  )
  ipcMain.handle(
    CHANNELS.mapimgGet,
    wrap((mapId: string) => mapimg.get(mapId))
  )
  ipcMain.handle(
    CHANNELS.overlayToggle,
    wrap((kind: OverlayKind) => overlay.toggle(kind))
  )
  // ---- 浮窗窗口自身控制:作用于消息发送方所在窗口 ----
  type OverlayWin = BrowserWindow & { __normalBounds?: Electron.Rectangle; __minSize?: [number, number] }
  const senderWin = (e: IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender) as OverlayWin | null

  const CHIP = 36 // 收起后的小图标尺寸
  ipcMain.handle(CHANNELS.overlayWinCollapse, (e, collapsed: boolean): Envelope<undefined> => {
    const win = senderWin(e)
    if (!win) return { ok: false, error: { code: 'UNKNOWN', message: '找不到发送方窗口' } }
    const { x, y } = win.getBounds()
    if (collapsed) {
      win.__normalBounds = win.getBounds()
      win.setMinimumSize(CHIP, CHIP)
      win.setBounds({ x, y, width: CHIP, height: CHIP })
    } else {
      const n = win.__normalBounds
      if (n) win.setBounds({ x, y, width: n.width, height: n.height })
      const [mw, mh] = win.__minSize ?? [CHIP, CHIP]
      win.setMinimumSize(mw, mh)
    }
    return { ok: true, data: undefined }
  })

  ipcMain.handle(CHANNELS.overlayWinIgnoreMouse, (e, ignore: boolean): Envelope<undefined> => {
    const win = senderWin(e)
    if (!win) return { ok: false, error: { code: 'UNKNOWN', message: '找不到发送方窗口' } }
    // forward: true 让 mousemove 依然到达页面,页面据此在悬停固定按钮时临时解除穿透
    win.setIgnoreMouseEvents(ignore, { forward: true })
    return { ok: true, data: undefined }
  })

  ipcMain.handle(CHANNELS.overlayWinGetPosition, (e): Envelope<{ x: number; y: number }> => {
    const win = senderWin(e)
    if (!win) return { ok: false, error: { code: 'UNKNOWN', message: '找不到发送方窗口' } }
    const [x, y] = win.getPosition()
    return { ok: true, data: { x, y } }
  })

  ipcMain.handle(CHANNELS.overlayWinSetPosition, (e, x: number, y: number): Envelope<undefined> => {
    const win = senderWin(e)
    if (!win) return { ok: false, error: { code: 'UNKNOWN', message: '找不到发送方窗口' } }
    win.setPosition(Math.round(x), Math.round(y))
    return { ok: true, data: undefined }
  })

  ipcMain.handle(
    CHANNELS.markerList,
    wrap((mapId: string) => listMarkers(db, mapId))
  )
  ipcMain.handle(
    CHANNELS.markerSave,
    wrap((m: { mapId: string; type: MarkerType; x: number; y: number; note?: string | null }) => saveMarker(db, m))
  )
  ipcMain.handle(
    CHANNELS.markerRemove,
    wrap((id: number) => removeMarker(db, id))
  )
  ipcMain.handle(
    CHANNELS.analysisDeathProfile,
    wrap(() => telemetry.deathProfile())
  )
  ipcMain.handle(
    CHANNELS.analysisLandings,
    wrap((mapId: string) => telemetry.landings(mapId))
  )
  ipcMain.handle(
    CHANNELS.analysisBackfill,
    wrap((limit?: number) => telemetry.backfill(limit))
  )
}
