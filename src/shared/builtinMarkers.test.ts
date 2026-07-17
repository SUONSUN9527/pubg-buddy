import { describe, expect, it } from 'vitest'
import { BUILTIN_MARKERS } from './builtinMarkers'
import { MAP_NAMES } from './maps'

describe('BUILTIN_MARKERS', () => {
  it('坐标都在 0~1 归一化范围内', () => {
    for (const m of BUILTIN_MARKERS) {
      expect(m.x, `${m.mapId} ${m.type}`).toBeGreaterThanOrEqual(0)
      expect(m.x).toBeLessThanOrEqual(1)
      expect(m.y).toBeGreaterThanOrEqual(0)
      expect(m.y).toBeLessThanOrEqual(1)
    }
  })

  it('mapId 都是已知地图', () => {
    for (const m of BUILTIN_MARKERS) expect(MAP_NAMES[m.mapId], m.mapId).toBeDefined()
  })

  it('七张图都有导入且总量符合预期', () => {
    const maps = ['Kiki_Main', 'DihorOtok_Main', 'Desert_Main', 'Tiger_Main', 'Baltic_Main', 'Neon_Main', 'Chimera_Main']
    for (const id of maps) {
      expect(
        BUILTIN_MARKERS.filter((m) => m.mapId === id).length,
        id
      ).toBeGreaterThan(5)
    }
    expect(BUILTIN_MARKERS.length).toBeGreaterThan(300)
  })
})
