import type { Api } from '@shared/ipc'
import { BUILTIN_MARKERS } from '@shared/builtinMarkers'
import { mapAssetUrl } from '@shared/maps'
import { TeamTracker } from '@shared/teamTracker'
import type {
  GameModeStats,
  HudRosterEvent,
  MapMarker,
  MatchDetail,
  MatchPlayer,
  MatchSummary,
  SettingsShape,
  SquadMember
} from '@shared/types'

/** 纯浏览器预览(无 Electron 主进程)时的演示数据,方便开发期看 UI */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const demoMode = (over: Partial<GameModeStats>): GameModeStats => ({
  assists: 0,
  boosts: 0,
  dBNOs: 0,
  damageDealt: 0,
  headshotKills: 0,
  heals: 0,
  kills: 0,
  longestKill: 0,
  losses: 0,
  maxKillStreaks: 0,
  mostSurvivalTime: 0,
  revives: 0,
  roundsPlayed: 0,
  teamKills: 0,
  timeSurvived: 0,
  top10s: 0,
  wins: 0,
  ...over
})

const demoStats = {
  squad: demoMode({
    roundsPlayed: 187,
    wins: 21,
    top10s: 74,
    losses: 166,
    kills: 312,
    assists: 98,
    damageDealt: 43120,
    headshotKills: 87,
    longestKill: 411.7,
    timeSurvived: 187 * 22.5 * 60,
    dBNOs: 154,
    revives: 41,
    maxKillStreaks: 4,
    mostSurvivalTime: 2101
  }),
  'squad-fpp': demoMode({
    roundsPlayed: 42,
    wins: 3,
    top10s: 15,
    losses: 39,
    kills: 61,
    assists: 20,
    damageDealt: 8730,
    headshotKills: 19,
    longestKill: 288.3,
    timeSurvived: 42 * 20 * 60,
    dBNOs: 33,
    revives: 9,
    maxKillStreaks: 3,
    mostSurvivalTime: 1911
  }),
  duo: demoMode({
    roundsPlayed: 31,
    wins: 2,
    top10s: 11,
    losses: 29,
    kills: 44,
    assists: 12,
    damageDealt: 6100,
    headshotKills: 12,
    longestKill: 199.2,
    timeSurvived: 31 * 18 * 60,
    dBNOs: 21,
    revives: 4,
    maxKillStreaks: 3,
    mostSurvivalTime: 1712
  }),
  solo: demoMode({
    roundsPlayed: 9,
    wins: 0,
    top10s: 3,
    losses: 9,
    kills: 11,
    damageDealt: 1490,
    headshotKills: 4,
    longestKill: 152.8,
    timeSurvived: 9 * 15 * 60,
    maxKillStreaks: 2,
    mostSurvivalTime: 1499
  })
}

let mockSettings: SettingsShape = {
  apiKey: '',
  playerName: 'DemoPlayer',
  shard: 'steam',
  pollEnabled: false
}

// ---------- 比赛演示数据(确定性,方便截图对比)----------

const DEMO_MAPS = ['Baltic_Main', 'Kiki_Main', 'Tiger_Main', 'Neon_Main', 'Desert_Main', 'DihorOtok_Main']
const DEMO_RANKS = [3, 1, 12, 7, 2, 20, 5, 9]
const DEMO_KILLS = [7, 11, 2, 4, 6, 0, 3, 5]

const demoSummaries: MatchSummary[] = DEMO_RANKS.map((rank, i) => ({
  id: `demo-match-${i}`,
  mapName: DEMO_MAPS[i % DEMO_MAPS.length],
  gameMode: i % 3 === 0 ? 'squad-fpp' : 'squad',
  playedAt: new Date(Date.now() - (i + 1) * 70 * 60_000).toISOString(),
  duration: 1450 + i * 77,
  numTeams: 25 - i,
  me: { teamRank: rank, kills: DEMO_KILLS[i], damage: 120 + DEMO_KILLS[i] * 88.5, winPlace: rank }
}))

const FIRST_NAMES = ['Ghost', 'Viper', 'Panda', 'Falcon', 'Mole', 'Husky', 'Raven', 'Bison', 'Otter', 'Lynx']

