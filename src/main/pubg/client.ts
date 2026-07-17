import type { ErrorCode, Shard } from '@shared/types'
import { RateLimiter, type Priority } from './rateLimiter'
import type { Doc } from './jsonapi'

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export interface RequestOpts {
  priority?: Priority
  /** false = 免限流通道(/matches、telemetry) */
  limited?: boolean
}

export interface PubgClientOpts {
  getKey: () => string
  limiter?: RateLimiter
  fetchFn?: typeof fetch
  baseUrl?: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * 官方 API 客户端:in-flight 去重 + 优先级限流 + 429 退避重试。
 * 只做传输层,JSON:API 语义交给 services 层。
 */
export class PubgClient {
  private limiter: RateLimiter
  private inflight = new Map<string, Promise<Doc>>()
  private fetchFn: typeof fetch
  private baseUrl: string

  constructor(private opts: PubgClientOpts) {
    this.limiter = opts.limiter ?? new RateLimiter()
    this.fetchFn = opts.fetchFn ?? fetch
    this.baseUrl = opts.baseUrl ?? 'https://api.pubg.com'
  }

  get(shard: Shard, path: string, opts: RequestOpts = {}): Promise<Doc> {
    const url = `${this.baseUrl}/shards/${shard}${path}`
    const existing = this.inflight.get(url)
    if (existing) return existing

    const p = this.request(url, opts).finally(() => this.inflight.delete(url))
    this.inflight.set(url, p)
    return p
  }

  private async request(url: string, { priority = 'interactive', limited = true }: RequestOpts): Promise<Doc> {
    const key = this.opts.getKey()
    if (!key) throw new AppError('NO_KEY', '未配置 API Key,请先到设置页填写')

    for (let attempt = 0; ; attempt++) {
      if (limited) await this.limiter.acquire(priority)

      let res: Response
      try {
        res = await this.fetchFn(url, {
          headers: {
            Authorization: `Bearer ${key}`,
            Accept: 'application/vnd.api+json'
          }
        })
      } catch (e) {
        throw new AppError('NETWORK', `无法连接 api.pubg.com:${(e as Error).message}`)
      }

      if (res.status === 429) {
        if (attempt >= 2) throw new AppError('RATE_LIMITED', '触发官方限流且重试仍失败,请稍后再试')
        const reset = Number(res.headers.get('x-ratelimit-reset'))
        const waitMs = Number.isFinite(reset) && reset > 0 ? reset * 1000 - Date.now() : 6000
        await sleep(Math.min(Math.max(waitMs, 1000), 65_000))
        continue
      }
      if (res.status === 401) throw new AppError('INVALID_KEY', 'API Key 无效(401),请检查设置页的 Key')
      if (res.status === 404) throw new AppError('NOT_FOUND', '未找到目标(404)')
      if (!res.ok) throw new AppError('UNKNOWN', `官方 API 返回 ${res.status}`)

      return (await res.json()) as Doc
    }
  }
}
