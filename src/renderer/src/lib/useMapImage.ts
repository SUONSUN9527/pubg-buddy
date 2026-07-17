import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'

/** 底图查询:低清先显示,主进程 8K 下载完推事件后自动热替换 */
export function useMapImage(mapId: string) {
  const qc = useQueryClient()
  useEffect(
    () => api.events.onMapimgReady((readyId) => qc.invalidateQueries({ queryKey: ['mapimg', readyId] })),
    [qc]
  )
  return useQuery({
    queryKey: ['mapimg', mapId],
    queryFn: () => api.mapimg.get(mapId),
    staleTime: Infinity
  })
}
