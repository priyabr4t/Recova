import { useEffect, useState, useCallback, useRef } from 'react'

export function usePolling<T>(fn: () => Promise<T>, intervalMs: number, enabled = true) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  // Keep the fetcher in a ref so a new inline closure every render doesn't
  // tear down and restart the interval on each poll cycle.
  const fnRef = useRef(fn)
  fnRef.current = fn

  const fetchData = useCallback(async () => {
    try {
      const result = await fnRef.current()
      setData(result)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    fetchData()
    const id = setInterval(fetchData, intervalMs)
    return () => clearInterval(id)
  }, [fetchData, intervalMs, enabled])

  return { data, loading, refetch: fetchData }
}
