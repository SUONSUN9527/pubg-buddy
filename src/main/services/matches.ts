import type { DB } from '../db/index'
import * as repos from '../db/repos'
import { AppError, PubgClient } from '../pubg/client'
import { one, relIds } from '../pubg/jsonapi'
import { parseMatchDoc } from '../pubg/matchParse'
import type { Priority } from '../pubg/rateLimiter'
import type { MatchDetail, MatchSummary, PlayerSummary } from '@shared/types'

export interface MatchServices {
  /** 比赛详情:本地库优先,未入库则走免限流通道拉取并入库 */
  getMatch(id: string): Promise<MatchDetail>
  /** 绑定玩家的近期比赛(近 14 天),逐场确保入库后返回摘要 */
  listMyMatches(limit?: number): Promise<MatchSummary[]>
  /** 轮询器用:绑定玩家的最新比赛 id;未配置昵称时返回 null */
  latestForPoll(): Promise<{ accountId: string; matchId: string } | null>
  /** 确保某场比赛已入库,返回其摘要(带我的成绩) */
  ensureStored(id: string): Promise<MatchSummary>
}

export function createMatchServices(
  db: DB,
  client: PubgClient,
  resolvePlayer: (name: string) => Promise<PlayerSummary>
): MatchServices {
  const settings = () => repos.getSettings(db)

  async function fetchAndStore(id: string): Promise<MatchDetail> {
    const doc = await client.get(settings().shard, `/matches/${id}`, { limited: false })
    const detail = parseMatchDoc(doc)
    repos.insertMatch(db, detail, JSON.stringify(doc), settings().shard)
    return detail
  }

  async function getMatch(id: string): Promise<MatchDetail> {
    const raw = repos.getMatchRaw(db, id)
    const detail = raw ? parseMatchDoc(JSON.parse(raw)) : await fetchAndStore(id)
    return { ...detail, myName: settings().playerName || undefined }
  }

  /** GET /players/{accountId} 的 relationships.matches 是近 14 天比赛 id 列表(新→旧) */
  async function myMatchIds(priority: Priority): Promise<{ accountId: string; ids: string[] }> {
    const name = settings().playerName
    if (!name) throw new AppError('UNKNOWN', '还没有绑定游戏昵称,请先到设置页填写')
    const player = await resolvePlayer(name)
    const doc = await client.get(settings().shard, `/players/${player.accountId}`, { priority })
    return { accountId: player.accountId, ids: relIds(one(doc), 'matches') }
  }

  async function ensureStored(id: string): Promise<MatchSummary> {
    if (!repos.hasMatch(db, id)) await fetchAndStore(id)
    const summary = repos.buildMatchSummary(db, id, settings().playerName)
    if (!summary) throw new AppError('UNKNOWN', `比赛 ${id} 入库失败`)
    return summary
  }

  async function listMyMatches(limit = 10): Promise<MatchSummary[]> {
    const { ids } = await myMatchIds('interactive')
    const result: MatchSummary[] = []
    for (const id of ids.slice(0, limit)) result.push(await ensureStored(id))
    return result
  }

  async function latestForPoll(): Promise<{ accountId: string; matchId: string } | null> {
    if (!settings().playerName) return null
    const { accountId, ids } = await myMatchIds('background')
    return ids.length > 0 ? { accountId, matchId: ids[0] } : null
  }

  return { getMatch, listMyMatches, latestForPoll, ensureStored }
}
