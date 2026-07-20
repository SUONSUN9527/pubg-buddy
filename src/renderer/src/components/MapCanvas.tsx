import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { mapDisplayName } from '@shared/maps'
import type { LandingPoint, MapMarker, MarkerType } from '@shared/types'
import { MARKER_META } from '../lib/markers'

/** Leaflet 内部坐标边长;所有归一化坐标(0~1,左上原点)乘它上图 */
const SIZE = 1000

const toLatLng = (x: number, y: number): [number, number] => [(1 - y) * SIZE, x * SIZE]

/** 底图缺失时的占位网格(SVG dataURL):8×8 网格 + 地图名水印 */
function placeholderUrl(mapId: string): string {
  const lines = Array.from({ length: 7 }, (_, i) => {
    const p = ((i + 1) * 1024) / 8
    return `<line x1="${p}" y1="0" x2="${p}" y2="1024"/><line x1="0" y1="${p}" x2="1024" y2="${p}"/>`
  }).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
    <rect width="1024" height="1024" fill="#10151c"/>
    <g stroke="#232b36" stroke-width="1.5">${lines}</g>
    <text x="512" y="500" fill="#3a4553" font-size="52" text-anchor="middle" font-family="sans-serif">${mapDisplayName(mapId)}</text>
    <text x="512" y="552" fill="#2a323d" font-size="22" text-anchor="middle" font-family="sans-serif">占位网格 · 放入真实底图后替换</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

interface Props {
  mapId: string
  /** 真实底图(dataURL 或直链);为空或加载失败时回退占位网格 */
  imageUrl?: string | null
  markers?: MapMarker[]
  points?: LandingPoint[]
  visibleTypes?: Set<MarkerType>
  /** 右键回调,参数为归一化坐标 */
  onAdd?: (x: number, y: number) => void
  className?: string
}

export default function MapCanvas({ mapId, imageUrl, markers = [], points = [], visibleTypes, onAdd, className }: Props) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const overlayRef = useRef<L.ImageOverlay | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const fittingRef = useRef(false)
  const userTouchedRef = useRef(false)
  const [imgFailed, setImgFailed] = useState(false)

  useEffect(() => setImgFailed(false), [mapId, imageUrl])

  useEffect(() => {
    const map = L.map(divRef.current!, {
      crs: L.CRS.Simple,
      minZoom: -4,
      maxZoom: 3,
      // 连续缩放:fitBounds 精确贴合容器,不因缩放档位取整留出大片黑边
      zoomSnap: 0,
      zoomDelta: 0.5,
      attributionControl: false
    })
    const fit = () => {
      fittingRef.current = true
      map.fitBounds([
        [0, 0],
        [SIZE, SIZE]
      ])
      setTimeout(() => (fittingRef.current = false), 80)
    }
    fit()
    // 区分"程序适配"与"用户手动缩放/拖动":用户动过之后 resize 不再强行重置视野
    map.on('zoomstart dragstart', () => {
      if (!fittingRef.current) userTouchedRef.current = true
    })
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    // 容器尺寸变化(浮窗拉伸、初始化时容器从 0 变为实际尺寸)→ 刷新并按需重新适配
    const observer = new ResizeObserver(() => {
      map.invalidateSize()
      if (!userTouchedRef.current) fit()
    })
    observer.observe(divRef.current!)
    return () => {
      observer.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    overlayRef.current?.remove()
    const url = !imgFailed && imageUrl ? imageUrl : placeholderUrl(mapId)
    const overlay = L.imageOverlay(url, [
      [0, 0],
      [SIZE, SIZE]
    ]).addTo(map)
    overlay.on('error', () => setImgFailed(true))
    overlayRef.current = overlay
    map.fitBounds([
      [0, 0],
      [SIZE, SIZE]
    ])
  }, [mapId, imageUrl, imgFailed])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !onAdd) return
    const handler = (e: L.LeafletMouseEvent) => onAdd(e.latlng.lng / SIZE, 1 - e.latlng.lat / SIZE)
    map.on('contextmenu', handler)
    return () => {
      map.off('contextmenu', handler)
    }
  }, [onAdd])

  useEffect(() => {
    const group = layerRef.current
    if (!group) return
    group.clearLayers()
    for (const m of markers) {
      if (visibleTypes && !visibleTypes.has(m.type)) continue
      // 库里可能存在已下线类型的旧标记,按自定义样式兜底渲染
      const meta = MARKER_META[m.type] ?? MARKER_META.custom
      L.circleMarker(toLatLng(m.x, m.y), {
        radius: 6,
        color: meta.color,
        weight: 2,
        fillColor: meta.color,
        fillOpacity: 0.35
      })
        .bindTooltip(`${meta.label}${m.note ? ` · ${m.note}` : ''}`)
        .addTo(group)
    }
    for (const p of points) {
      const good = (p.teamRank ?? 99) <= 10
      L.circleMarker(toLatLng(p.x, p.y), {
        radius: 4,
        color: good ? '#f2a33c' : '#8b98a5',
        weight: 1.5,
        fillColor: good ? '#f2a33c' : '#8b98a5',
        fillOpacity: 0.6
      })
        .bindTooltip(`名次 #${p.teamRank ?? '?'}`)
        .addTo(group)
    }
  }, [markers, points, visibleTypes])

  // 外层归 React 管(动态 className 如 pointer-events);内层固定类名交给 Leaflet,
  // 避免 React 重渲染时把 Leaflet 挂在元素上的类(leaflet-container 等)整体抹掉
  return (
    <div className={className ?? 'h-[520px] w-full'}>
      <div ref={divRef} className="h-full w-full" />
    </div>
  )
}
