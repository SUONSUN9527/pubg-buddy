import { describe, expect, it } from 'vitest'
import { parseMatchDoc } from './matchParse'
import type { Doc } from './jsonapi'

const participant = (id: string, name: string, stats: Record<string, unknown>) => ({
  type: 'participant',
  id,
  attributes: { stats: { name, playerId: `account.${name}`, ...stats } }
})

/** 2 队 4 人的最小比赛文档,形状对齐官方 /matches/{id} 响应 */
const matchDoc: Doc = {
  data: {
    type: 'match',
    id: 'match-001',
    attributes: {
      createdAt: '2026-07-17T12:00:00Z',
      duration: 1730,
      gameMode: 'squad',
      mapName: 'Baltic_Main',
      isCustomMatch: false,
      shardId: 'steam'
    },
    relationships: {
      rosters: {
        data: [
          { type: 'roster', id: 'r-win' },
          { type: 'roster', id: 'r-2nd' }
        ]
      },
      assets: { data: [{ type: 'asset', id: 'a-tele' }] }
    }
  },
  included: [
    {
      type: 'roster',
      id: 'r-win',
      attributes: { stats: { rank: 1, teamId: 7 }, won: 'true' },
      relationships: {
        participants: {
          data: [
            { type: 'participant', id: 'p-1' },
            { type: 'participant', id: 'p-2' }
          ]
        }
      }
    },
    {
      type: 'roster',
      id: 'r-2nd',
      attributes: { stats: { rank: 2, teamId: 3 }, won: 'false' },
      relationships: {
        participants: {
          data: [
            { type: 'participant', id: 'p-3' },
            { type: 'participant', id: 'p-4' }
          ]
        }
      }
    },
    participant('p-1', 'Alice', { kills: 5, damageDealt: 612.4, DBNOs: 3, timeSurvived: 1730, winPlace: 1 }),
    participant('p-2', 'Bob', { kills: 2, damageDealt: 231.1, DBNOs: 1, timeSurvived: 1730, winPlace: 1 }),
    participant('p-3', 'Carol', { kills: 7, damageDealt: 890.0, DBNOs: 5, timeSurvived: 1650, winPlace: 2 }),
    participant('p-4', 'Dave', { kills: 0, damageDealt: 45.5, DBNOs: 0, timeSurvived: 900, winPlace: 2 }),
    {
      type: 'asset',
      id: 'a-tele',
      attributes: { URL: 'https://telemetry-cdn.pubg.com/bluehole-pubg/steam/2026/07/17/match-001-telemetry.json', name: 'telemetry' }
    }
  ]
}

describe('parseMatchDoc', () => {
  const detail = parseMatchDoc(matchDoc)

  it('解析比赛元信息', () => {
    expect(detail.id).toBe('match-001')
    expect(detail.mapName).toBe('Baltic_Main')
    expect(detail.gameMode).toBe('squad')
    expect(detail.duration).toBe(1730)
    expect(detail.isCustom).toBe(false)
    expect(detail.numTeams).toBe(2)
    expect(detail.telemetryUrl).toContain('telemetry.json')
  })

  it('把 participant 挂到 roster 并带上队伍名次', () => {
    expect(detail.players).toHaveLength(4)
    const alice = detail.players.find((p) => p.name === 'Alice')!
    expect(alice).toMatchObject({ teamRank: 1, rosterId: 'r-win', kills: 5, dbnos: 3, winPlace: 1 })
    expect(alice.accountId).toBe('account.Alice')
    const carol = detail.players.find((p) => p.name === 'Carol')!
    expect(carol.teamRank).toBe(2)
  })

  it('按队伍名次、组内击杀排序', () => {
    expect(detail.players.map((p) => p.name)).toEqual(['Alice', 'Bob', 'Carol', 'Dave'])
  })
})
