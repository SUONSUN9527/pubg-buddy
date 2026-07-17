import { useEffect, useState, type CSSProperties } from 'react'
import { api } from '../../api'
import type { HudRosterEvent } from '@shared/types'

const drag: CSSProperties = { WebkitAppRegion: 'drag' } as CSSProperties
const noDrag: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties

/** 独立浮窗二:队伍存活面板 —— 极致紧凑:5 列小格,数字 + 存活点 */
export default function TeamsOverlay() {
  const [snap, setSnap] = useState<HudRosterEvent | null>(null)

  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    api.hud.snapshot().then(setSnap).catch(() => {})
    return api.events.onHudRoster(setSnap)
  }, [])

  const myTeamId = snap?.teammates[0]?.teamId
  const aliveTotal = snap?.teams.reduce((s, t) => s + t.alive, 0) ?? 0
  const aliveTeams = snap?.teams.filter((t) => t.alive > 0).length ?? 0

  return (
    <div className="flex h-screen flex-col overflow-hidden rounded border border-line/70 bg-panel/80 backdrop-blur-sm">
      <div style={drag} className="flex cursor-move items-center gap-2 px-2 py-1">
        <span className="text-[10px] tracking-[0.14em] text-drop">队伍存活</span>
        <span className="hud-num ml-auto text-[10px] text-mut">
          {snap ? `${aliveTotal}人/${aliveTeams}队` : '待进局'}
        </span>
        <button
          style={noDrag}
          onClick={() => window.close()}
          className="px-0.5 text-xs leading-none text-mut transition-colors hover:text-danger"
          aria-label="关闭浮窗"
        >
          ×
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
        {!snap || snap.teams.length === 0 ? (
          <div className="px-2 py-4 text-center text-[10px] leading-relaxed text-mut">
            进局后自动显示各队剩余人数
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-0.5">
            {snap.teams.map((t) => {
              const mine = t.teamId === myTeamId
              const wiped = t.alive === 0
              return (
                <div
                  key={t.teamId}
                  className={`flex items-center justify-between rounded-[3px] px-1 py-[3px] ${
                    mine ? 'bg-drop/15 ring-1 ring-drop/70' : wiped ? 'bg-white/[0.02] opacity-30' : 'bg-white/[0.05]'
                  }`}
                >
                  <span
                    className={`hud-num text-[10px] leading-none ${
                      mine ? 'text-drop' : wiped ? 'text-mut line-through' : 'text-mut'
                    }`}
                  >
                    {t.teamId}
                  </span>
                  <span className="flex gap-[2px]">
                    {Array.from({ length: t.total }, (_, i) => (
                      <span
                        key={i}
                        className={`h-[3px] w-[3px] rounded-full ${
                          i < t.alive ? (mine ? 'bg-drop' : 'bg-ink/60') : 'bg-line/70'
                        }`}
                      />
                    ))}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
