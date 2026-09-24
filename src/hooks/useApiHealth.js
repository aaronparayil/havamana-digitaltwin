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

    /* While the API is down (it takes ~20 s to boot) check every few seconds,
       so the status pill turns green promptly; once it is up, back off. */
    const check = async () => {
      let next = 'offline'
      try {
        const res = await fetch(`${API_BASE}/api/health`)
        if (!res.ok) throw new Error('unhealthy')
        const data = await res.json()
        next = 'online'
        if (!cancelled) setHealth({ state: 'online', modelLoaded: Boolean(data.model_loaded) })
      } catch {
        if (!cancelled) setHealth({ state: 'offline', modelLoaded: false })
      }
      if (!cancelled) timer = setTimeout(check, next === 'online' ? intervalMs : 4000)
    }

    check()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [intervalMs])

  return health
}
