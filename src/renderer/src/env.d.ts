import type { ChiefApi } from '../../shared/types'

declare global {
  interface Window {
    chief: ChiefApi
  }
}

export {}