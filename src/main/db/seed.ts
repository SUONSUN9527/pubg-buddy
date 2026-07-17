import { BUILTIN_MARKERS } from '@shared/builtinMarkers'
import type { DB } from './index'

/** v5:卡拉金红线标记确认为地下通道,改用 tunnel 类型(v4 = 图像识别自动提取 + SIFT 配准) */
const SEED_VERSION = '5'
const SEED_ENABLED = true

/**
 * 内置默认标记入库(版本守卫):版本升级时清掉旧的 builtin 重新写入,
 * 用户自己加的标记(source='user')不受影响。
 */
export function seedBuiltinMarkers(db: DB): void {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'builtinMarkersVersion'").get() as
    | { value: string }
    | undefined
  if (row?.value === SEED_VERSION) return

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM map_markers WHERE source = 'builtin'").run()
    if (SEED_ENABLED) {
      const ins = db.prepare(
        "INSERT INTO map_markers(map_id, type, x, y, note, source, created_at) VALUES (?, ?, ?, ?, ?, 'builtin', ?)"
      )
      const t = Date.now()
      for (const m of BUILTIN_MARKERS) ins.run(m.mapId, m.type, m.x, m.y, m.note ?? null, t)
    }
    db.prepare(
      "INSERT INTO settings(key, value) VALUES ('builtinMarkersVersion', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(SEED_VERSION)
  })
  tx()
}