function demoDetail(id: string): MatchDetail {
  const idx = Number(id.split('-').pop() ?? 0) % demoSummaries.length
  const summary = demoSummaries[idx]
  const players: MatchPlayer[] = []
  const myRank = summary.me!.teamRank
  // 生成前 6 个队 + 我的队伍(若不在前 6),每队 4 人
  const ranks = Array.from(new Set([1, 2, 3, 4, 5, 6, myRank])).sort((a, b) => a - b)
  for (const rank of ranks) {
    const mine = rank === myRank
    for (let i = 0; i < 4; i++) {
      const isMe = mine && i === 0
      const kills = isMe ? summary.me!.kills : Math.max(0, 8 - rank - i)
      players.push({
        name: isMe ? 'DemoPlayer' : `${FIRST_NAMES[(rank * 4 + i) % FIRST_NAMES.length]}_${rank}${i}`,
        accountId: `account.demo-${rank}-${i}`,
        rosterId: `roster-${rank}`,
        teamRank: rank,
        kills,
        damage: kills * 97.3 + 60,
        dbnos: Math.max(0, kills - 1),
        surviveTime: Math.max(300, summary.duration - rank * 90 - i * 45),
        winPlace: rank
      })
    }
  }
  return {
    id,
    mapName: summary.mapName,
    gameMode: summary.gameMode,
    playedAt: summary.playedAt,
    duration: summary.duration,
    isCustom: false,
    telemetryUrl: null,
    numTeams: summary.numTeams,
    players,
    myName: 'DemoPlayer'
  }
}

