/** telemetry 事件抽取(纯函数,可单测)。坐标按地图边长归一化到 0~1,距离换算成米 */

export interface ExtractedLanding {
  name: string
  x: number
  y: number
}

export interface ExtractedKill {
  killer: string | null
  victim: string
  weapon: string | null
  /** 米 */
  distance: number
  x: number
  y: number
}

export interface ExtractResult {
  landings: ExtractedLanding[]
  kills: ExtractedKill[]
}

interface TeleEvent {
  _T?: string
  character?: { name?: string; location?: { x?: number; y?: number } }
  killer?: { name?: string } | null
  victim?: { name?: string; location?: { x?: number; y?: number } }
  finishDamageInfo?: { damageCauserName?: string; distance?: number }
  killerDamageInfo?: { damageCauserName?: string; distance?: number }
}

export function extractTelemetry(events: unknown[], worldSize: number): ExtractResult {
  const landings: ExtractedLanding[] = []
  const kills: ExtractedKill[] = []
  const norm = (v: number | undefined) => (v ?? 0) / worldSize

  for (const raw of events) {
    const e = raw as TeleEvent
    if (e._T === 'LogParachuteLanding' && e.character?.name) {
      landings.push({
        name: e.character.name,
        x: norm(e.character.location?.x),
        y: norm(e.character.location?.y)
      })
    } else if (e._T === 'LogPlayerKillV2' && e.victim?.name) {
      const dmg = e.finishDamageInfo ?? e.killerDamageInfo
      kills.push({
        killer: e.killer?.name ?? null, // 毒圈/摔死等无凶手
        victim: e.victim.name,
        weapon: dmg?.damageCauserName ?? null,
        distance: (dmg?.distance ?? 0) / 100,
        x: norm(e.victim.location?.x),
        y: norm(e.victim.location?.y)
      })
    }
  }
  return { landings, kills }
}

/** 武器内部名转可读名:WeapHK416_C → HK416;未知格式原样返回 */
export function weaponDisplayName(internal: string | null): string {
  if (!internal) return '未知'
  return internal.replace(/^Weap/, '').replace(/_C$/, '')
}
