import { describe, expect, it } from 'vitest'
import { includedIndex, many, one, relIds, type Doc } from './jsonapi'

/** 按官方文档形状裁剪的 /players 响应 */
const playersDoc: Doc = {
  data: [
    {
      type: 'player',
      id: 'account.c0e530e9b7244b358def282782f893af',
      attributes: { name: 'shroud', shardId: 'steam', patchVersion: '', titleId: 'bluehole-pubg' },
      relationships: {
        matches: {
          data: [
            { type: 'match', id: '11111111-aaaa-bbbb-cccc-000000000001' },
            { type: 'match', id: '11111111-aaaa-bbbb-cccc-000000000002' }
          ]
        }
      }
    }
  ]
}

/** 按官方文档形状裁剪的 /matches/{id} 响应(带 included) */
const matchDoc: Doc = {
  data: {
    type: 'match',
    id: 'm-1',
    attributes: { mapName: 'Baltic_Main', gameMode: 'squad', duration: 1800, createdAt: '2026-07-17T10:00:00Z' },
    relationships: {
      rosters: { data: [{ type: 'roster', id: 'r-1' }] },
      assets: { data: [{ type: 'asset', id: 'a-1' }] }
    }
  },
  included: [
    { type: 'roster', id: 'r-1', attributes: { stats: { rank: 3, teamId: 7 } } },
    { type: 'asset', id: 'a-1', attributes: { URL: 'https://telemetry-cdn.pubg.com/xx.json', name: 'telemetry' } },
    { type: 'participant', id: 'p-1', attributes: { stats: { kills: 5, name: 'shroud' } } }
  ]
}

describe('jsonapi', () => {
  it('one/many 兼容单资源与数组', () => {
    expect(one(playersDoc).id).toBe('account.c0e530e9b7244b358def282782f893af')
    expect(many(playersDoc)).toHaveLength(1)
    expect(one(matchDoc).id).toBe('m-1')
    expect(many(matchDoc)).toHaveLength(1)
  })

  it('one 对空数组抛错', () => {
    expect(() => one({ data: [] })).toThrow()
  })

  it('includedIndex 按 type:id 索引', () => {
    const idx = includedIndex(matchDoc)
    expect(idx.get('roster:r-1')?.attributes?.stats).toEqual({ rank: 3, teamId: 7 })
    expect(idx.get('asset:a-1')).toBeDefined()
    expect(idx.size).toBe(3)
  })

  it('relIds 归一化单值/数组/缺失关系', () => {
    expect(relIds(one(playersDoc), 'matches')).toHaveLength(2)
    expect(relIds(one(matchDoc), 'rosters')).toEqual(['r-1'])
    expect(relIds(one(matchDoc), 'nonexistent')).toEqual([])
  })
})
