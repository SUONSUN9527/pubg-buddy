import { useEffect, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api'
import MapCanvas from '../../components/MapCanvas'
import { MARKER_META, MARKER_TYPES } from '../../lib/markers'
import { useMapImage } from '../../lib/useMapImage'
import { useOverlayControls } from '../../lib/useOverlayControls'
import { MAP_NAMES, mapDisplayName } from '@shared/maps'
import type { MarkerType } from '@shared/types'

const drag: CSSProperties = { WebkitAppRegion: 'drag' } as CSSProperties
const noDrag: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties

const OVERLAY_MAPS = Object.keys(MAP_NAMES).filter((id) => !['Erangel_Main', 'Range_Main'].includes(id))

/**
 * 独立浮窗一:地图标记窗。
 * 手动选图 + F8 呼出;V2(Windows 屏幕识别)接入后,检测到游戏内打开 M 地图时自动展示并对齐。
 */
export default function MapOverlay() {
  const [mapId, setMapId] = useState(() => localStorage.getItem('overlayMapId') ?? 'Baltic_Main')
  const [visible, setVisible] = useState<Set<MarkerType>>(new Set(MARKER_TYPES))

  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [])

  useEffect(() => localStorage.setItem('overlayMapId', mapId), [mapId])

  const markers = useQuery({ queryKey: ['markers', mapId], queryFn: () => api.marker.list(mapId) })
  const img = useMapImage(mapId)
  const { collapsed, locked, toggleCollapsed, toggleLocked, pinRef } = useOverlayControls()

  const allOn = visible.size === MARKER_TYPES.length
  const toggleAll = () => setVisible(allOn ? new Set() : new Set(MARKER_TYPES))
  const toggleType = (t: MarkerType) => {
    const next = new Set(visible)
    if (next.has(t)) next.delete(t)
    else next.add(t)
    setVisible(next)
  }

  // 只给当前地图有标记的类型显示开关,减少噪音
  const presentTypes = MARKER_TYPES.filter((t) => markers.data?.some((m) => m.type === t))

  // 收起态:只剩一个小图标,点击展开
  if (collapsed) {
    return (
      <button
        onClick={toggleCollapsed}
        title="展开地图标记浮窗"
        className="flex h-11 w-11 items-center justify-center rounded-md border border-drop/70 bg-panel/90 text-xl backdrop-blur-sm"
      >
        🗺️
      </button>
    )
  }

  return (
    <div
      className={`flex h-screen flex-col overflow-hidden rounded-md border bg-panel/90 backdrop-blur-sm ${
        locked ? 'border-drop/70' : 'border-line'
      }`}
    >
      <div style={locked ? undefined : drag} className="flex cursor-move items-center gap-2 border-b border-line px-3 py-1.5">
        <span className="eyebrow shrink-0 text-drop">地图标记</span>
        <select
          style={noDrag}
          value={mapId}
          onChange={(e) => setMapId(e.target.value)}
          className={`rounded-sm border border-line bg-panel px-2 py-0.5 text-xs ${locked ? 'opacity-40' : ''}`}
        >
          {OVERLAY_MAPS.map((id) => (
            <option key={id} value={id}>
              {mapDisplayName(id)}
            </option>
          ))}
        </select>
        <span className="ml-auto" />
        <button
          ref={pinRef}
          style={noDrag}
          onClick={toggleLocked}
          title={locked ? '取消固定(恢复可操作)' : '固定:鼠标穿透,防误触'}
          className={`rounded-sm px-1.5 text-sm leading-none transition-colors ${
            locked ? 'bg-drop/25 text-drop' : 'text-mut hover:text-ink'
          }`}
        >
          📌
        </button>
        <button
          style={noDrag}
          onClick={toggleCollapsed}
          title="收起为小图标"
          className={`px-1 text-base leading-none text-mut transition-colors hover:text-ink ${locked ? 'opacity-40' : ''}`}
        >
          –
        </button>
        <button
          style={noDrag}
          onClick={() => window.close()}
          className={`px-1 text-mut transition-colors hover:text-danger ${locked ? 'opacity-40' : ''}`}
          aria-label="关闭浮窗"
        >
          ×
        </button>
      </div>

      {/* 图层开关:小胶囊,开=类型色描边,关=灰暗 */}
      <div className="flex flex-wrap items-center gap-1 border-b border-line/60 px-2 py-1">
        <button
          style={noDrag}
          onClick={toggleAll}
          className={`rounded-full border px-2 py-0.5 text-[11px] leading-4 transition-colors ${
            allOn ? 'border-drop bg-drop/15 text-ink' : 'border-line text-mut hover:text-ink'
          }`}
        >
          全部
        </button>
        {presentTypes.map((t) => {
          const on = visible.has(t)
          const meta = MARKER_META[t]
          return (
            <button
              key={t}
              style={{
                ...noDrag,
                borderColor: on ? meta.color : undefined,
                background: on ? `color-mix(in srgb, ${meta.color} 15%, transparent)` : undefined
              }}
              onClick={() => toggleType(t)}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-4 transition-colors ${
                on ? 'text-ink' : 'border-line text-mut opacity-60 hover:opacity-100'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
              {meta.label}
              <span className="hud-num text-[9px] opacity-70">
                {markers.data?.filter((m) => m.type === t).length ?? 0}
              </span>
            </button>
          )
        })}
      </div>

      <MapCanvas
        mapId={mapId}
        imageUrl={img.data}
        markers={markers.data ?? []}
        visibleTypes={visible}
        className="min-h-0 flex-1"
      />
    </div>
  )
}
