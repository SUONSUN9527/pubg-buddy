export type Priority = 'interactive' | 'background'

/**
 * 滑动窗口令牌桶:窗口内最多 capacity 次。
 * 两级优先:用户交互请求永远排在后台轮询/预取之前,防止轮询器饿死页面查询。
 */
export class RateLimiter {
  private stamps: number[] = []
  private queues: Record<Priority, Array<() => void>> = { interactive: [], background: [] }
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private capacity = 10,
    private windowMs = 60_000,
    private now: () => number = Date.now
  ) {}

  acquire(priority: Priority = 'interactive'): Promise<void> {
    return new Promise((resolve) => {
      this.queues[priority].push(resolve)
      this.pump()
    })
  }

  /** 当前窗口剩余配额(诊断用) */
  remaining(): number {
    const t = this.now()
    this.stamps = this.stamps.filter((s) => t - s < this.windowMs)
    return this.capacity - this.stamps.length
  }

  private pump(): void {
    const t = this.now()
    this.stamps = this.stamps.filter((s) => t - s < this.windowMs)

    while (this.stamps.length < this.capacity) {
      const next = this.queues.interactive.shift() ?? this.queues.background.shift()
      if (!next) return
      this.stamps.push(this.now())
      next()
    }

    const pending = this.queues.interactive.length + this.queues.background.length
    if (pending > 0 && !this.timer) {
      const wait = Math.max(this.stamps[0] + this.windowMs - t + 5, 5)
      this.timer = setTimeout(() => {
        this.timer = null
        this.pump()
      }, wait)
      this.timer.unref?.()
    }
  }
}
