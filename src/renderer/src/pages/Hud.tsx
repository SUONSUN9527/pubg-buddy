import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import type { HudRosterEvent, RosterEntry } from '@shared/types'

/** 生成一局 25 队 × 4 人的模拟 roster;我的队伍 teamId=7 */
function makeRoster(myName: string): RosterEntry[] {
  const entries: RosterEntry[] = []
  for (let team = 1; team <= 25; team++) {
    for (let slot = 0; slot < 4; slot++) {
      const mine = team === 7
      const me = mine && slot === 0
      entries.push({
        key: `t${team}s${slot}`,
        name: me ? myName : `${mine ? 'Mate' : 'Bot'}_${team}_${slot}`,
        teamId: team,
        out: false,
        isTeammate: mine
      })
    }
  }
  return entries
}

export default function Hud() {
  const [snapshot, setSnapshot] = useState<HudRosterEvent | null>(null)
  const [overlayMsg, setOverlayMsg] = useState('')
  const entriesRef = useRef<RosterEntry[]>([])
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.get })
  const myName = settings.data?.playerName || 'DemoPlayer'

  useEffect(() => api.events.onHudRoster(setSnapshot), [])

  const simulateJoin = () => {
    entriesRef.current = makeRoster(myName)
    void api.hud.simulateRoster(entriesRef.current)
  }

  /** 模拟 7 名玩家死亡(不动我的队伍),走与真实 GEP 相同的 out 翻转路径 */
  const simulateDeaths = () => {
    let flipped = 0
    for (const e of entriesRef.current) {
      if (flipped >= 7) break
      if (!e.out && e.teamId !== 7) {
        e.out = true
        flipped++
      }
    }
    void api.hud.simulateRoster(entriesRef.current)
  }

  const teammateNames = snapshot?.teammates.filter((t) => t.name !== myName).map((t) => t.name) ?? []
  const mates = useQuery({
    queryKey: ['hudStats', teammateNames.join(',')],
    queryFn: () => api.hud.teammateStats(teammateNames),
    enabled: teammateNames.length > 0,
    staleTime: 5 * 60_000
  })

  const myTeamId = snapshot?.teammates[0]?.teamId
  const aliveTotal = snapshot?.teams.reduce((s, t) => s + t.alive, 0) ?? 0
  const aliveTeams = snapshot?.teams.filter((t) => t.alive > 0).length ?? 0

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <div className="eyebrow">In-game HUD Preview</div>
      <h1 className="mt-1 text-xl font-semibold">浮窗预览</h1>
      <p className="mt-2 text-xs text-mut">
        独立浮窗有两个:<span className="text-ink">地图标记窗(F8)</span>和
        <span className="text-ink">队伍存活窗(F9)</span>,透明置顶、可拖动;队友战绩保留在主窗口此页,不做独立弹窗。
        真实事件源(Overwolf GEP)需 Windows 实机,此页用模拟注入走相同管线。
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => api.overlay.toggle('map').catch((e) => setOverlayMsg((e as Error).message))}
          className="rounded-sm border border-drop px-4 py-2 text-sm text-drop transition-colors hover:bg-drop hover:text-bg"
        >
          地图标记浮窗 F8
        </button>
        <button
          onClick={() => api.overlay.toggle('teams').catch((e) => setOverlayMsg((e as Error).message))}
          className="rounded-sm border border-drop px-4 py-2 text-sm text-drop transition-colors hover:bg-drop hover:text-bg"
        >
          队伍存活浮窗 F9
        </button>
        {overlayMsg && <span className="self-center text-xs text-danger">{overlayMsg}</span>}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={simulateJoin}
          className="rounded-sm bg-drop px-4 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90"
        >
          模拟进局
        </button>
        <button
          onClick={simulateDeaths}
          disabled={!snapshot}
          className="rounded-sm border border-line px-4 py-2 text-sm text-ink transition-colors hover:border-drop disabled:opacity-40"
        >
          模拟减员 ×7
        </button>
        {snapshot && (
          <span className="hud-num self-center text-xs text-mut">
            存活 {aliveTotal} 人 / {aliveTeams} 队
          </span>
        )}
      </div>

      {snapshot && (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          {/* 队友浮窗(F9) */}
          <div className="hud-card hud-card--hot self-start p-4">
            <div className="eyebrow text-drop">队友 · 本赛季四排</div>
            <div className="mt-2 space-y-2">
              {teammateNames.length === 0 && <div className="text-xs text-mut">单人小队,没有队友</div>}
              {mates.isFetching && <div className="text-xs text-mut">拉取队友战绩…</div>}
              {mates.isError && <div className="text-xs text-danger">{(mates.error as Error).message}</div>}
              {mates.data?.map((row) => {
                const s = row.stats
                return (
                  <div key={row.member.name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{row.member.name}</span>
                    {s ? (
                      <span className="hud-num shrink-0 text-xs text-mut">
                        <span className="text-ink">{(s.kills / Math.max(s.losses, 1)).toFixed(2)}</span> KD ·{' '}
                        <span className="text-ink">{Math.round(s.damageDealt / Math.max(s.roundsPlayed, 1))}</span>{' '}
                        伤 · <span className="text-ink">{s.roundsPlayed}</span> 场
                      </span>
                    ) : (
                      <span className="text-xs text-mut">{row.error ?? '无数据'}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 队伍存活面板(F21) */}
          <div className="hud-card p-4">
            <div className="eyebrow">队伍存活</div>
            <div className="mt-3 grid grid-cols-5 gap-1.5">
              {snapshot.teams.map((t) => {
                const mine = t.teamId === myTeamId
                const wiped = t.alive === 0
                return (
                  <div
                    key={t.teamId}
                    className={`flex items-center justify-between rounded-sm border px-2 py-1.5 ${
                      mine ? 'border-drop' : wiped ? 'border-line/40 opacity-40' : 'border-line'
                    }`}
                  >
                    <span className={`hud-num text-xs ${mine ? 'text-drop' : wiped ? 'text-mut line-through' : 'text-mut'}`}>
                      {t.teamId}
                    </span>
                    <span className="flex gap-0.5">
                      {Array.from({ length: t.total }, (_, i) => (
                        <span
                          key={i}
                          className={`h-1.5 w-1.5 rounded-full ${
                            i < t.alive ? (mine ? 'bg-drop' : 'bg-ink/70') : 'bg-line'
                          }`}
                        />
                      ))}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {!snapshot && (
        <div className="hud-card mt-6 px-6 py-10 text-center text-sm text-mut">
          点「模拟进局」注入一局 25 队 × 4 人的 roster,查看队友浮窗和队伍存活面板。
        </div>
      )}
    </div>
  )
}
