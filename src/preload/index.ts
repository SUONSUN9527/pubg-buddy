import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { CHANNELS, EVENTS, type Api, type Envelope } from '@shared/ipc'
import type { HudRosterEvent, NewMatchEvent } from '@shared/types'

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const env = (await ipcRenderer.invoke(channel, ...args)) as Envelope<T>
  if (env.ok) return env.data
  const err = new Error(env.error.message) as Error & { code: string }
  err.code = env.error.code
  throw err
}

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: Api = {
  settings: {
    get: () => call(CHANNELS.settingsGet),
    set: (patch) => call(CHANNELS.settingsSet, patch),
    validate: () => call(CHANNELS.settingsValidate)
  },
  player: {
    stats: (name, opts) => call(CHANNELS.playerStats, name, opts)
  },
  match: {
    listMine: (limit) => call(CHANNELS.matchListMine, limit),
    get: (id) => call(CHANNELS.matchGet, id)
  },
  poller: {
    status: () => call(CHANNELS.pollerStatus),
    setEnabled: (enabled) => call(CHANNELS.pollerSetEnabled, enabled)
  },
  squad: {
    list: () => call(CHANNELS.squadList),
    add: (name) => call(CHANNELS.squadAdd, name),
    remove: (id) => call(CHANNELS.squadRemove, id),
    compare: (mode) => call(CHANNELS.squadCompare, mode)
  },
  hud: {
    teammateStats: (names, mode) => call(CHANNELS.hudTeammateStats, names, mode),
    simulateRoster: (entries) => call(CHANNELS.hudSimulateRoster, entries),
    snapshot: () => call(CHANNELS.hudSnapshot)
  },
  mapimg: {
    get: (mapId) => call(CHANNELS.mapimgGet, mapId)
  },
  overlay: {
    toggle: (kind) => call(CHANNELS.overlayToggle, kind)
  },
  overlayWin: {
    setCollapsed: (collapsed) => call(CHANNELS.overlayWinCollapse, collapsed),
    setIgnoreMouse: (ignore) => call(CHANNELS.overlayWinIgnoreMouse, ignore)
  },
  marker: {
    list: (mapId) => call(CHANNELS.markerList, mapId),
    save: (m) => call(CHANNELS.markerSave, m),
    remove: (id) => call(CHANNELS.markerRemove, id)
  },
  analysis: {
    deathProfile: () => call(CHANNELS.analysisDeathProfile),
    landings: (mapId) => call(CHANNELS.analysisLandings, mapId),
    backfill: (limit) => call(CHANNELS.analysisBackfill, limit)
  },
  events: {
    onNewMatch: (cb) => subscribe<NewMatchEvent>(EVENTS.newMatch, cb),
    onOpenMatch: (cb) => subscribe<string>(EVENTS.openMatch, cb),
    onHudRoster: (cb) => subscribe<HudRosterEvent>(EVENTS.hudRoster, cb),
    onMapimgReady: (cb) => subscribe<string>(EVENTS.mapimgReady, cb)
  }
}

contextBridge.exposeInMainWorld('api', api)
