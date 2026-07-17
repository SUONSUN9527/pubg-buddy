import { describe, expect, it } from 'vitest'
import { TeamTracker } from './teamTracker'
import type { RosterEntry } from './types'

const entry = (key: string, teamId: number, over: Partial<RosterEntry> = {}): RosterEntry => ({
  key,
  name: `Player_${key}`,
  teamId,
  out: false,
  isTeammate: false,
  ...over
})

describe('TeamTracker', () => {
  it('按队分组统计人数与存活', () => {
    const t = new TeamTracker()
    t.upsertMany([entry('a', 1), entry('b', 1), entry('c', 2), entry('d', 2)])
    expect(t.teams()).toEqual([
      { teamId: 1, total: 2, alive: 2 },
      { teamId: 2, total: 2, alive: 2 }
    ])
  })

  it('out 翻转后存活数下降,全灭时 alive=0', () => {
    const t = new TeamTracker()
    t.upsertMany([entry('a', 1), entry('b', 1)])
    t.upsertMany([entry('a', 1, { out: true })])
    expect(t.teams()[0]).toEqual({ teamId: 1, total: 2, alive: 1 })
    t.upsertMany([entry('b', 1, { out: true })])
    expect(t.teams()[0].alive).toBe(0)
  })

  it('蓝片召回:out 翻回 false 后存活数恢复', () => {
    const t = new TeamTracker()
    t.upsertMany([entry('a', 3, { out: true })])
    expect(t.teams()[0].alive).toBe(0)
    t.upsertMany([entry('a', 3, { out: false })])
    expect(t.teams()[0].alive).toBe(1)
  })

  it('中途加入的玩家并入已有队伍;队友单独筛出并排序', () => {
    const t = new TeamTracker()
    t.upsertMany([entry('a', 5, { name: 'Zed', isTeammate: true })])
    t.upsertMany([entry('b', 5, { name: 'Amy', isTeammate: true }), entry('c', 6)])
    expect(t.teams()).toHaveLength(2)
    expect(t.teams()[0].total).toBe(2)
    expect(t.teammates().map((e) => e.name)).toEqual(['Amy', 'Zed'])
  })

  it('teamId 为 null 的条目不计入队伍统计', () => {
    const t = new TeamTracker()
    t.upsertMany([entry('a', 1), entry('x', 0, { teamId: null })])
    expect(t.teams()).toHaveLength(1)
  })
})
