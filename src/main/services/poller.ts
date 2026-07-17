import type { PollerStatus } from '@shared/types'

export type TickResult = 'skip' | 'init' | 'none' | 'new'

export interface PollerDeps {
  /** 绑定玩家的最新比赛;未配置/暂无比赛时返回 null */
  latest(): Promise<{ accountId: string; matchId: string } | null>
  getStored(accountId: string): string | null
  setStored(accountId: string, matchId: string): void
  /** 有新比赛:入库 + 通知(由调用方实现) */
  onNew(matchId: string): Promise<void>
}

/**
 * 单次轮询(纯逻辑,可单测)。
 * 首次见到某账号时只记录不通知,避免刚开启就把历史最新一局当"新比赛"弹出来。
 */
export async function pollTick(deps: PollerDeps): Promise<TickResult> {
  const latest = await deps.latest()
  if (!latest) return 'skip'

  const stored = deps.getStored(latest.accountId)
  if (stored === latest.matchId) return 'none'

  deps.setStored(latest.accountId, latest.matchId)
  if (!stored) return 'init'

  await deps.onNew(latest.matchId)
  return 'new'
}

export class MatchPoller {
  private timer: ReturnType<typeof setInterval> | null = null
  private ticking = false
  private lastCheckedAt: number | null = null
  private lastMatchId: string | null = null
  private lastError: string | null = null

  constructor(
    private deps: PollerDeps,
    private intervalMs = 60_000
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.tick(), this.intervalMs)
    void this.tick()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  status(): PollerStatus {
    return {
      enabled: this.timer !== null,
      running: this.ticking,
      lastCheckedAt: this.lastCheckedAt,
      lastMatchId: this.lastMatchId,
      lastError: this.lastError
    }
  }

  async tick(): Promise<void> {
    if (this.ticking) return
    this.ticking = true
    try {
      const result = await pollTick(this.deps)
      this.lastCheckedAt = Date.now()
      if (result !== 'skip') this.lastError = null
    } catch (e) {
      this.lastError = (e as Error).message
    } finally {
      this.ticking = false
    }
  }
}
