import type { DB } from './index'
import type {
  GameModeStats,
  MapMarker,
  MarkerType,
  MatchDetail,
  MatchSummary,
  PlayerSummary,
  SettingsShape,
  Shard,
  SquadMember
} from '@shared/types'

const now = () => Date.now()

// ---------- settings ----------

const SETTINGS_DEFAULTS: SettingsShape = {
  apiKey: '',
  playerName: '',
  shard: 'steam',
  pollEnabled: false
}

export function getSettings(db: DB): SettingsShape {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return {
    apiKey: map.apiKey ?? SETTINGS_DEFAULTS.apiKey,
    playerName: map.playerName ?? SETTINGS_DEFAULTS.playerName,
    shard: (map.shard as Shard) ?? SETTINGS_DEFAULTS.shard,
    pollEnabled: map.pollEnabled === '1'
  }
}

export function setSettings(db: DB, patch: Partial<SettingsShape>): SettingsShape {
  const upsert = db.prepare(
    'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
  const tx = db.transaction(() => {
    if (patch.apiKey !== undefined) upsert.run('apiKey', patch.apiKey.trim())
    if (patch.playerName !== undefined) upsert.run('playerName', patch.playerName.trim())
    if (patch.shard !== undefined) upsert.run('shard', patch.shard)
    if (patch.pollEnabled !== undefined) upsert.run('pollEnabled', patch.pollEnabled ? '1' : '0')
  })
  tx()
  return getSettings(db)
}

// ---------- players(名字 ↔ accountId 映射缓存)----------

export function findPlayerByName(db: DB, name: string, shard: Shard, maxAgeMs: number): PlayerSummary | null {
  const row = db
    .prepare('SELECT account_id, name, shard FROM players WHERE name = ? AND shard = ? AND updated_at > ?')
    .get(name, shard, now() - maxAgeMs) as { account_id: string; name: string; shard: Shard } | undefined
  return row ? { accountId: row.account_id, name: row.name, shard: row.shard } : null
}

export function upsertPlayer(db: DB, p: PlayerSummary): void {
  db.prepare(
    `INSERT INTO players(account_id, name, shard, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET name = excluded.name, shard = excluded.shard, updated_at = excluded.updated_at`
  ).run(p.accountId, p.name, p.shard, now())
}

// ---------- seasons ----------

export function getCurrentSeason(db: DB, maxAgeMs: number): string | null {
  const row = db
    .prepare('SELECT id FROM seasons WHERE is_current = 1 AND updated_at > ? LIMIT 1')
    .get(now() - maxAgeMs) as { id: string } | undefined
  return row?.id ?? null
}

export function replaceSeasons(db: DB, seasons: Array<{ id: string; isCurrent: boolean }>): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM seasons').run()
    const ins = db.prepare('INSERT INTO seasons(id, is_current, updated_at) VALUES (?, ?, ?)')
    const t = now()
    for (const s of seasons) ins.run(s.id, s.isCurrent ? 1 : 0, t)
  })
  tx()
}

// ---------- season_stats 缓存 ----------

export function getStatsCache(
  db: DB,
  accountId: string,
  seasonId: string,
  maxAgeMs: number
): { statsJson: string; fetchedAt: number } | null {
  const row = db
    .prepare(
      "SELECT stats_json, fetched_at FROM season_stats WHERE account_id = ? AND season_id = ? AND game_mode = 'all' AND fetched_at > ?"
    )
    .get(accountId, seasonId, now() - maxAgeMs) as { stats_json: string; fetched_at: number } | undefined
  return row ? { statsJson: row.stats_json, fetchedAt: row.fetched_at } : null
}

export function putStatsCache(db: DB, accountId: string, seasonId: string, statsJson: string): void {
  db.prepare(
    `INSERT INTO season_stats(account_id, season_id, game_mode, stats_json, fetched_at) VALUES (?, ?, 'all', ?, ?)
     ON CONFLICT(account_id, season_id, game_mode) DO UPDATE SET stats_json = excluded.stats_json, fetched_at = excluded.fetched_at`
  ).run(accountId, seasonId, statsJson, now())
}

// ---------- matches(永久入库)----------

export function hasMatch(db: DB, id: string): boolean {
  return Boolean(db.prepare('SELECT 1 FROM matches WHERE id = ?').get(id))
}