export const mockApi: Api = {
  settings: {
    async get() {
      return { ...mockSettings }
    },
    async set(patch) {
      mockSettings = { ...mockSettings, ...patch }
      return { ...mockSettings }
    },
    async validate() {
      await sleep(300)
      return { valid: false, message: '预览模式没有主进程,无法请求官方 API' }
    }
  },
  player: {
    async stats(name) {
      await sleep(400)
      if (name === '404') {
        const err = new Error(`没有找到玩家「${name}」。昵称需要精确匹配且区分大小写`) as Error & { code: string }
        err.code = 'NOT_FOUND'
        throw err
      }
      return {
        player: { accountId: 'account.demo0000000000000000000000', name, shard: mockSettings.shard },
        seasonId: 'division.bro.official.pc-2018-36',
        isLifetime: false,
        stats: demoStats,
        fetchedAt: Date.now(),
        fromCache: false
      }
    }
  },
  match: {
    async listMine(limit = 10) {
      await sleep(500)
      return demoSummaries.slice(0, limit)
    },
    async get(id) {
      await sleep(350)
      return demoDetail(id)
    }
  },
  poller: {
    async status() {
      return {
        enabled: mockSettings.pollEnabled,
        running: false,
        lastCheckedAt: mockSettings.pollEnabled ? Date.now() - 20_000 : null,
        lastMatchId: null,
        lastError: null
      }
    },
    async setEnabled(enabled) {
      mockSettings.pollEnabled = enabled
      return mockApi.poller.status()
    }
  },
  squad: {
    async list() {
      return [...mockSquad]
    },
    async add(name) {
      if (mockSquad.length >= 10) throw new Error('车队最多 10 人(批量接口的上限)')
      if (mockSquad.some((m) => m.name === name.trim())) throw new Error(`「${name.trim()}」已在车队里`)
      const member: SquadMember = { id: nextSquadId++, name: name.trim(), accountId: `account.${name.trim()}` }
      mockSquad.push(member)
      return member
    },
    async remove(id) {
      mockSquad = mockSquad.filter((m) => m.id !== id)
    },
    async compare(mode) {
      await sleep(450)
      return {
        seasonId: 'division.bro.official.pc-2018-36',
        mode,
        fetchedAt: Date.now(),
        rows: mockSquad.map((m, i) => {
          if (m.name === 'GhostName404') return { member: m, error: '查无此人,昵称需精确匹配、区分大小写' }
          const base = demoStats.squad
          const factor = [1, 1.6, 0.55, 0.85, 1.2, 0.7, 1.05, 0.9, 1.3, 0.6][i % 10]
          const stats: GameModeStats = {
            ...base,
            roundsPlayed: Math.round(base.roundsPlayed * (0.4 + i * 0.2)),
            kills: Math.round(base.kills * factor),
            losses: Math.round(base.losses * (0.4 + i * 0.2)),
            wins: Math.round(base.wins * factor * 0.8),
            top10s: Math.round(base.top10s * (0.4 + i * 0.2)),
            damageDealt: base.damageDealt * factor * (0.4 + i * 0.2),
            headshotKills: Math.round(base.headshotKills * factor)
          }
          return { member: m, stats }
        })
      }
    }
  },
  hud: {
    async teammateStats(names) {
      await sleep(300)
      return names.map((name, i) => {
        const factor = [1, 0.7, 1.4, 0.5][i % 4]
        const base = demoStats.squad
        return {
          member: { id: -(i + 1), name, accountId: `account.${name}` },
          stats: {
            ...base,
            kills: Math.round(base.kills * factor),
            damageDealt: base.damageDealt * factor,
            wins: Math.round(base.wins * factor)
          }
        }
      })
    },
    async simulateRoster(entries) {
      mockTracker.upsertMany(entries)
      const snap = mockTracker.snapshot()
      hudListeners.forEach((l) => l(snap))
      return snap
    },
    async snapshot() {
      return mockTracker.snapshot()
    }
  },
  mapimg: {
    // 浏览器预览直接用官方 raw 链接(图片跨域加载不受 CORS 限制)
    async get(mapId) {
      return mapAssetUrl(mapId)
    }
  },
  overlay: {
    async toggle() {
      throw new Error('独立浮窗需要在桌面 App 中打开(预览模式没有主进程)')
    }
  },
  overlayWin: {
    async setCollapsed() {},
    async setIgnoreMouse() {},
    async getPosition() {
      return { x: 0, y: 0 }
    },
    async setPosition() {}
  },
  marker: {
    async list(mapId) {
      return [...(mockMarkers.get(mapId) ?? [])]
    },
    async save(m) {
      const marker: MapMarker = { id: nextMarkerId++, mapId: m.mapId, type: m.type, x: m.x, y: m.y, note: m.note ?? null, source: 'user' }
      if (!mockMarkers.has(m.mapId)) mockMarkers.set(m.mapId, [])
      mockMarkers.get(m.mapId)!.push(marker)
      return marker
    },
    async remove(id) {
      for (const list of mockMarkers.values()) {
        const i = list.findIndex((m) => m.id === id)
        if (i >= 0) list.splice(i, 1)
      }
    }
  },
  analysis: {
    async deathProfile() {
      await sleep(300)
      return {
        totalDeaths: 87,
        avgDistance: 74.2,
        byWeapon: [
          { weapon: 'M416', count: 18 },
          { weapon: 'Kar98k', count: 12 },
          { weapon: 'AKM', count: 9 },
          { weapon: 'SLR', count: 7 },
          { weapon: 'BlueZone', count: 6 },
          { weapon: 'Pan', count: 1 }
        ],
        buckets: [
          { label: '0~10m', count: 21 },
          { label: '10~50m', count: 30 },
          { label: '50~100m', count: 19 },
          { label: '100~200m', count: 12 },
          { label: '200m+', count: 5 }
        ],
        topKillers: [
          { name: 'Viper_Kim', count: 4 },
          { name: 'GhostRecon', count: 3 },
          { name: 'Mole_77', count: 2 }
        ]
      }
    },
    async landings(mapId) {
      await sleep(250)
      const seed = mapId.length
      return Array.from({ length: 14 }, (_, i) => ({
        matchId: `demo-match-${i}`,
        x: ((i * 0.37 + seed * 0.11) % 0.8) + 0.1,
        y: ((i * 0.53 + seed * 0.07) % 0.8) + 0.1,
        teamRank: (i * 7) % 25 || 1
      }))
    },
    async backfill() {
      await sleep(600)
      return { processed: 0, skipped: 0, failed: 0 }
    }
  },
  events: {
    onNewMatch: () => () => {},
    onOpenMatch: () => () => {},
    onHudRoster: (cb) => {
      hudListeners.add(cb)
      return () => hudListeners.delete(cb)
    },
    onMapimgReady: () => () => {}
  }
}

const hudListeners = new Set<(e: HudRosterEvent) => void>()
const mockTracker = new TeamTracker()
let nextMarkerId = 10_000
// 预览模式直接用内置默认标记初始化,与真实入库一致
const mockMarkers = new Map<string, MapMarker[]>()
BUILTIN_MARKERS.forEach((m, i) => {
  if (!mockMarkers.has(m.mapId)) mockMarkers.set(m.mapId, [])
  mockMarkers.get(m.mapId)!.push({
    id: i + 1,
    mapId: m.mapId,
    type: m.type,
    x: m.x,
    y: m.y,
    note: m.note ?? null,
    source: 'builtin'
  })
})

let nextSquadId = 4
let mockSquad: SquadMember[] = [
  { id: 1, name: 'DemoPlayer', accountId: 'account.demo0000000000000000000000' },
  { id: 2, name: 'Viper_Kim', accountId: 'account.viper' },
  { id: 3, name: 'TTC_Panda', accountId: 'account.panda' }
]
