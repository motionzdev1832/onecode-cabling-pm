import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errorMessage } from './api'

export interface FetchState<T> {
  data: T | null
  error: string | null
  loading: boolean
  refreshing: boolean
  reload: () => Promise<void>
  setData: (updater: T | ((prev: T | null) => T | null)) => void
}

/** Fetches JSON from the API. Keeps the previous data on reload (no skeleton flash). */
export function useFetch<T>(path: string | null): FetchState<T> {
  const [data, setDataState] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!path)
  const [refreshing, setRefreshing] = useState(false)
  const seq = useRef(0)

  const load = useCallback(async () => {
    if (!path) {
      setDataState(null)
      setLoading(false)
      return
    }
    const id = ++seq.current
    setRefreshing(true)
    try {
      const d = await api.get<T>(path)
      if (id === seq.current) {
        setDataState(d)
        setError(null)
      }
    } catch (e) {
      if (id === seq.current) setError(errorMessage(e))
    } finally {
      if (id === seq.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [path])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  const setData = useCallback((updater: T | ((prev: T | null) => T | null)) => {
    setDataState((prev) => (typeof updater === 'function' ? (updater as (p: T | null) => T | null)(prev) : updater))
  }, [])

  return { data, error, loading, refreshing, reload: load, setData }
}

/** True when the media query matches (updates on resize). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false))
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

/** Persist a small piece of UI state (filters, collapsed rows) in localStorage. */
export function useLocalState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  const set = useCallback(
    (v: T | ((p: T) => T)) => {
      setValue((prev) => {
        const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v
        try {
          localStorage.setItem(key, JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
    },
    [key],
  )
  return [value, set]
}
