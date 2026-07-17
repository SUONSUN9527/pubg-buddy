import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import MapCanvas from '../components/MapCanvas'
import StatCard from '../components/StatCard'
import { useMapImage } from '../lib/useMapImage'
import { MAP_NAMES, mapDisplayName } from '@shared/maps'

const LANDING_MAPS = Object.keys(MAP_NAMES).filter((id) => !['Erangel_Main', 'Range_Main'].includes(id))

export default function Analysis() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'death' | 'landing'>('death')
  const [mapId, setMapId] = useState('Baltic_Main')

  const profile = useQuery({ queryKey: ['deathProfile'], queryFn: api.analysis.deathProfile })
  const landings = useQuery({
    queryKey: ['landings', mapId],
    queryFn: () => api.analysis.landings(mapId),
    enabled: tab === 'landing'
  })
  const img = useMapImage(mapId)

  const backfill = useMutation({
    mutationFn: () => api.analysis.backfill(20),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deathProfile'] })
      qc.invalidateQueries({ queryKey: ['landings'] })
    }
  })

  const maxBucket = Math.max(1, ...(profile.data?.buckets.map((b) => b.count) ?? [1]))

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <div className="flex items-end justify-between">
        <div>
          <div className="eyebrow">Telemetry Analysis</div>
          <h1 className="mt-1 text-xl font-semibold">分析</h1>
        </div>
        <div className="flex items-center gap-3">
          {backfill.data && (
            <span className="text-xs text-mut">
              已解析 {backfill.data.processed} 场 · 跳过 {backfill.data.skipped} · 失败 {backfill.data.failed}
            </span>
          )}
          <button
            onClick={() => backfill.mutate()}
            disabled={backfill.isPending}
            className="rounded-sm border border-line px-4 py-2 text-sm text-ink transition-colors hover:border-drop disabled:opacity-50"
          >
            {backfill.isPending ? '解析中…' : '解析近期比赛'}
          </button>
        </div>
      </div>

      <div className="mt-4 flex gap-1 border-b border-line">
        {[
          { key: 'death' as const, label: '死亡画像' },
          { key: 'landing' as const, label: '跳点复盘' }
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === t.key ? 'border-drop text-ink' : 'border-transparent text-mut hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'death' && profile.data && (
        <>
          {profile.data.totalDeaths === 0 ? (
            <div className="hud-card mt-5 px-6 py-10 text-center text-sm text-mut">
              还没有死亡数据。绑定昵称后点「解析近期比赛」,或等新比赛自动入库。
            </div>
          ) : (
            <>
              <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
                <StatCard big hot label="总死亡(已解析)" value={`${profile.data.totalDeaths}`} />
                <StatCard big label="平均死亡距离" value={profile.data.avgDistance.toFixed(0)} unit="m" />
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="hud-card p-4">
                  <div className="eyebrow">死亡距离分布</div>
                  <div className="mt-3 space-y-2">
                    {profile.data.buckets.map((b) => (
                      <div key={b.label} className="flex items-center gap-2 text-xs">
                        <span className="hud-num w-16 shrink-0 text-mut">{b.label}</span>
                        <div className="h-3 flex-1 rounded-sm bg-panel2">
                          <div
                            className="h-full rounded-sm bg-drop/70"
                            style={{ width: `${(b.count / maxBucket) * 100}%` }}
                          />
                        </div>
                        <span className="hud-num w-8 text-right text-mut">{b.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="hud-card p-4">
                  <div className="eyebrow">死于什么(Top 8)</div>
                  <div className="mt-3 space-y-1.5">
                    {profile.data.byWeapon.map((w) => (
                      <div key={w.weapon} className="flex justify-between text-sm">
                        <span>{w.weapon}</span>
                        <span className="hud-num text-mut">{w.count} 次</span>
                      </div>
                    ))}
                  </div>
                  {profile.data.topKillers.length > 0 && (
                    <>
                      <div className="eyebrow mt-4">冤家(杀我最多)</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {profile.data.topKillers.map((k) => (
                          <span key={k.name} className="hud-card px-2 py-1 text-xs">
                            {k.name} <span className="hud-num text-danger">×{k.count}</span>
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'landing' && (
        <>
          <div className="mt-4 flex items-center gap-3">
            <select
              value={mapId}
              onChange={(e) => setMapId(e.target.value)}
              className="rounded-sm border border-line bg-panel px-3 py-2 text-sm"
            >
              {LANDING_MAPS.map((id) => (
                <option key={id} value={id}>
                  {mapDisplayName(id)}
                </option>
              ))}
            </select>
            <span className="text-xs text-mut">
              {landings.data?.length ?? 0} 个落点 · <span className="text-drop">橙色</span> = 前十名次
            </span>
          </div>
          <div className="hud-card mt-3 overflow-hidden">
            <MapCanvas mapId={mapId} imageUrl={img.data} points={landings.data ?? []} />
          </div>
        </>
      )}
    </div>
  )
}
