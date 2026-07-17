import type { DB } from '../db/index'
import * as repos from '../db/repos'
import { AppError, PubgClient } from '../pubg/client'
import { many, one } from '../pubg/jsonapi'
import type { GameMode, GameModeStats, PlayerStatsResult, PlayerSummary, ValidateResult } from '@shared/types'

const DAY = 24 * 60 * 60 * 1000
const TTL_PLAYER = 7 * DAY
const TTL_SEASONS = 1 * DAY
const TTL_STATS = 10 * 60 * 1000

export interface Services {
  playerStats(name: string, opts?: { lifetime?: boolean; force?: boolean }): Promise<PlayerStatsResult>
  validateKey(): Promise<ValidateResult>
  resolvePlayer(name: string): Promise<PlayerSummary>
  currentSeasonId(force?: boolean): Promise<string>
}

export function createServices(db: DB, client: PubgClient): Services {
  const shard = () => repos.getSettings(db).shard

  async function resolvePlayer(name: string): Promise<PlayerSummary> {
    const cached = repos.findPlayerByName(db, name, shard(), TTL_PLAYER)
    if (cached) return cached

    let doc
    try {
      doc = await client.get(shard(), `/players?filter[playerNames]=${encodeURIComponent(name)}`)
    } catch (e) {
      if (e instanceof AppError && e.code === 'NOT_FOUND')
        throw new AppError('NOT_FOUND', `没有找到玩家「${name}」。昵称需要精确匹配且区分大小写`)
      throw e
    }
    const resources = many(doc)
    if (resources.length === 0)
      throw new AppError('NOT_FOUND', `没有找到玩家「${name}」。昵称需要精确匹配且区分大小写`)

    const res = resources[0]
    const player: PlayerSummary = {
      accountId: res.id,
      name: (res.attributes?.name as string) ?? name,
      shard: shard()
    }
    repos.upsertPlayer(db, player)
    return player
  }

  async function currentSeasonId(force = false): Promise<string> {
    if (!force) {
      const cached = repos.getCurrentSeason(db, TTL_SEASONS)
      if (cached) return cached
    }
    const doc = await client.get(shard(), '/seasons')
    const seasons = many(doc).map((s) => ({
      id: s.id,
      isCurrent: Boolean(s.attributes?.isCurrentSeason)
    }))
    repos.replaceSeasons(db, seasons)
    const current = seasons.find((s) => s.isCurrent)
    if (!current) throw new AppError('UNKNOWN', '赛季列表里没有标记为当前的赛季')
    return current.id
  }

  async function fetchSeasonStats(accountId: string, seasonId: string): Promise<string> {
    const doc = await client.get(shard(), `/players/${accountId}/seasons/${seasonId}`)
    const stats = one(doc).attributes?.gameModeStats
    if (!stats) throw new AppError('UNKNOWN', '赛季数据响应缺少 gameModeStats 字段')
    return JSON.stringify(stats)
  }

  async function playerStats(
    name: string,
    opts: { lifetime?: boolean; force?: boolean } = {}
  ): Promise<PlayerStatsResult> {
    const player = await resolvePlayer(name.trim())
    let seasonId = opts.lifetime ? 'lifetime' : await currentSeasonId()

    let fromCache = true
    let cached = opts.force ? null : repos.getStatsCache(db, player.accountId, seasonId, TTL_STATS)
    if (!cached) {
      fromCache = false
      let json: string
      try {
        json = await fetchSeasonStats(player.accountId, seasonId)
      } catch (e) {
        // 赛季切换边界:缓存的"当前赛季"可能已过期,强刷赛季列表后重试一次
        if (e instanceof AppError && e.code === 'NOT_FOUND' && !opts.lifetime) {
          seasonId = await currentSeasonId(true)
          json = await fetchSeasonStats(player.accountId, seasonId)
        } else {
          throw e
        }
      }
      repos.putStatsCache(db, player.accountId, seasonId, json)
      cached = { statsJson: json, fetchedAt: Date.now() }
    }

    return {
      player,
      seasonId,
      isLifetime: Boolean(opts.lifetime),
      stats: JSON.parse(cached.statsJson) as Partial<Record<GameMode, GameModeStats>>,
      fetchedAt: cached.fetchedAt,
      fromCache
    }
  }

  async function validateKey(): Promise<ValidateResult> {
    try {
      await currentSeasonId(true)
      return { valid: true }
    } catch (e) {
      const message = e instanceof AppError ? e.message : (e as Error).message
      return { valid: false, message }
    }
  }

  return { playerStats, validateKey, resolvePlayer, currentSeasonId }
}
