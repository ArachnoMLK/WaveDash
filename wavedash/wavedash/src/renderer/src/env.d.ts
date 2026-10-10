/// <reference types="vite/client" />
import type { WaveApi } from '@shared/types'
declare global { interface Window { api: WaveApi } }
