import { BrowserWindow, globalShortcut } from 'electron'
import { join } from 'node:path'
import log from 'electron-log/main'
import type { OverlayKind } from '@shared/types'

interface OverlayConfig {
  width: number
  height: number
  route: string
  shortcut: string
}

// 高度按内容精确计算:map = 标题栏30 + 图层栏30 + 地图区(等宽正方形)620 + 边框2
// teams = 标题栏22 + 5行×(17+2) + 内边距8 + 边框2
const CONFIG: Record<OverlayKind, OverlayConfig> = {
  map: { width: 620, height: 684, route: '/overlay/map', shortcut: 'F8' },
  teams: { width: 248, height: 132, route: '/overlay/teams', shortcut: 'F9' }
}

/**
 * 独立透明浮窗管理:地图标记窗(F8)与队伍存活窗(F9)。
 * 当前为置顶透明窗形态(游戏需无边框窗口化);Windows 上接 ow-electron
 * overlay 包后可升级为注入式游戏内叠加层,窗口内容不变。
 */
export class OverlayManager {
  private wins = new Map<OverlayKind, BrowserWindow>()

  constructor(private preloadPath: string) {}

  toggle(kind: OverlayKind): boolean {
    const existing = this.wins.get(kind)
    if (existing) {
      existing.close()
      return false
    }
    const cfg = CONFIG[kind]
    const win = new BrowserWindow({
      width: cfg.width,
      height: cfg.height,
      minWidth: kind === 'teams' ? 200 : 380,
      minHeight: kind === 'teams' ? 110 : 380,
      frame: false,
      transparent: true,
      // 显式全透明背景:规避 macOS 透明窗口在 setBounds 缩放后变白底的已知问题
      backgroundColor: '#00000000',
      resizable: true,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
    win.setAlwaysOnTop(true, 'screen-saver')
    // 供"收起/展开"恢复最小尺寸约束
    ;(win as BrowserWindow & { __minSize?: [number, number] }).__minSize =
      kind === 'teams' ? [200, 110] : [380, 380]
    if (process.env.ELECTRON_RENDERER_URL) {
      void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${cfg.route}`)
    } else {
      void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: cfg.route })
    }
    win.on('closed', () => this.wins.delete(kind))
    this.wins.set(kind, win)
    return true
  }

  registerShortcuts(): void {
    for (const kind of Object.keys(CONFIG) as OverlayKind[]) {
      const ok = globalShortcut.register(CONFIG[kind].shortcut, () => this.toggle(kind))
      if (!ok) log.warn(`全局快捷键 ${CONFIG[kind].shortcut} 注册失败(可能被占用)`)
    }
  }

  closeAll(): void {
    for (const win of this.wins.values()) win.close()
  }
}
