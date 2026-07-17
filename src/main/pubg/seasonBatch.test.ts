import { describe, expect, it } from 'vitest'
import { parseSeasonBatch } from './seasonBatch'
import type { Doc } from './jsonapi'

const batchDoc: Doc = {
  data: [
    {
      type: 'playerSeason',
      id: 'ps-1',
      attributes: {
        gameModeStats: {
          squad: { kills: 100, wins: 10, roundsPlayed: 80, losses: 70, damageDealt: 12000, top10s: 30 }
        }
      },
      relationships: {
        player: { data: { type: 'player', id: 'account.aaa' } },
        season: { data: { type: 'season', id: 's-1' } }
      }
    },
    {
      type: 'playerSeason',
      id: 'ps-2',
      attributes: {
        gameModeStats: {
          squad: { kills: 5, wins: 0, roundsPlayed: 12, losses: 12, damageDealt: 900, top10s: 2 }
        }
      },
      relationships: {
        player: { data: { type: 'player', id: 'account.bbb' } }
      }
    }
  ]
}

describe('parseSeasonBatch', () => {
  it('把每个 playerSeason 映射到 accountId', () => {
    const map = parseSeasonBatch(batchDoc, 'squad')
    expect(map.size).toBe(2)
    expect(map.get('account.aaa')?.kills).toBe(100)
    expect(map.get('account.bbb')?.roundsPlayed).toBe(12)
  })

  it('请求的模式没有数据时跳过该玩家', () => {
    const map = parseSeasonBatch(batchDoc, 'duo')
    expect(map.size).toBe(0)
  })
})
