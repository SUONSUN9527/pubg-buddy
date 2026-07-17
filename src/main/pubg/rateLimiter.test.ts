import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimiter } from './rateLimiter'

describe('RateLimiter', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('窗口内放行 capacity 次,超出的等窗口滑动', async () => {
    const rl = new RateLimiter(2, 1000)
    const done: number[] = []

    void rl.acquire().then(() => done.push(1))
    void rl.acquire().then(() => done.push(2))
    void rl.acquire().then(() => done.push(3))

    await vi.advanceTimersByTimeAsync(0)
    expect(done).toEqual([1, 2])

    await vi.advanceTimersByTimeAsync(1100)
    expect(done).toEqual([1, 2, 3])
  })

  it('interactive 永远排在 background 前面', async () => {
    const rl = new RateLimiter(1, 1000)
    const order: string[] = []

    void rl.acquire('interactive').then(() => order.push('first'))
    // 占掉唯一令牌后,先排队一个 background,再排队一个 interactive
    void rl.acquire('background').then(() => order.push('bg'))
    void rl.acquire('interactive').then(() => order.push('ui'))

    await vi.advanceTimersByTimeAsync(0)
    expect(order).toEqual(['first'])

    // 窗口滑两次,interactive 应先于 background 拿到令牌
    await vi.advanceTimersByTimeAsync(1100)
    expect(order).toEqual(['first', 'ui'])
    await vi.advanceTimersByTimeAsync(1100)
    expect(order).toEqual(['first', 'ui', 'bg'])
  })

  it('remaining 反映窗口内剩余配额', async () => {
    const rl = new RateLimiter(3, 1000)
    expect(rl.remaining()).toBe(3)
    await rl.acquire()
    await rl.acquire()
    expect(rl.remaining()).toBe(1)
    await vi.advanceTimersByTimeAsync(1100)
    expect(rl.remaining()).toBe(3)
  })
})
