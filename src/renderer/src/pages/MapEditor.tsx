import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import MapCanvas from '../components/MapCanvas'
import { MARKER_META, MARKER_TYPES } from '../lib/markers'
import { useMapImage } from '../lib/useMapImage'
import { MAP_NAMES, mapDisplayName } from '@shared/maps'
import type { MarkerType } from '@shared/types'

const EDITABLE_MAPS = Object.keys(MAP_NAMES).filter((id) => !['Erangel_Main', 'Range_Main'].includes(id))

interface Draft {
  x: number
  y: number
  type: MarkerType
  note: string
}

export default function MapEditor() {
  const qc = useQueryClient()
  const [mapId, setMapId] = useState('Baltic_Main')
  const [visible, setVisible] = useState<Set<MarkerType>>(new Set(MARKER_TYPES))
  const [draft, setDraft] = useState<Draft | null>(null)

  const markers = useQuery({ queryKey: ['markers', mapId], queryFn: () => api.marker.list(mapId) })
  const img = useMapImage(mapId)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['markers', mapId] })
  const save = useMutation({ mutationFn: api.marker.save, onSuccess: invalidate })
  const remove = useMutation({ mutationFn: api.marker.remove, onSuccess: invalidate })

  const toggleType = (t: MarkerType) => {
    const next = new Set(visible)
    if (next.has(t)) next.delete(t)
    else next.add(t)
    setVisible(next)
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="flex items-end justify-between">
        <div>
          <div className="eyebrow">Map Markers</div>
          <h1 className="mt-1 text-xl font-semibold">地图标记</h1>
        </div>
        <select
          value={mapId}
          onChange={(e) => {
            setMapId(e.target.value)
            setDraft(null)
          }}
          className="rounded-sm border border-line bg-panel px-3 py-2 text-sm"
        >
          {EDITABLE_MAPS.map((id) => (
            <option key={id} value={id}>
              {mapDisplayName(id)}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {MARKER_TYPES.map((t) => (
          <label key={t} className="flex cursor-pointer items-center gap-1.5 text-xs text-mut">
            <input type="checkbox" checked={visible.has(t)} onChange={() => toggleType(t)} className="accent-drop" />
            <span className="h-2 w-2 rounded-full" style={{ background: MARKER_META[t].color }} />
            {MARKER_META[t].label}
            <span className="hud-num">{markers.data?.filter((m) => m.type === t).length ?? 0}</span>
          </label>
        ))}
        <span className="ml-auto text-xs text-mut">右键地图添加标记 · 底图来自 PUBG 官方 api-assets,首次加载稍慢</span>
      </div>

      <div className="hud-card relative mt-3 overflow-hidden">
        <MapCanvas
          mapId={mapId}
          imageUrl={img.data}
          markers={markers.data ?? []}
          visibleTypes={visible}
          onAdd={(x, y) => setDraft({ x, y, type: 'custom', note: '' })}
        />
        {draft && (
          <div className="hud-card hud-card--hot absolute right-3 top-3 z-[1000] w-64 p-4">
            <div className="eyebrow text-drop">添加标记</div>
            <div className="hud-num mt-1 text-xs text-mut">
              位置 {(draft.x * 100).toFixed(1)}%, {(draft.y * 100).toFixed(1)}%
            </div>
            <select
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as MarkerType })}
              className="mt-3 w-full rounded-sm border border-line bg-panel px-2 py-1.5 text-sm"
            >
              {MARKER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MARKER_META[t].label}
                </option>
              ))}
            </select>
            <input
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              placeholder="备注(可选)"
              className="mt-2 w-full rounded-sm border border-line bg-panel px-2 py-1.5 text-sm placeholder:text-mut/60"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() =>
                  save.mutate(
                    { mapId, type: draft.type, x: draft.x, y: draft.y, note: draft.note || null },
                    { onSuccess: () => setDraft(null) }
                  )
                }
                className="flex-1 rounded-sm bg-drop px-3 py-1.5 text-sm font-medium text-bg"
              >
                保存
              </button>
              <button
                onClick={() => setDraft(null)}
                className="flex-1 rounded-sm border border-line px-3 py-1.5 text-sm text-mut hover:text-ink"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      {markers.data && markers.data.filter((m) => m.source === 'user').length > 0 && (
        <>
          <div className="eyebrow mt-5">我的标记</div>
          <div className="hud-card mt-2 divide-y divide-line/60">
            {markers.data
              .filter((m) => m.source === 'user')
              .map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: (MARKER_META[m.type] ?? MARKER_META.custom).color }}
                  />
                  <span className="text-mut">{(MARKER_META[m.type] ?? MARKER_META.custom).label}</span>
                  <span className="truncate">{m.note ?? '—'}</span>
                  <span className="hud-num ml-auto text-xs text-mut">
                    {(m.x * 100).toFixed(1)}%, {(m.y * 100).toFixed(1)}%
                  </span>
                  <button
                    onClick={() => remove.mutate(m.id)}
                    className="text-mut transition-colors hover:text-danger"
                    aria-label="删除标记"
                  >
                    ×
                  </button>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  )
}
