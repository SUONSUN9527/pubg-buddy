import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { GAME_MODES, GAME_MODE_LABELS, type GameMode, type GameModeStats } from '@shared/types'

interface Metric {
  key: string
  label: string
  value: (s: GameModeStats) => number
  fmt: (v: number) => string
  /** 是否参与"最优值"高亮 */
  best?: boolean
}

const METRICS: Metric[] = [
  { key: 'kd', label: 'K/D', value: (s) => s.kills / Math.max(s.losses, 1), fmt: (v) => v.toFixed(2), best: true },
  {
    key: 'adr',
    label: '场均伤害',
    value: (s) => s.damageDealt / Math.max(s.roundsPlayed, 1),
    fmt: (v) => `${Math.round(v)}`,
    best: true
  },
  {
    key: 'win',
    label: '吃鸡率',
    value: (s) => s.wins / Math.max(s.roundsPlayed, 1),
    fmt: (v) => `${(v * 100).toFixed(1)}%`,
    best: true
  },
  {
    key: 'top10',
    label: '前十率',
    value: (s) => s.top10s / Math.max(s.roundsPlayed, 1),
    fmt: (v) => `${(v * 100).toFixed(1)}%`,
    best: true
  },
  { key: 'rounds', label: '场次', value: (s) => s.roundsPlayed, fmt: (v) => `${v}` },
  { key: 'wins', label: '吃鸡', value: (s) => s.wins, fmt: (v) => `${v}` }
]

export default function Squad() {
  const qc = useQueryClient()
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<GameMode>('squad')

  const members = useQuery({ queryKey: ['squad'], queryFn: api.squad.list })

  const compare = useQuery({
    queryKey: ['squadCompare', mode, members.data?.map((m) => m.id).join(',')],
    queryFn: () => api.squad.compare(mode),
    enabled: (members.data?.length ?? 0) > 0,
    staleTime: 60_000
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['squad'] })
    qc.invalidateQueries({ queryKey: ['squadCompare'] })
  }
  const add = useMutation({ mutationFn: api.squad.add, onSuccess: invalidate })
  const remove = useMutation({ mutationFn: api.squad.remove, onSuccess: invalidate })

  const submit = () => {
    const v = input.trim()
    if (!v) return
    add.mutate(v, { onSuccess: () => setInput('') })
  }

  // 每个指标的最优值(仅统计有数据且场次>0 的成员)
  const best = new Map<string, number>()
  for (const metric of METRICS.filter((m) => m.best)) {
    const values = (compare.data?.rows ?? [])
      .filter((r) => r.stats && r.stats.roundsPlayed > 0)
      .map((r) => metric.value(r.stats!))
    if (values.length > 1) best.set(metric.key, Math.max(...values))
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <div className="eyebrow">Squad</div>
      <h1 className="mt-1 text-xl font-semibold">车队</h1>

      <div className="mt-5 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="添加成员昵称(精确匹配,最多 10 人)"
          className="hud-num min-w-0 flex-1 rounded-sm border border-line bg-panel px-4 py-2.5 text-sm placeholder:font-sans placeholder:text-mut/70"
        />
        <button
          onClick={submit}
          disabled={add.isPending || (members.data?.length ?? 0) >= 10}
          className="rounded-sm bg-drop px-5 py-2.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          添加
        </button>
      </div>
      {add.isError && <div className="mt-2 text-xs text-danger">{(add.error as Error).message}</div>}

      {members.data && members.data.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {members.data.map((m) => (
            <span key={m.id} className="hud-card flex items-center gap-2 px-3 py-1.5 text-sm">
              {m.name}
              <button
                onClick={() => remove.mutate(m.id)}
                className="text-mut transition-colors hover:text-danger"
                aria-label={`移除 ${m.name}`}
              >
                ×
              </button>
            </span>
          ))}
          <span className="self-center text-xs text-mut">{members.data.length}/10</span>
        </div>
      )}

      {members.data?.length === 0 && (
        <div className="hud-card mt-6 px-6 py-10 text-center text-sm text-mut">
          把常一起玩的朋友加进来,一次批量请求就能拉全员赛季数据并排对比。
        </div>
      )}

      {(members.data?.length ?? 0) > 0 && (
        <>
          <div className="mt-6 flex gap-1 border-b border-line">
            {GAME_MODES.map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                  mode === m ? 'border-drop text-ink' : 'border-transparent text-mut hover:text-ink'
                }`}
              >
                {GAME_MODE_LABELS[m]}
              </button>
            ))}
          </div>

          {compare.isFetching && !compare.data && (
            <div className="hud-card mt-4 px-5 py-8 text-center text-sm text-mut">正在批量拉取全员数据…</div>
          )}
          {compare.isError && (
            <div className="hud-card mt-4 border-danger/40 px-5 py-4 text-sm text-danger">
              {(compare.error as Error).message}
            </div>
          )}

          {compare.data && (
            <div className="hud-card mt-4 overflow-x-auto">
              <table className="w-full min-w-[620px] whitespace-nowrap text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-mut">
                    <th className="px-4 py-2.5 font-normal">玩家</th>
                    {METRICS.map((metric) => (
                      <th key={metric.key} className="px-3 py-2.5 text-right font-normal">
                        {metric.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compare.data.rows.map((row) => (
                    <tr key={row.member.id} className="border-t border-line/60">
                      <td className="px-4 py-2.5">{row.member.name}</td>
                      {row.error && (
                        <td colSpan={METRICS.length} className="px-3 py-2.5 text-right text-xs text-danger">
                          {row.error}
                        </td>
                      )}
                      {!row.error && !row.stats && (
                        <td colSpan={METRICS.length} className="px-3 py-2.5 text-right text-xs text-mut">
                          本赛季该模式无对局
                        </td>
                      )}
                      {row.stats &&
                        METRICS.map((metric) => {
                          const v = metric.value(row.stats!)
                          const isBest = metric.best && best.get(metric.key) === v && row.stats!.roundsPlayed > 0
                          return (
                            <td
                              key={metric.key}
                              className={`hud-num px-3 py-2.5 text-right ${isBest ? 'text-drop' : ''}`}
                            >
                              {metric.fmt(v)}
                              {isBest && <span className="ml-0.5 text-[9px]">▲</span>}
                            </td>
                          )
                        })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
