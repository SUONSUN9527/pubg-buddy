import type { HudRosterEvent, RosterEntry, TeamAlive } from './types'

/**
 * 全场队伍存活状态机(纯逻辑,可单测)。
 * 输入是 GEP roster 条目流(或模拟注入),支持:
 * - 中途加入(airfield 阶段陆续上报)
 * - out 翻转(死亡/退出)
 * - out 翻回(蓝片召回复活)
 */
export class TeamTracker {
  private entries = new Map<string, RosterEntry>()

  reset(): void {
    this.entries.clear()
  }

  upsertMany(list: RosterEntry[]): void {
    for (const e of list) this.entries.set(e.key, { ...e })
  }

  teammates(): RosterEntry[] {
    return [...this.entries.values()].filter((e) => e.isTeammate).sort((a, b) => a.name.localeCompare(b.name))
  }

  teams(): TeamAlive[] {
    const map = new Map<number, TeamAlive>()
    for (const e of this.entries.values()) {
      if (e.teamId === null) continue
      let t = map.get(e.teamId)
      if (!t) {
        t = { teamId: e.teamId, total: 0, alive: 0 }
        map.set(e.teamId, t)
      }
      t.total++
      if (!e.out) t.alive++
    }
    return [...map.values()].sort((a, b) => a.teamId - b.teamId)
  }

  snapshot(): HudRosterEvent {
    return { teammates: this.teammates(), teams: this.teams() }
  }
}
