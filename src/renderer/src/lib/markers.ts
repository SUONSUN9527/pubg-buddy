import type { MarkerType } from '@shared/types'

export const MARKER_META: Record<MarkerType, { label: string; color: string }> = {
  vehicle: { label: '刷车点', color: '#f2a33c' },
  glider: { label: '刷飞机点', color: '#4da3ff' },
  secret_room: { label: '密室', color: '#e5534b' },
  bear_cave: { label: '熊洞', color: '#b07a4f' },
  lab: { label: '实验室', color: '#9d7cff' },
  tunnel: { label: '地下通道', color: '#35c2c2' },
  custom: { label: '自定义', color: '#8b98a5' }
}

export const MARKER_TYPES = Object.keys(MARKER_META) as MarkerType[]
