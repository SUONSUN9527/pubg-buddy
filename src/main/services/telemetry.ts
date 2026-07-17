import { gzipSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import log from 'electron-log/main'
import { MAP_WORLD_SIZE } from '@shared/maps'
import type { BackfillResult, DeathProfile, LandingPoint } from '@shared/types'
import type { DB } from '../db/index'
import { getSettings } from '../db/repos'
import { extractTelemetry, weaponDisplayName } from '../pubg/telemetryExtract'

export interface TelemetryServices {
  /** 下载 + 抽取 + 入库一场比赛的 telemetry;已解析/无链接时静默跳过 */
  downloadAndParse(matchId: string): Promise<'done' | 'skipped' | 'no-url'>
  /** 回填近期已入库比赛的 telemetry */
  backfill(limit?: number): Promise<BackfillResult>
  deathProfile(): DeathProfile
  landings(mapId: string): LandingPoint[]
}

export function createTelemetryServices(db: DB, dir: string): TelemetryServices {
  mkdirSync(dir, { recursive: true })

  async function downloadAndParse(matchId: string): Promise<'done' | 'skipped' | 'no-url'> {
    const parsed = db.prepare('SELECT 1 FROM tele_meta WHERE match_id = ?').get(matchId)
    if (parsed) return 'skipped'
    const row = db.prepare('SELECT telemetry_url, map_name FROM matches WHERE id = ?').get(matchId) as
      | { telemetry_url: string | null; map_name: string }
      | undefined
    if (!row?.telemetry_url) return 'no-url'

    // telemetry 在公开 CDN 上,免限流、无需鉴权
    const res = await fetch(row.telemetry_url, { headers: { 'Accept-Encoding': 'gzip' } })
    if (!res.ok) throw new Error(`telemetry 下载失败:HTTP ${res.status}`)
    const text = await res.text()
    const events = JSON.parse(text) as unknown[]

    const myName = getSettings(db).playerName
    const worldSize = MAP_WORLD_SIZE[row.map_name] ?? 816_000
    const { landings, kills } = extractTelemetry(events, worldSize)

    const tx = db.transaction(() => {
      const insLanding = db.prepare(
        'INSERT OR REPLACE INTO tele_landings(match_id, name, x, y, is_me) VALUES (?, ?, ?, ?, ?)'
      )
      for (const l of landings) insLanding.run(matchId, l.name, l.x, l.y, l.name === myName ? 1 : 0)
      const insKill = db.prepare(
        'INSERT INTO tele_kills(match_id, killer, victim, weapon, distance, x, y) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      for (const k of kills) insKill.run(matchId, k.killer, k.victim, k.weapon, k.distance, k.x, k.y)
      db.prepare('INSERT INTO tele_meta(match_id, my_name, parsed_at) VALUES (?, ?, ?)').run(
        matchId,
        myName,
        Date.now()
      )
    })
    tx()

    // 原始文件留档,将来新分析可重放(保留策略见 TECH 3.9,清理逻辑后续加)
    try {
      const path = join(dir, `${matchId}.json.gz`)
      writeFileSync(path, gzipSync(text))
      db.prepare('UPDATE matches SET telemetry_path = ? WHERE id = ?').run(path, matchId)
    } catch (e) {
      log.warn('telemetry 原始文件写盘失败(不影响分析):', e)
    }
    log.info(`telemetry 已解析:${matchId},落点 ${landings.length},击杀 ${kills.length}`)
    return 'done'
  }

  async function backfill(limit = 20): Promise<BackfillResult> {
    const rows = db
      .prepare(
        `SELECT m.id FROM matches m LEFT JOIN tele_meta t ON t.match_id = m.id
         WHERE m.telemetry_url IS NOT NULL AND t.match_id IS NULL
         ORDER BY m.played_at DESC LIMIT ?`
      )
      .all(limit) as Array<{ id: string }>
    const result: BackfillResult = { processed: 0, skipped: 0, failed: 0 }
    for (const { id } of rows) {
      try {
        const r = await downloadAndParse(id)
        if (r === 'done') result.processed++
        else result.skipped++
      } catch (e) {
        result.failed++
        log.warn(`telemetry 回填失败 ${id}:`, e)
      }
    }
    return result
  }

  function deathProfile(): DeathProfile {
    const myName = getSettings(db).playerName
    const deaths = db
      .prepare('SELECT killer, weapon, distance FROM tele_kills WHERE victim = ?')
      .all(myName) as Array<{ killer: string | null; weapon: string | null; distance: number }>

    const weaponCount = new Map<string, number>()
    const killerCount = new Map<string, number>()
    const buckets = [
      { label: '0~10m', min: 0, max: 10, count: 0 },
      { label: '10~50m', min: 10, max: 50, count: 0 },
      { label: '50~100m', min: 50, max: 100, count: 0 },
      { label: '100~200m', min: 100, max: 200, count: 0 },
      { label: '200m+', min: 200, max: Infinity, count: 0 }
    ]
    let distanceSum = 0
    for (const d of deaths) {
      const w = weaponDisplayName(d.weapon)
      weaponCount.set(w, (weaponCount.get(w) ?? 0) + 1)
      if (d.killer) killerCount.set(d.killer, (killerCount.get(d.killer) ?? 0) + 1)
      distanceSum += d.distance
      const b = buckets.find((b) => d.distance >= b.min && d.distance < b.max)
      if (b) b.count++
    }
    const top = (m: Map<string, number>, n: number) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)

    return {
      totalDeaths: deaths.length,
      avgDistance: deaths.length ? distanceSum / deaths.length : 0,
      byWeapon: top(weaponCount, 8).map(([weapon, count]) => ({ weapon, count })),
      buckets: buckets.map(({ label, count }) => ({ label, count })),
      topKillers: top(killerCount, 5).map(([name, count]) => ({ name, count }))
    }
  }

  function landings(mapId: string): LandingPoint[] {
    const rows = db
      .prepare(
        `SELECT l.match_id, l.x, l.y, mp.team_rank FROM tele_landings l
         JOIN matches m ON m.id = l.match_id
         LEFT JOIN match_players mp ON mp.match_id = l.match_id AND mp.name = l.name
         WHERE l.is_me = 1 AND m.map_name = ?`
      )
      .all(mapId) as Array<{ match_id: string; x: number; y: number; team_rank: number | null }>
    return rows.map((r) => ({ matchId: r.match_id, x: r.x, y: r.y, teamRank: r.team_rank }))
  }

  return { downloadAndParse, backfill, deathProfile, landings }
}
