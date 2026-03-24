/// <reference types="vite/client" />

import type { HaqlyApi } from '@shared/api'

declare global {
  interface Window {
    haqlyApi: HaqlyApi
  }
}

export {}
