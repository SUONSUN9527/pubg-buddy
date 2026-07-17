import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { nativeImage } from 'electron'
import log from 'electron-log/main'
import { MAP_ASSET_NAMES, mapAssetUrl } from '@shared/maps'

/** High_Res 走 Git LFS,必须用 media 域名(单张约 100MB,8192px) */
const highUrl = (asset: string) =>
  `https://media.githubusercontent.com/media/pubg/api-assets/master/Assets/Maps/${asset}_Main_High_Res.png`

/** 渲染层通过自定义协议 mapimg:// 流式读取本地缓存 */
const protocolUrl = (filename: string) => `mapimg://maps/${encodeURIComponent(filename)}`

/** 预取清单:UI 里可选的 10 张主地图(排除旧艾伦格与训练场) */
const PREFETCH_MAPS = Object.keys(MAP_ASSET_NAMES).filter((id) => !['Erangel_Main', 'Range_Main'].includes(id))

export interface MapImageService {
  /** 底图 URL:8K 缓存就绪直接给 8K,否则先给低清、后台补 8K 并广播热替换 */
  get(mapId: string): Promise<string | null>
  /** 启动时调用:并发预下载全部 8K 底图并转存为快速解码的 8K JPEG */
  prefetchAll(): Promise<void>
}

export function createMapImageService(dir: string, onUpgraded: (mapId: string) => void): MapImageService {
  mkdirSync(dir, { recursive: true })
  const inflight = new Set<string>()

  const file8k = (mapId: string) => join(dir, `${mapId}_8k.jpg`)
  const legacyPng = (mapId: string) => join(dir, `${mapId}_8k.png`)
  const fileLow = (mapId: string) => join(dir, `${mapId}_low.png`)

  async function download(url: string, dest: string): Promise<boolean> {
    try {
      const res = await fetch(url)
      if (!res.ok) {
        log.warn(`底图下载失败 ${url}:HTTP ${res.status}`)
        return false
      }
      const tmp = `${dest}.tmp`
      writeFileSync(tmp, Buffer.from(await res.arrayBuffer()))
      renameSync(tmp, dest)
      return true
    } catch (e) {
      log.warn(`底图下载失败 ${url}:`, e)
      return false
    }
  }

  /** PNG(约100MB,解码慢)→ 同分辨率 8192 JPEG(约15MB,解码快),这是浮窗秒开的关键 */
  function transcode(src: string, mapId: string): boolean {
    const img = nativeImage.createFromPath(src)
    if (img.isEmpty()) {
      log.warn(`8K 底图解码失败:${mapId}`)
      return false
    }
    writeFileSync(file8k(mapId), img.toJPEG(90))
    return true
  }

  /** 确保某张图的 8K JPEG 缓存就绪 */
  async function ensure8k(mapId: string): Promise<void> {
    const asset = MAP_ASSET_NAMES[mapId]
    if (!asset || inflight.has(mapId) || existsSync(file8k(mapId))) return
    inflight.add(mapId)
    try {
      // 老版本缓存过 8K PNG 的,本地直接转码,不重新下载
      if (existsSync(legacyPng(mapId))) {
        if (transcode(legacyPng(mapId), mapId)) {
          unlinkSync(legacyPng(mapId))
          log.info(`8K 底图已从旧缓存转码:${mapId}`)
          onUpgraded(mapId)
        }
        return
      }
      const tmp = join(dir, `${mapId}_high.tmp.png`)
      log.info(`下载 8K 底图:${mapId}(约 100MB)`)
      if (!(await download(highUrl(asset), tmp))) return
      const ok = transcode(tmp, mapId)
      unlinkSync(tmp)
      if (ok) {
        log.info(`8K 底图就绪:${mapId}`)
        onUpgraded(mapId)
      }
    } catch (e) {
      log.warn(`8K 底图处理失败 ${mapId}:`, e)
    } finally {
      inflight.delete(mapId)
    }
  }

  async function prefetchAll(): Promise<void> {
    const pending = PREFETCH_MAPS.filter((id) => !existsSync(file8k(id)))
    if (pending.length === 0) {
      log.info('8K 底图缓存已齐全')
      return
    }
    log.info(`开始预取 ${pending.length} 张 8K 底图…`)
    // 并发 2:兼顾下载速度与转码内存(单张解码约 270MB 峰值)
    const queue = [...pending]
    await Promise.all(
      Array.from({ length: 2 }, async () => {
        for (let id = queue.shift(); id; id = queue.shift()) await ensure8k(id)
      })
    )
    log.info('8K 底图预取完成')
  }

  async function get(mapId: string): Promise<string | null> {
    if (!MAP_ASSET_NAMES[mapId]) return null
    if (existsSync(file8k(mapId))) return protocolUrl(`${mapId}_8k.jpg`)

    // 8K 未就绪:低清先顶上,同时插队补这张图的 8K
    void ensure8k(mapId)
    if (!existsSync(fileLow(mapId))) {
      const low = mapAssetUrl(mapId)
      if (!low || !(await download(low, fileLow(mapId)))) return null
    }
    return protocolUrl(`${mapId}_low.png`)
  }

  return { get, prefetchAll }
}
