import type { Api } from '@shared/ipc'
import { mockApi } from './mock'

/** Electron 里用 preload 注入的真实 API;纯浏览器预览时兜底到演示数据 */
export const isMock = typeof window.api === 'undefined'
export const api: Api = window.api ?? mockApi

export function errorCode(e: unknown): string {
  return (e as { code?: string })?.code ?? 'UNKNOWN'
}
