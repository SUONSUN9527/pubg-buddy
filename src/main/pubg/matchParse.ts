import type { MatchDetail, MatchPlayer } from '@shared/types'
import { includedIndex, one, relIds, type Doc } from './jsonapi'

/**
 * 把 /matches/{id} 的 JSON:API 文档解析为 MatchDetail(纯函数,可单测)。
 * participant 属于 roster,roster 带队伍名次;telemetry 链接在 asset 里。
 */
export function parseMatchDoc(doc: Doc): MatchDetail {
  const match = one(doc)
  const idx = includedIndex(doc)
  const attrs = match.attributes ?? {}

  const players: MatchPlayer[] = []
  let numTeams = 0
  let telemetryUrl: string | null = null

  for (const res of doc.included ?? []) {
    if (res.type === 'roster') {
      numTeams++
      const stats = (res.attributes?.stats ?? {}) as { rank?: number }
      const teamRank = stats.rank ?? 0
      for (const pid of relIds(res, 'participants')) {
        const part = idx.get(`participant:${pid}`)
        if (!part) continue
        const s = (part.attributes?.stats ?? {}) as Record<string, unknown>
        players.push({
          name: (s.name as string) ?? '',
          accountId: (s.playerId as string) ?? '',
          rosterId: res.id,
          teamRank,
          kills: (s.kills as number) ?? 0,
          damage: (s.damageDealt as number) ?? 0,
          dbnos: (s.DBNOs as number) ?? 0,
          surviveTime: (s.timeSurvived as number) ?? 0,
          winPlace: (s.winPlace as number) ?? 0
        })
      }
    } else if (res.type === 'asset' && !telemetryUrl) {
      telemetryUrl = (res.attributes?.URL as string) ?? null
    }
  }

  players.sort((a, b) => a.teamRank - b.teamRank || b.kills - a.kills)

  return {
    id: match.id,
    mapName: (attrs.mapName as string) ?? '',
    gameMode: (attrs.gameMode as string) ?? '',
    playedAt: (attrs.createdAt as string) ?? '',
    duration: (attrs.duration as number) ?? 0,
    isCustom: Boolean(attrs.isCustomMatch),
    telemetryUrl,
    numTeams,
    players
  }
}
