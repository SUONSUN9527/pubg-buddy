import type { DB } from '../db/index'
import * as repos from '../db/repos'
import { AppError, PubgClient } from '../pubg/client'
import { many } from '../pubg/jsonapi'
import { parseSeasonBatch } from '../pubg/seasonBatch'
import type { GameMode, SquadCompareResult, SquadCompareRow, SquadMember } from '@shared/types'

const TTL_STATS = 10 * 60 * 1000

export interface SquadServices {
  list(): SquadMember[]
  add(name: string): SquadMember
  remove(id: number): void
  /** 全员某模式赛季数据对比:名字解析 + 数据拉取各只用 1 次批量请求 */
  compare(mode: GameMode): Promise<SquadCompareResult>
  /** 任意名字列表(≤10)的批量战绩,HUD 队友面板用;走同一套解析/缓存/批量管线 */
  statsForNames(names: string[], mode: GameMode): Promise<SquadCompareRow[]>
}

export function createSquadServices(
  db: DB,
  client: PubgClient,
  currentSeasonId: (force?: boolean) => Promise<string>
): SquadServices {
  const shard = () => repos.getSettings(db).shard

  /** 把还没有 accountId 的成员用一次批量名字查询解析掉;查不到的保持 null。id>0 的是车队成员,顺带回写库 */
  async function resolveMissing(members: SquadMember[]): Promise<void> {
    const missing = members.filter((m) => !m.accountId)
    if (missing.length === 0) return
    const filter = missing.map((m) => encodeURIComponent(m.name)).join(',')
    let doc
    try {
      doc = await client.get(shard(), `/players?filter[playerNames]=${filter}`)
    } catch (e) {
      if (e instanceof AppError && e.code === 'NOT_FOUND') return // 一个都没查到
      throw e
    }
    const byName = new Map(many(doc).map((res) => [res.attributes?.name as string, res.id]))
    for (const m of missing) {
      const accountId = byName.get(m.name)
      if (accountId) {
        if (m.id > 0) repos.setSquadAccountId(db, m.id, accountId)
        repos.upsertPlayer(db, { accountId, name: m.name, shard: shard() })
        m.accountId = accountId
      }
    }
  }

  /** 解析 → 命中缓存 → 缺的合并一次批量请求。compare 与 statsForNames 共用 */
  async function compareRows(members: SquadMember[], mode: GameMode, seasonId: string): Promise<SquadCompareRow[]> {
    await resolveMissing(members)

    const rows: SquadCompareRow[] = []
    const need: string[] = []
    for (const m of members) {
      if (!m.accountId) {
        rows.push({ member: m, error: '查无此人,昵称需精确匹配、区分大小写' })
        continue
      }
      const cached = repos.getModeStatsCache(db, m.accountId, seasonId, mode, TTL_STATS)
      rows.push({ member: m, stats: cached ?? undefined })
      if (!cached) need.push(m.accountId)
    }

    if (need.length > 0) {
      const doc = await client.get(
        shard(),
        `/seasons/${seasonId}/gameMode/${mode}/players?filter[playerIds]=${need.join(',')}`
      )
      const statsMap = parseSeasonBatch(doc, mode)
      for (const row of rows) {
        const acc = row.member.accountId
        if (!acc || row.stats) continue
        const stats = statsMap.get(acc)
        if (stats) {
          repos.putModeStatsCache(db, acc, seasonId, mode, stats)
          row.stats = stats
        }
      }
    }
    return rows
  }

  async function compare(mode: GameMode): Promise<SquadCompareResult> {
    const seasonId = await currentSeasonId()
    const rows = await compareRows(repos.listSquad(db), mode, seasonId)
    return { seasonId, mode, rows, fetchedAt: Date.now() }
  }

  async function statsForNames(names: string[], mode: GameMode): Promise<SquadCompareRow[]> {
    const seasonId = await currentSeasonId()
    const members: SquadMember[] = names.slice(0, 10).map((name, i) => {
      const cached = repos.findPlayerByName(db, name.trim(), shard(), 7 * 24 * 60 * 60 * 1000)
      return { id: -(i + 1), name: name.trim(), accountId: cached?.accountId ?? null }
    })
    return compareRows(members, mode, seasonId)
  }

  return {
    list: () => repos.listSquad(db),
    add: (name) => repos.addSquadMember(db, name),
    remove: (id) => repos.removeSquadMember(db, id),
    compare,
    statsForNames
  }
}
