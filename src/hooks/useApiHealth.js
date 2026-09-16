import { useEffect, useState } from 'react'

export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5005'

/**
 * Polls the forecasting API so the shell can tell the truth about whether a
 * model is actually serving.
 *
 * Returns { state, modelLoaded } where state is 'checking' | 'online' | 'offline'.
 * `modelLoaded` distinguishes "API up but running on baselines" from "API up
 * with the trained ConvLSTM loaded" — the health endpoint reports both, and
 * conflating them would let the sidebar claim a model that isn't there.
 */
export function useApiHealth(intervalMs = 30000) {
  const [health, setHealth] = useState({ state: 'checking', modelLoaded: false })

  useEffect(() => {
    let cancelled = false
    let timer

    const check = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/health`)
        if (!res.ok) throw new Error('unhealthy')
        const data = await res.json()
        if (!cancelled) {
          setHealth({ state: 'online', modelLoaded: Boolean(data.model_loaded) })
        }
      } catch {
        if (!cancelled) setHealth({ state: 'offline', modelLoaded: false })
      }
    }

    check()
    timer = setInterval(check, intervalMs)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [intervalMs])

  return health
}
