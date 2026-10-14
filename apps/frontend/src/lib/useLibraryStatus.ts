import { useEffect, useState } from 'react'
import { apiBaseUrl } from '@/lib/api'

type LibraryStatus = { photoCount: number; minimumReferences: number; canSearch: boolean }

export function useLibraryStatus() {
  const [status, setStatus] = useState<LibraryStatus | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let fetching = false
    async function load() {
      if (fetching || controller.signal.aborted) return
      fetching = true
      clearTimeout(timer)
      try {
        const response = await fetch(`${apiBaseUrl}/library/status`, { signal: controller.signal })
        if (!response.ok) throw new Error('Could not check your reference library.')
        const next = await response.json() as LibraryStatus
        if (controller.signal.aborted) return
        setStatus(next)
        setError('')
      } catch {
        if (!controller.signal.aborted) {
          setError('Could not check your reference library. Please try again.')
          timer = setTimeout(() => void load(), 5000)
        }
      } finally {
        fetching = false
      }
    }
    void load()
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => { controller.abort(); clearTimeout(timer); window.removeEventListener('focus', onFocus) }
  }, [revision])
  return { status, error, canSearch: Boolean(status?.canSearch) && !error, refresh: () => setRevision((value) => value + 1) }
}
