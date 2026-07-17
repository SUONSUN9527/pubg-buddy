import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, errorCode } from '../api'
import StatCard from '../components/StatCard'
import { durationText, timeAgo } from '../lib/format'
import { mapDisplayName, modeDisplayName } from '@shared/maps'
import { GAME_MODES, GAME_MODE_LABELS, type GameMode } from '@shared/types'

export default function Dashboard() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.get })
  const myName = settings.data?.playerName ?? ''

  const stats = useQuery({
    queryKey: ['stats', myName, false],
    queryFn: () => api.player.stats(myName),
    enabled: myName.length > 0,
    staleTime: 60_000
  })

  const matches = useQuery({
    queryKey: ['myMatches'],
    queryFn: () => api.match.listMine(10),
    enabled: myName.length > 0,
    staleTime: 60_000
  })

  const poller = useQuery({ queryKey: ['poller'], queryFn: api.poller.status })
  const togglePoller = useMutation({
    mutationFn: (enabled: boolean) => api.poller.setEnabled(enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['poller'] })
  })

  // 概览取场次最多的模式
  const dominant = (GAME_MODES.filter((m) => stats.data?.stats[m]?.roundsPlayed) as GameMode[]).sort(
    (a, b) => (stats.data?.stats[b]?.roundsPlayed ?? 0) - (stats.data?.stats[a]?.roundsPlayed ?? 0)
  )[0]
  const s = dominant ? stats.data?.stats[dominant] : undefined

  if (settings.isSuccess && !myName) {
    return (
      <div className="mx-auto max-w-4xl px-8 py-8">
        <div className="eyebrow">Dashboard</div>
        <h1 className="mt-1 text-xl font-semibold">仪表盘</h1>
        <div className="hud-card mt-6 px-6 py-10 text-center text-sm text-mut">
          还没有绑定游戏昵称。到
          <Link to="/settings" className="mx-1 text-drop underline-offset-2 hover:underline">
            设置页
          </Link>
          填写后,这里会显示你的赛季概览和近期比赛。
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <div className="flex items-end justify-between">
        <div>
          <div className="eyebrow">Dashboard</div>
          <h1 className="mt-1 text-xl font-semibold">{myName || '仪表盘'}</h1>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-mut">
          <span>
            新比赛自动检测
            {poller.data?.enabled && poller.data.lastCheckedAt && (
              <span className="hud-num ml-1">· 上次检查 {timeAgo(new Date(poller.data.lastCheckedAt).toISOString())}</span>
            )}
            {poller.data?.lastError && <span className="ml-1 text-danger">· {poller.data.lastError}</span>}
          </span>
          <button
            onClick={() => togglePoller.mutate(!poller.data?.enabled)}
            disabled={togglePoller.isPending}
            className={`h-5 w-9 rounded-full border transition-colors ${
              poller.data?.enabled ? 'border-drop bg-drop/30' : 'border-line bg-panel'
            }`}
            aria-label="切换新比赛自动检测"
          >
            <span
              className={`block h-3.5 w-3.5 rounded-full transition-transform ${
                poller.data?.enabled ? 'translate-x-4 bg-drop' : 'translate-x-0.5 bg-mut'
              }`}
            />
          </button>
        </label>
      </div>

      {stats.isError && (
        <div className="hud-card mt-5 border-danger/40 px-5 py-4 text-sm">
          <span className="text-danger">{(stats.error as Error).message}</span>
          {['NO_KEY', 'INVALID_KEY'].includes(errorCode(stats.error)) && (
            <Link to="/settings" className="ml-2 text-drop underline-offset-2 hover:underline">
              去设置页 →
            </Link>
          )}
        </div>
      )}

      {s && dominant && (
        <>
          <div className="eyebrow mt-6">本赛季概览 · {GAME_MODE_LABELS[dominant]}(场次最多)</div>
          <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            <StatCard big hot label="K / D" value={(s.kills / Math.max(s.losses, 1)).toFixed(2)} />
            <StatCard big hot label="场均伤害" value={`${Math.round(s.damageDealt / Math.max(s.roundsPlayed, 1))}`} />
            <StatCard big label="吃鸡率" value={((s.wins / Math.max(s.roundsPlayed, 1)) * 100).toFixed(1)} unit="%" />
            <StatCard big label="场次" value={`${s.roundsPlayed}`} />
          </div>
        </>
      )}

      <div className="eyebrow mt-8">近期比赛</div>
      {matches.isFetching && !matches.data && (
        <div className="hud-card mt-2 px-5 py-8 text-center text-sm text-mut">正在拉取近期比赛并入库…</div>
      )}
      {matches.isError && (
        <div className="hud-card mt-2 border-danger/40 px-5 py-4 text-sm text-danger">
          {(matches.error as Error).message}
        </div>
      )}
      {matches.data && (
        <div className="hud-card mt-2 divide-y divide-line overflow-x-auto">
          {matches.data.map((m) => (
            <button
              key={m.id}
              onClick={() => navigate(`/match/${m.id}`)}
              className="grid w-full min-w-[560px] grid-cols-[70px_1fr_90px_70px_70px_90px] items-center gap-2 whitespace-nowrap px-4 py-3 text-left text-sm transition-colors hover:bg-panel2"
            >
              <span
                className={`hud-num text-base ${
                  m.me?.teamRank === 1 ? 'text-drop' : (m.me?.teamRank ?? 99) <= 10 ? 'text-ink' : 'text-mut'
                }`}
              >
                #{m.me?.teamRank ?? '–'}
                <span className="text-[10px] text-mut">/{m.numTeams}</span>
              </span>
              <span>
                {mapDisplayName(m.mapName)}
                <span className="ml-2 text-xs text-mut">{modeDisplayName(m.gameMode)}</span>
              </span>
              <span className="hud-num text-xs text-mut">{timeAgo(m.playedAt)}</span>
              <span className="hud-num">
                {m.me?.kills ?? 0} <span className="text-[10px] text-mut">杀</span>
              </span>
              <span className="hud-num">
                {Math.round(m.me?.damage ?? 0)} <span className="text-[10px] text-mut">伤</span>
              </span>
              <span className="hud-num text-xs text-mut">{durationText(m.duration)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
