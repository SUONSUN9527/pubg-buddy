import type { GameMode, GameModeStats } from '@shared/types'
import { many, relIds, type Doc } from './jsonapi'

/**
 * 解析批量赛季数据响应(GET /seasons/{id}/gameMode/{mode}/players?filter[playerIds]=…):
 * data[] 是 playerSeason 资源,gameModeStats 只含请求的那个模式。
 * 返回 accountId → 该模式数据 的映射(纯函数,可单测)。
 */
export function parseSeasonBatch(doc: Doc, mode: GameMode): Map<string, GameModeStats> {
  const map = new Map<string, GameModeStats>()
  for (const res of many(doc)) {
    const accountId = relIds(res, 'player')[0]
    const stats = (res.attributes?.gameModeStats as Partial<Record<GameMode, GameModeStats>> | undefined)?.[mode]
    if (accountId && stats) map.set(accountId, stats)
  }
  return map
}