export function insertMatch(db: DB, detail: MatchDetail, rawJson: string, shard: Shard): void {
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT OR REPLACE INTO matches(id, shard, map_name, game_mode, played_at, duration, is_custom, telemetry_url, raw_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      detail.id,
      shard,
      detail.mapName,
      detail.gameMode,
      detail.playedAt,
      detail.duration,
      detail.isCustom ? 1 : 0,
      detail.telemetryUrl,
      rawJson,
      now()
    )
    db.prepare('DELETE FROM match_players WHERE match_id = ?').run(detail.id)
    const ins = db.prepare(
      `INSERT INTO match_players(match_id, account_id, name, roster_id, team_rank, kills, damage, dbnos, survive_time, win_place)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const p of detail.players)
      ins.run(detail.id, p.accountId, p.name, p.rosterId, p.teamRank, p.kills, p.damage, p.dbnos, p.surviveTime, p.winPlace)
  })
  tx()
}

export function getMatchRaw(db: DB, id: string): string | null {
  const row = db.prepare('SELECT raw_json FROM matches WHERE id = ?').get(id) as { raw_json: string } | undefined
  return row?.raw_json ?? null
}

export function buildMatchSummary(db: DB, id: string, myName: string): MatchSummary | null {
  const meta = db
    .prepare('SELECT map_name, game_mode, played_at, duration FROM matches WHERE id = ?')
    .get(id) as { map_name: string; game_mode: string; played_at: string; duration: number } | undefined
  if (!meta) return null
  const teams = db
    .prepare('SELECT COUNT(DISTINCT roster_id) AS n FROM match_players WHERE match_id = ?')
    .get(id) as { n: number }
  const me = db
    .prepare('SELECT team_rank, kills, damage, win_place FROM match_players WHERE match_id = ? AND name = ?')
    .get(id, myName) as { team_rank: number; kills: number; damage: number; win_place: number } | undefined
  return {
    id,
    mapName: meta.map_name,
    gameMode: meta.game_mode,
    playedAt: meta.played_at,
    duration: meta.duration,
    numTeams: teams.n,
    me: me ? { teamRank: me.team_rank, kills: me.kills, damage: me.damage, winPlace: me.win_place } : undefined
  }
}

// ---------- squad(车队名单)----------

const MAX_SQUAD = 10

export function listSquad(db: DB): SquadMember[] {
  const rows = db
    .prepare('SELECT id, name, account_id FROM squad_members ORDER BY sort, id')
    .all() as Array<{ id: number; name: string; account_id: string | null }>
  return rows.map((r) => ({ id: r.id, name: r.name, accountId: r.account_id }))
}

export function addSquadMember(db: DB, name: string): SquadMember {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('昵称不能为空')
  const count = (db.prepare('SELECT COUNT(*) AS n FROM squad_members').get() as { n: number }).n
  if (count >= MAX_SQUAD) throw new Error(`车队最多 ${MAX_SQUAD} 人(批量接口的上限)`)
  const dup = db.prepare('SELECT 1 FROM squad_members WHERE name = ?').get(trimmed)
  if (dup) throw new Error(`「${trimmed}」已在车队里`)

  // 名字若已在 players 缓存里,直接带上 accountId,省一次解析
  const known = db.prepare('SELECT account_id FROM players WHERE name = ?').get(trimmed) as
    | { account_id: string }
    | undefined
  const info = db
    .prepare('INSERT INTO squad_members(name, account_id, sort) VALUES (?, ?, ?)')
    .run(trimmed, known?.account_id ?? null, count)
  return { id: Number(info.lastInsertRowid), name: trimmed, accountId: known?.account_id ?? null }
}

export function removeSquadMember(db: DB, id: number): void {
  db.prepare('DELETE FROM squad_members WHERE id = ?').run(id)
}

export function setSquadAccountId(db: DB, id: number, accountId: string): void {
  db.prepare('UPDATE squad_members SET account_id = ? WHERE id = ?').run(accountId, id)
}

// ---------- season_stats 按模式缓存(车队批量接口用)----------

export function getModeStatsCache(
  db: DB,
  accountId: string,
  seasonId: string,
  mode: string,
  maxAgeMs: number
): GameModeStats | null {
  const row = db
    .prepare(
      'SELECT stats_json FROM season_stats WHERE account_id = ? AND season_id = ? AND game_mode = ? AND fetched_at > ?'
    )
    .get(accountId, seasonId, mode, now() - maxAgeMs) as { stats_json: string } | undefined
  return row ? (JSON.parse(row.stats_json) as GameModeStats) : null
}

export function putModeStatsCache(db: DB, accountId: string, seasonId: string, mode: string, stats: GameModeStats): void {
  db.prepare(
    `INSERT INTO season_stats(account_id, season_id, game_mode, stats_json, fetched_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(account_id, season_id, game_mode) DO UPDATE SET stats_json = excluded.stats_json, fetched_at = excluded.fetched_at`
  ).run(accountId, seasonId, mode, JSON.stringify(stats), now())
}

// ---------- map_markers(M5) ----------

export function listMarkers(db: DB, mapId: string): MapMarker[] {
  const rows = db
    .prepare('SELECT id, map_id, type, x, y, note, source FROM map_markers WHERE map_id = ? ORDER BY id')
    .all(mapId) as Array<{
    id: number
    map_id: string
    type: MarkerType
    x: number
    y: number
    note: string | null
    source: MapMarker['source']
  }>
  return rows.map((r) => ({ id: r.id, mapId: r.map_id, type: r.type, x: r.x, y: r.y, note: r.note, source: r.source }))
}

export function saveMarker(
  db: DB,
  m: { mapId: string; type: MarkerType; x: number; y: number; note?: string | null }
): MapMarker {
  const info = db
    .prepare("INSERT INTO map_markers(map_id, type, x, y, note, source, created_at) VALUES (?, ?, ?, ?, ?, 'user', ?)")
    .run(m.mapId, m.type, m.x, m.y, m.note ?? null, now())
  return { id: Number(info.lastInsertRowid), mapId: m.mapId, type: m.type, x: m.x, y: m.y, note: m.note ?? null, source: 'user' }
}

export function removeMarker(db: DB, id: number): void {
  db.prepare('DELETE FROM map_markers WHERE id = ?').run(id)
}

// ---------- poll_state ----------

export function getPollState(db: DB, accountId: string): string | null {
  const row = db.prepare('SELECT last_match_id FROM poll_state WHERE account_id = ?').get(accountId) as
    | { last_match_id: string | null }
    | undefined
  return row?.last_match_id ?? null
}

export function setPollState(db: DB, accountId: string, matchId: string): void {
  db.prepare(
    `INSERT INTO poll_state(account_id, last_match_id, checked_at) VALUES (?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET last_match_id = excluded.last_match_id, checked_at = excluded.checked_at`
  ).run(accountId, matchId, now())
}
