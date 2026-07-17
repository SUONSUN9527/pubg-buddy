import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, errorCode } from '../api'
import StatCard from '../components/StatCard'
import { GAME_MODES, GAME_MODE_LABELS, type GameMode, type GameModeStats } from '@shared/types'

const fmt = {
  ratio: (v: number) => v.toFixed(2),
  pct: (v: number) => `${(v * 100).toFixed(1)}`,
  int: (v: number) => `${Math.round(v)}`,
  m: (v: number) => v.toFixed(0),
  min: (v: number) => v.toFixed(1)
}

function derive(s: GameModeStats) {
  const rounds = Math.max(s.roundsPlayed, 1)
  return {
    kd: s.kills / Math.max(s.losses, 1),
    avgDamage: s.damageDealt / rounds,
    winRate: s.wins / rounds,
    top10Rate: s.top10s / rounds,
    headshotRate: s.kills > 0 ? s.headshotKills / s.kills : 0,
    avgSurviveMin: s.timeSurvived / rounds / 60
  }
}

export default function Search() {
  const [input, setInput] = useState('')
  const [name, setName] = useState('')
  const [lifetime, setLifetime] = useState(false)
  const [mode, setMode] = useState<GameMode>('squad')

  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.get })

  const stats = useQuery({
    queryKey: ['stats', name, lifetime],
    queryFn: () => api.player.stats(name, { lifetime }),
    enabled: name.length > 0,
    staleTime: 60_000
  })

  const submit = () => {
    const v = input.trim()
    if (v) setName(v)
  }

  const s = stats.data?.stats[mode]
  const d = s ? derive(s) : null

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <div className="eyebrow">Player Search</div>
      <h1 className="mt-1 text-xl font-semibold">战绩查询</h1>

      <div className="mt-5 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="输入玩家昵称(精确匹配,区分大小写)"
          className="hud-num min-w-0 flex-1 rounded-sm border border-line bg-panel px-4 py-2.5 text-sm placeholder:font-sans placeholder:text-mut/70"
        />
        <div className="hud-num flex items-center rounded-sm border border-line bg-panel px-3 text-xs text-mut">
          {settings.data?.shard ?? 'steam'}
        </div>
        <button
          onClick={submit}
          className="rounded-sm bg-drop px-5 py-2.5 text-sm font-medium text-bg transition-opacity hover:opacity-90"
        >
          查询
        </button>
      </div>

      {!name && (
        <div className="hud-card mt-6 px-5 py-8 text-center text-sm text-mut">
          输入昵称开始查询。查自己的话,可以先在
          <Link to="/settings" className="mx-1 text-drop underline-offset-2 hover:underline">
            设置页
          </Link>
          绑定常用昵称。
        </div>
      )}

      {stats.isFetching && name && (
        <div className="hud-card mt-6 px-5 py-8 text-center text-sm text-mut">正在查询「{name}」…</div>
      )}

      {stats.isError && !stats.isFetching && (
        <div className="hud-card mt-6 border-danger/40 px-5 py-6 text-sm">
          <div className="text-danger">{(stats.error as Error).message}</div>
          {['NO_KEY', 'INVALID_KEY'].includes(errorCode(stats.error)) && (
            <Link to="/settings" className="mt-2 inline-block text-drop underline-offset-2 hover:underline">
              去设置页配置 API Key →
            </Link>
          )}
        </div>
      )}

      {stats.data && !stats.isFetching && (
        <>
          <div className="mt-6 flex items-end justify-between">
            <div>
              <div className="text-2xl font-semibold">{stats.data.player.name}</div>
              <div className="hud-num mt-1 text-xs text-mut">
                {stats.data.player.accountId.slice(0, 28)}… · {stats.data.isLifetime ? '生涯' : '当前赛季'} ·{' '}
                {stats.data.fromCache ? '缓存' : '实时'} {new Date(stats.data.fetchedAt).toLocaleTimeString('zh-CN')}
              </div>
            </div>
            <div className="flex rounded-sm border border-line">
              {[
                { v: false, label: '当前赛季' },
                { v: true, label: '生涯' }
              ].map((o) => (
                <button
                  key={o.label}
                  onClick={() => setLifetime(o.v)}
                  className={`px-3 py-1.5 text-xs transition-colors ${
                    lifetime === o.v ? 'bg-panel2 text-drop' : 'text-mut hover:text-ink'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex gap-1 border-b border-line">
            {GAME_MODES.map((m) => {
              const rounds = stats.data.stats[m]?.roundsPlayed ?? 0
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                    mode === m
                      ? 'border-drop text-ink'
                      : rounds > 0
                        ? 'border-transparent text-mut hover:text-ink'
                        : 'border-transparent text-mut/40'
                  }`}
                >
                  {GAME_MODE_LABELS[m]}
                  <span className="hud-num ml-1.5 text-[10px]">{rounds}</span>
                </button>
              )
            })}
          </div>

          {s && s.roundsPlayed > 0 && d ? (
            <>
              <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
                <StatCard big hot label="K / D" value={fmt.ratio(d.kd)} />
                <StatCard big hot label="场均伤害" value={fmt.int(d.avgDamage)} />
                <StatCard big label="吃鸡率" value={fmt.pct(d.winRate)} unit="%" />
                <StatCard big label="前十率" value={fmt.pct(d.top10Rate)} unit="%" />
              </div>
              <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3">
                <StatCard label="场次" value={fmt.int(s.roundsPlayed)} />
                <StatCard label="吃鸡" value={fmt.int(s.wins)} />
                <StatCard label="击杀" value={fmt.int(s.kills)} />
                <StatCard label="助攻" value={fmt.int(s.assists)} />
                <StatCard label="爆头率" value={fmt.pct(d.headshotRate)} unit="%" />
                <StatCard label="最远击杀" value={fmt.m(s.longestKill)} unit="m" />
                <StatCard label="场均存活" value={fmt.min(d.avgSurviveMin)} unit="min" />
                <StatCard label="救援" value={fmt.int(s.revives)} />
              </div>
            </>
          ) : (
            <div className="hud-card mt-5 px-5 py-8 text-center text-sm text-mut">
              该模式在{stats.data.isLifetime ? '生涯' : '本赛季'}没有对局记录,换个模式 Tab 看看。
            </div>
          )}
        </>
      )}
    </div>
  )
}
