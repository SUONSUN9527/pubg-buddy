import type { Api } from '../shared/ipc'

declare global {
  interface Window {
    /** Electron 环境下由 preload 注入;纯浏览器预览时为 undefined,走 mock */
    api?: Api
  }
}

export {}
