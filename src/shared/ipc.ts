import type {
  BackfillResult,
  DeathProfile,
  GameMode,
  HudRosterEvent,
  LandingPoint,
  MapMarker,
  MarkerType,
  MatchDetail,
  MatchSummary,
  NewMatchEvent,
  OverlayKind,
  PlayerStatsResult,
  PollerStatus,
  RosterEntry,
  SettingsShape,
  SquadCompareResult,
  SquadCompareRow,
  SquadMember,
  ValidateResult
} from './types'

/** preload 暴露到 window.api 的完整契约,主进程 handler 与渲染层共用 */
export interface Api {
  settings: {
    get(): Promise<SettingsShape>
    set(patch: Partial<SettingsShape>): Promise<SettingsShape>
    /** 用一次真实请求(GET /seasons)验证 Key 是否可用 */
    validate(): Promise<ValidateResult>
  }
  player: {
    /** 按精确昵称查战绩;lifetime=true 查生涯,force=true 跳过缓存 */
    stats(name: string, opts?: { lifetime?: boolean; force?: boolean }): Promise<PlayerStatsResult>
  }
  match: {
    /** 绑定玩家的近期比赛摘要(自动入库) */
    listMine(limit?: number): Promise<MatchSummary[]>
    get(id: string): Promise<MatchDetail>
  }
  poller: {
    status(): Promise<PollerStatus>
    setEnabled(enabled: boolean): Promise<PollerStatus>
  }
  squad: {
    list(): Promise<SquadMember[]>
    add(name: string): Promise<SquadMember>
    remove(id: number): Promise<void>
    compare(mode: GameMode): Promise<SquadCompareResult>
  }
  hud: {
    /** 任意名字列表的批量战绩(队友浮窗用) */
    teammateStats(names: string[], mode?: GameMode): Promise<SquadCompareRow[]>
    /** 开发期模拟 roster 注入,走与真实 GEP 完全相同的下游管线 */
    simulateRoster(entries: RosterEntry[]): Promise<HudRosterEvent>
    /** 当前 roster 快照(浮窗打开时初始化用) */
    snapshot(): Promise<HudRosterEvent>
  }
  mapimg: {
    /** 地图底图(dataURL 或直链);null 表示不可用,渲染层回退占位网格 */
    get(mapId: string): Promise<string | null>
  }
  overlay: {
    /** 开/关某个独立浮窗,返回切换后的状态 */
    toggle(kind: OverlayKind): Promise<boolean>
  }
  marker: {
    list(mapId: string): Promise<MapMarker[]>
    save(m: { mapId: string; type: MarkerType; x: number; y: number; note?: string | null }): Promise<MapMarker>
    remove(id: number): Promise<void>
  }
  analysis: {
    deathProfile(): Promise<DeathProfile>
    landings(mapId: string): Promise<LandingPoint[]>
    backfill(limit?: number): Promise<BackfillResult>
  }
  events: {
    /** 后台检测到新比赛;返回取消订阅函数 */
    onNewMatch(cb: (e: NewMatchEvent) => void): () => void
    /** 点击系统通知要求打开某场比赛;返回取消订阅函数 */
    onOpenMatch(cb: (matchId: string) => void): () => void
    /** roster/存活状态变化(真实 GEP 或模拟注入) */
    onHudRoster(cb: (e: HudRosterEvent) => void): () => void
    /** 某张地图的 4K 底图后台处理完成,渲染层应刷新该图 */
    onMapimgReady(cb: (mapId: string) => void): () => void
  }
}

/** invoke 通道名,与 Api 的层级一一对应 */
export const CHANNELS = {
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsValidate: 'settings:validate',
  playerStats: 'player:stats',
  matchListMine: 'match:listMine',
  matchGet: 'match:get',
  pollerStatus: 'poller:status',
  pollerSetEnabled: 'poller:setEnabled',
  squadList: 'squad:list',
  squadAdd: 'squad:add',
  squadRemove: 'squad:remove',
  squadCompare: 'squad:compare',
  hudTeammateStats: 'hud:teammateStats',
  hudSimulateRoster: 'hud:simulateRoster',
  hudSnapshot: 'hud:snapshot',
  mapimgGet: 'mapimg:get',
  overlayToggle: 'overlay:toggle',
  markerList: 'marker:list',
  markerSave: 'marker:save',
  markerRemove: 'marker:remove',
  analysisDeathProfile: 'analysis:deathProfile',
  analysisLandings: 'analysis:landings',
  analysisBackfill: 'analysis:backfill'
} as const

/** 主进程 → 渲染层的广播事件名 */
export const EVENTS = {
  newMatch: 'event:newMatch',
  openMatch: 'event:openMatch',
  hudRoster: 'event:hudRoster',
  mapimgReady: 'event:mapimgReady'
} as const

/** 主进程 → 渲染层的统一返回信封 */
export type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
