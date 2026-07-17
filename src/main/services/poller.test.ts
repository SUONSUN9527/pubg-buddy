import { describe, expect, it, vi } from 'vitest'
import { pollTick, type PollerDeps } from './poller'

function makeDeps(latestId: string | null): PollerDeps & { stored: Map<string, string>; onNew: ReturnType<typeof vi.fn> } {
  const stored = new Map<string, string>()
  const onNew = vi.fn(async () => {})
  return {
    stored,
    onNew,
    latest: async () => (latestId ? { accountId: 'acc-1', matchId: latestId } : null),
    getStored: (acc) => stored.get(acc) ?? null,
    setStored: (acc, id) => void stored.set(acc, id)
  }
}

describe('pollTick', () => {
  it('未配置昵称(latest 为 null)时跳过', async () => {
    const deps = makeDeps(null)
    expect(await pollTick(deps)).toBe('skip')
    expect(deps.onNew).not.toHaveBeenCalled()
  })

  it('首次见到账号只记录、不通知', async () => {
    const deps = makeDeps('m-100')
    expect(await pollTick(deps)).toBe('init')
    expect(deps.stored.get('acc-1')).toBe('m-100')
    expect(deps.onNew).not.toHaveBeenCalled()
  })

  it('最新比赛没变化时安静返回', async () => {
    const deps = makeDeps('m-100')
    deps.stored.set('acc-1', 'm-100')
    expect(await pollTick(deps)).toBe('none')
    expect(deps.onNew).not.toHaveBeenCalled()
  })

  it('出现新比赛:更新记录并触发 onNew 一次', async () => {
    const deps = makeDeps('m-101')
    deps.stored.set('acc-1', 'm-100')
    expect(await pollTick(deps)).toBe('new')
    expect(deps.stored.get('acc-1')).toBe('m-101')
    expect(deps.onNew).toHaveBeenCalledTimes(1)
    expect(deps.onNew).toHaveBeenCalledWith('m-101')
  })
})
