import { useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api, isMock } from './api'
import { mapDisplayName, modeDisplayName } from '@shared/maps'
import type { NewMatchEvent } from '@shared/types'
import Analysis from './pages/Analysis'
import Dashboard from './pages/Dashboard'
import Hud from './pages/Hud'
import MapEditor from './pages/MapEditor'
import MatchDetail from './pages/MatchDetail'
import Search from './pages/Search'
import Settings from './pages/Settings'
import Squad from './pages/Squad'
import MapOverlay from './pages/overlay/MapOverlay'
import TeamsOverlay from './pages/overlay/TeamsOverlay'

const NAV = [
  { to: '/dashboard', label: '仪表盘', hint: '' },
  { to: '/search', label: '玩家查询', hint: '' },
  { to: '/squad', label: '车队', hint: '' },
  { to: '/markers', label: '地图标记', hint: '' },
  { to: '/analysis', label: '分析', hint: '' },
  { to: '/hud', label: '浮窗预览', hint: 'M4' },
  { to: '/settings', label: '设置', hint: '' }
]

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const [toast, setToast] = useState<NewMatchEvent | null>(null)
  const isOverlay = location.pathname.startsWith('/overlay')

  useEffect(() => {
    const offNew = api.events.onNewMatch((e) => {
      qc.invalidateQueries({ queryKey: ['myMatches'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      setToast(e)
    })
    const offOpen = api.events.onOpenMatch((matchId) => navigate(`/match/${matchId}`))
    return () => {
      offNew()
      offOpen()
    }
  }, [navigate, qc])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 8000)
    return () => clearTimeout(t)
  }, [toast])

  // 独立浮窗:无侧边栏、无 toast 的裸路由
  if (isOverlay) {
    return (
      <Routes>
        <Route path="/overlay/map" element={<MapOverlay />} />
        <Route path="/overlay/teams" element={<TeamsOverlay />} />
      </Routes>
    )
  }

  return (
    <div className="flex h-screen">
      <aside className="flex w-52 shrink-0 flex-col border-r border-line bg-panel">
        <div className="px-5 pb-5 pt-6">
          <div className="hud-num text-lg font-bold leading-none tracking-[0.18em] text-ink">PUBG</div>
          <div className="hud-num mt-1 text-lg font-bold leading-none tracking-[0.18em] text-drop">BUDDY</div>
          <div className="eyebrow mt-3">个人战术终端 · M6</div>
        </div>
        <nav className="flex flex-col gap-0.5 px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center justify-between rounded-sm px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'border-l-2 border-drop bg-panel2 pl-2.5 text-ink'
                    : 'border-l-2 border-transparent text-mut hover:bg-panel2 hover:text-ink'
                }`
              }
            >
              <span>{item.label}</span>
              {item.hint && <span className="hud-num text-[10px] text-mut/60">{item.hint}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-5 pb-5">
          {isMock && (
            <div className="hud-card px-3 py-2 text-xs text-mut">
              <span className="text-drop">预览模式</span> · 演示数据,未连接主进程
            </div>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/search" element={<Search />} />
          <Route path="/match/:id" element={<MatchDetail />} />
          <Route path="/squad" element={<Squad />} />
          <Route path="/markers" element={<MapEditor />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/hud" element={<Hud />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      {toast && (
        <button
          onClick={() => {
            navigate(`/match/${toast.matchId}`)
            setToast(null)
          }}
          className="hud-card hud-card--hot fixed bottom-5 right-5 px-4 py-3 text-left text-sm shadow-lg"
        >
          <div className="eyebrow text-drop">新比赛已入库</div>
          <div className="mt-1">
            {mapDisplayName(toast.summary.mapName)} · {modeDisplayName(toast.summary.gameMode)}
            {toast.summary.me && (
              <span className="hud-num ml-2">
                #{toast.summary.me.winPlace} · {toast.summary.me.kills} 杀
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-mut">点击查看全员数据</div>
        </button>
      )}
    </div>
  )
}
