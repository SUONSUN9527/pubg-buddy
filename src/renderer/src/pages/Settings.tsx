import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { Shard } from '@shared/types'

export default function Settings() {
  const qc = useQueryClient()
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.get })

  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [playerName, setPlayerName] = useState('')
  const [shard, setShard] = useState<Shard>('steam')
  const [verdict, setVerdict] = useState<{ valid: boolean; message?: string } | null>(null)

  useEffect(() => {
    if (settings.data) {
      setApiKey(settings.data.apiKey)
      setPlayerName(settings.data.playerName)
      setShard(settings.data.shard)
    }
  }, [settings.data])

  const save = useMutation({
    mutationFn: async (validate: boolean) => {
      await api.settings.set({ apiKey, playerName, shard })
      return validate ? api.settings.validate() : null
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setVerdict(result)
    }
  })

  const inputCls =
    'w-full rounded-sm border border-line bg-panel px-3 py-2.5 text-sm placeholder:text-mut/60 focus:border-drop'

  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <div className="eyebrow">Settings</div>
      <h1 className="mt-1 text-xl font-semibold">设置</h1>

      <div className="mt-6 space-y-6">
        <section className="hud-card p-5">
          <label className="text-sm font-medium">PUBG API Key</label>
          <p className="mt-1 text-xs text-mut">
            在 developer.pubg.com 免费申请;只保存在本机数据库,不会上传到任何地方。
          </p>
          <div className="mt-3 flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9…"
              className={`hud-num ${inputCls}`}
            />
            <button
              onClick={() => setShowKey((v) => !v)}
              className="shrink-0 rounded-sm border border-line px-3 text-xs text-mut hover:text-ink"
            >
              {showKey ? '隐藏' : '显示'}
            </button>
          </div>
        </section>

        <section className="hud-card p-5">
          <label className="text-sm font-medium">我的游戏昵称</label>
          <p className="mt-1 text-xs text-mut">用于仪表盘和新比赛检测(M2);需要精确匹配、区分大小写。</p>
          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="你的游戏内昵称"
            className={`mt-3 ${inputCls}`}
          />
          <div className="mt-4 flex items-center gap-3">
            <label className="text-sm font-medium">平台</label>
            <select
              value={shard}
              onChange={(e) => setShard(e.target.value as Shard)}
              className="rounded-sm border border-line bg-panel px-3 py-2 text-sm"
            >
              <option value="steam">Steam(PC)</option>
              <option value="kakao">Kakao</option>
            </select>
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button
            onClick={() => save.mutate(false)}
            disabled={save.isPending}
            className="rounded-sm border border-line px-5 py-2.5 text-sm text-ink transition-colors hover:border-drop disabled:opacity-50"
          >
            保存
          </button>
          <button
            onClick={() => save.mutate(true)}
            disabled={save.isPending}
            className="rounded-sm bg-drop px-5 py-2.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {save.isPending ? '验证中…' : '保存并验证 Key'}
          </button>
          {verdict &&
            (verdict.valid ? (
              <span className="text-sm text-ok">✓ Key 有效,已可正常查询</span>
            ) : (
              <span className="text-sm text-danger">✗ {verdict.message}</span>
            ))}
        </div>
      </div>
    </div>
  )
}
