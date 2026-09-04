import { useEffect, useState, useCallback } from 'react'

export function usePolling<T>(fn: () => Promise<T>, intervalMs: number, enabled = true) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const result = await fn()
      setData(result)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [fn])

  useEffect(() => {
    if (!enabled) return
    fetchData()
    const id = setInterval(fetchData, intervalMs)
    return () => clearInterval(id)
  }, [fetchData, intervalMs, enabled])

  return { data, loading, refetch: fetchData }
}
