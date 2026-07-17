import log from 'electron-log/main'
import type { RosterEntry } from '@shared/types'

/**
 * GEP(Overwolf 游戏事件)事件源抽象。
 *
 * Windows 实机接入点(M4 后半,需 ow-electron):
 *   1. package.json 把 electron 换成 npm alias @overwolf/ow-electron
 *   2. app.overwolf.packages.on('ready') 后注册 gep 包,gameId 10906(PUBG)
 *   3. 把 roster 相关 info-update 归一化成 RosterEntry[] 喂给 onEntries
 *   4. spike 验证清单见 docs/TECH.md 3.6 节
 *
 * 在 macOS / 未安装 ow-electron 时返回不可用的空实现,
 * 开发期用 IPC 'hud:simulateRoster' 注入模拟数据走完全一样的下游管线。
 */
export interface GepSource {
  readonly available: boolean
  start(onEntries: (entries: RosterEntry[]) => void): void
  stop(): void
}

class NullGepSource implements GepSource {
  readonly available = false
  start(): void {
    log.info('GEP 事件源不可用(非 Windows/ow-electron),HUD 走模拟注入')
  }
  stop(): void {}
}

export function createGepSource(): GepSource {
  // ow-electron 的 gep 包只存在于 Windows 运行时;接入时在这里替换实现
  return new NullGepSource()
}
