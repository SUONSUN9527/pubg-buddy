/** 平台分片:PC 玩家绝大多数是 steam */
export type Shard = 'steam' | 'kakao'

export type GameMode = 'solo' | 'duo' | 'squad' | 'solo-fpp' | 'duo-fpp' | 'squad-fpp'

export const GAME_MODES: GameMode[] = ['squad', 'duo', 'solo', 'squad-fpp', 'duo-fpp', 'solo-fpp']

export const GAME_MODE_LABELS: Record<GameMode, string> = {
  solo: '单排',
  duo: '双排',
  squad: '四排',
  'solo-fpp': '单排 FPP',
  'duo-fpp': '双排 FPP',
  'squad-fpp': '四排 FPP'
}

/** 官方 gameModeStats 的原始字段(只列 UI 会用到的,JSON 里多余字段忽略) */
export interface GameModeStats {
  assists: number
  boosts: number
  dBNOs: number
  damageDealt: number
  headshotKills: number
  heals: number
  kills: number
  longestKill: number
  losses: number
  maxKillStreaks: number
  mostSurvivalTime: number
  revives: number
  roundsPlayed: number
  teamKills: number
  timeSurvived: number
  top10s: number
  wins: number
}

export interface PlayerSummary {
  accountId: string
  name: string
  shard: Shard
}

export interface SettingsShape {
  apiKey: string
  playerName: string
  shard: Shard
  pollEnabled: boolean
}

export interface PlayerStatsResult {
  player: PlayerSummary
  /** 实际使用的赛季 id;生涯数据为 'lifetime' */
  seasonId: string
  isLifetime: boolean
  stats: Partial<Record<GameMode, GameModeStats>>
  fetchedAt: number
  fromCache: boolean
}

/** 主进程抛给渲染层的结构化错误码 */
export type ErrorCode =
  | 'NO_KEY' // 未配置 API Key
  | 'INVALID_KEY' // Key 无效(401)
  | 'NOT_FOUND' // 玩家/资源不存在(404)
  | 'RATE_LIMITED' // 重试后仍 429
  | 'NETWORK' // 连不上 api.pubg.com
  | 'UNKNOWN'

export interface AppErrorShape {
  code: ErrorCode
  message: string
}

export interface ValidateResult {
  valid: boolean
  message?: string
}

// ---------- 比赛(M2) ----------

export interface MatchPlayer {
  name: string
  accountId: string
  rosterId: string
  teamRank: number
  kills: number
  damage: number
  dbnos: number
  /** 存活秒数 */
  surviveTime: number
  winPlace: number
}

export interface MatchDetail {
  id: string
  /** 地图内部名(Baltic_Main 等),渲染层转显示名 */
  mapName: string
  gameMode: string
  /** ISO 时间 */
  playedAt: string
  /** 时长秒数 */
  duration: number
  isCustom: boolean
  telemetryUrl: string | null
  numTeams: number
  players: MatchPlayer[]
  /** 绑定昵称,渲染层用于高亮我的队伍 */
  myName?: string
}

export interface MatchSummary {
  id: string
  mapName: string
  gameMode: string
  playedAt: string
  duration: number
  numTeams: number
  /** 绑定玩家在本局的成绩;查不到(改名等)时为空 */
  me?: { teamRank: number; kills: number; damage: number; winPlace: number }
}

export interface PollerStatus {
  enabled: boolean
  running: boolean
  lastCheckedAt: number | null
  lastMatchId: string | null
  lastError: string | null
}

export interface NewMatchEvent {
  matchId: string
  summary: MatchSummary
}

// ---------- 车队(M3) ----------

export interface SquadMember {
  id: number
  name: string
  accountId: string | null
}

export interface SquadCompareRow {
  member: SquadMember
  /** 该成员在所选模式的赛季数据;查无此人/无对局时为空 */
  stats?: GameModeStats
  error?: string
}

export interface SquadCompareResult {
  seasonId: string
  mode: GameMode
  rows: SquadCompareRow[]
  fetchedAt: number
}

// ---------- 游戏内 HUD(M4) ----------

/** GEP roster 条目的归一化形态(真实事件源在 Windows 上接入,Mac 用模拟注入) */
export interface RosterEntry {
  /** roster 槽位键,同名玩家的更新以它去重 */
  key: string
  name: string
  teamId: number | null
  /** 死亡或退出(GEP 的 out 字段) */
  out: boolean
  isTeammate: boolean
}

export interface TeamAlive {
  teamId: number
  total: number
  alive: number
}

export interface HudRosterEvent {
  teammates: RosterEntry[]
  teams: TeamAlive[]
}

/** 独立浮窗种类:游戏地图标记窗 / 队伍存活窗 */
export type OverlayKind = 'map' | 'teams'

// ---------- 地图标记(M5) ----------

export type MarkerType = 'vehicle' | 'glider' | 'secret_room' | 'bear_cave' | 'lab' | 'tunnel' | 'custom'

export interface MapMarker {
  id: number
  mapId: string
  type: MarkerType
  /** 归一化世界坐标 0~1(左上原点) */
  x: number
  y: number
  note: string | null
  source: 'builtin' | 'user' | 'telemetry'
}

// ---------- Telemetry 分析(M6) ----------

export interface DeathProfile {
  totalDeaths: number
  avgDistance: number
  byWeapon: Array<{ weapon: string; count: number }>
  buckets: Array<{ label: string; count: number }>
  topKillers: Array<{ name: string; count: number }>
}

export interface LandingPoint {
  matchId: string
  x: number
  y: number
  teamRank: number | null
}

export interface BackfillResult {
  processed: number
  skipped: number
  failed: number
}
