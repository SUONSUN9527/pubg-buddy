import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { durationText, surviveText, timeAgo } from '../lib/format'
import { mapDisplayName, modeDisplayName } from '@shared/maps'
import type { MatchPlayer } from '@shared/types'

export default function MatchDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const match = useQuery({
    queryKey: ['match', id],
    queryFn: () => api.match.get(id),
    enabled: id.length > 0,
    staleTime: Infinity // 比赛数据不可变
  })

  const detail = match.data
  const teams = new Map<string, MatchPlayer[]>()
  for (const p of detail?.players ?? []) {
    if (!teams.has(p.rosterId)) teams.set(p.rosterId, [])
    teams.get(p.rosterId)!.push(p)
  }
  const myRosterId = detail?.myName
    ? detail.players.find((p) => p.name === detail.myName)?.rosterId
    : undefined

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <button onClick={() => navigate(-1)} className="text-xs text-mut transition-colors hover:text-ink">
        ← 返回
      </button>

      {match.isFetching && <div className="hud-card mt-4 px-5 py-8 text-center text-sm text-mut">正在加载比赛…</div>}
      {match.isError && (
        <div className="hud-card mt-4 border-danger/40 px-5 py-6 text-sm text-danger">
          {(match.error as Error).message}
        </div>
      )}

      {detail && (
        <>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <div className="eyebrow">Match Detail</div>
              <h1 className="mt-1 text-2xl font-semibold">
                {mapDisplayName(detail.mapName)}
                <span className="ml-3 text-sm font-normal text-mut">{modeDisplayName(detail.gameMode)}</span>
              </h1>
              <div className="hud-num mt-1 text-xs text-mut">
                {timeAgo(detail.playedAt)} · {durationText(detail.duration)} · {detail.numTeams} 队 ·{' '}
                {detail.players.length} 人{detail.isCustom && ' · 自定义'}
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {[...teams.entries()]
              .sort((a, b) => a[1][0].teamRank - b[1][0].teamRank)
              .map(([rosterId, players]) => {
                const mine = rosterId === myRosterId
                return (
                  <div key={rosterId} className={`hud-card ${mine ? 'hud-card--hot' : ''}`}>
                    <div className="flex items-center justify-between border-b border-line px-4 py-2">
                      <span className={`hud-num text-sm ${players[0].teamRank === 1 ? 'text-drop' : 'text-ink'}`}>
                        #{players[0].teamRank}
                        {players[0].teamRank === 1 && <span className="ml-2 text-xs">🍗 吃鸡</span>}
                      </span>
                      {mine && <span className="eyebrow text-drop">我的队伍</span>}
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] text-mut">
                          <th className="px-4 py-1.5 font-normal">玩家</th>
                          <th className="w-16 py-1.5 text-right font-normal">击杀</th>
                          <th className="w-20 py-1.5 text-right font-normal">伤害</th>
                          <th className="w-16 py-1.5 text-right font-normal">击倒</th>
                          <th className="w-20 px-4 py-1.5 text-right font-normal">存活</th>
                        </tr>
                      </thead>
                      <tbody>
                        {players.map((p) => {
                          const me = p.name === detail.myName
                          return (
                            <tr key={p.name} className={`border-t border-line/50 ${me ? 'text-drop' : ''}`}>
                              <td className="px-4 py-2">{p.name}</td>
                              <td className="hud-num py-2 text-right">{p.kills}</td>
                              <td className="hud-num py-2 text-right">{Math.round(p.damage)}</td>
                              <td className="hud-num py-2 text-right">{p.dbnos}</td>
                              <td className="hud-num px-4 py-2 text-right">{surviveText(p.surviveTime)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })}
          </div>
        </>
      )}
    </div>
  )
}
