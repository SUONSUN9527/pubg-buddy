import { describe, expect, it } from 'vitest'
import { extractTelemetry, weaponDisplayName } from './telemetryExtract'

/** 按官方 telemetry 事件形状裁剪的最小 fixture */
const events = [
  { _T: 'LogMatchStart', mapName: 'Baltic_Main' },
  {
    _T: 'LogParachuteLanding',
    character: { name: 'Alice', teamId: 1, location: { x: 408000, y: 204000, z: 100 } }
  },
  {
    _T: 'LogPlayerKillV2',
    killer: { name: 'Bob', location: { x: 100000, y: 100000 } },
    victim: { name: 'Alice', location: { x: 102000, y: 100000 } },
    finishDamageInfo: { damageCauserName: 'WeapHK416_C', damageReason: 'HeadShot', distance: 2000 }
  },
  {
    // 毒圈死亡:无凶手
    _T: 'LogPlayerKillV2',
    killer: null,
    victim: { name: 'Carol', location: { x: 500000, y: 500000 } },
    finishDamageInfo: { damageCauserName: 'BlueZone', distance: 0 }
  },
  { _T: 'LogPlayerPosition', character: { name: 'Noise' } }
]

describe('extractTelemetry', () => {
  const result = extractTelemetry(events, 816000)

  it('抽取落点并按地图边长归一化', () => {
    expect(result.landings).toHaveLength(1)
    expect(result.landings[0].name).toBe('Alice')
    expect(result.landings[0].x).toBeCloseTo(0.5)
    expect(result.landings[0].y).toBeCloseTo(0.25)
  })

  it('抽取击杀:武器、距离(厘米→米)、死亡位置', () => {
    const kill = result.kills.find((k) => k.victim === 'Alice')!
    expect(kill.killer).toBe('Bob')
    expect(kill.weapon).toBe('WeapHK416_C')
    expect(kill.distance).toBe(20)
    expect(kill.x).toBeCloseTo(102000 / 816000)
  })

  it('毒圈死亡 killer 为 null', () => {
    const zone = result.kills.find((k) => k.victim === 'Carol')!
    expect(zone.killer).toBeNull()
  })

  it('武器名转可读', () => {
    expect(weaponDisplayName('WeapHK416_C')).toBe('HK416')
    expect(weaponDisplayName(null)).toBe('未知')
  })
})
