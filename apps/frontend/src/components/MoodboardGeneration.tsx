import { useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiBaseUrl } from '@/lib/api'
import { isGenerating, moodboardStatus, type MoodboardSet, type MoodboardSummary } from '@/lib/moodboards'
import { notify } from '@/lib/notifications'

export default function MoodboardGeneration({ searchId }: { searchId: string }) {
  const [sets, setSets] = useState<MoodboardSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<MoodboardSet | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [revision, setRevision] = useState(0)
  const mounted = useRef(true)
  const active = sets.find(isGenerating)
  const selected = sets.find((set) => set.id === selectedId)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let fetching = false
    async function load() {
      if (fetching || controller.signal.aborted) return
      fetching = true
      clearTimeout(timer)
      let retry = true
      try {
        const response = await fetch(`${apiBaseUrl}/searches/${encodeURIComponent(searchId)}/moodboards`, { signal: controller.signal })
        if (!response.ok) {
          retry = response.status !== 404
          throw new Error(response.status === 404 ? 'This saved search was deleted.' : 'Could not load saved moodboard sets.')
        }
        const data = await response.json() as { sets: MoodboardSummary[] }
        if (controller.signal.aborted) return
        setSets(data.sets)
        setError('')
        setSelectedId((current) => data.sets.some((set) => set.id === current) ? current : data.sets[0]?.id ?? null)
        if (data.sets.some(isGenerating)) timer = setTimeout(() => void load(), 3000)
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Could not load moodboard sets.')
          if (retry) timer = setTimeout(() => void load(), 5000)
        }
      } finally {
        fetching = false
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }
    void load()
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => { controller.abort(); clearTimeout(timer); window.removeEventListener('focus', onFocus) }
  }, [searchId, revision])

  useEffect(() => {
    setDetail(null)
    setDetailError('')
    if (!selectedId || selected?.status !== 'ready') return
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/moodboards/${encodeURIComponent(selectedId)}`, { signal: controller.signal })
        if (!response.ok) throw new Error('Could not open this moodboard set.')
        const data = await response.json() as MoodboardSet
        if (!controller.signal.aborted) setDetail(data)
      } catch (cause) {
        if (!controller.signal.aborted) setDetailError(cause instanceof Error ? cause.message : 'Could not open moodboard set.')
      }
    })()
    return () => controller.abort()
  }, [selectedId, selected?.status, revision])

  async function generate() {
    if (isStarting || active) return
    setIsStarting(true)
    try {
      const response = await fetch(`${apiBaseUrl}/searches/${encodeURIComponent(searchId)}/moodboards`, { method: 'POST' })
      const data = await response.json() as MoodboardSummary & { error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Could not start moodboard generation.')
      if (!mounted.current) return
      setSelectedId(data.id)
      setSets((current) => [data, ...current.filter((set) => set.id !== data.id)])
      setRevision((value) => value + 1)
      notify('success', 'Moodboard generation started. You can leave this page and return through History.')
    } catch (cause) {
      if (mounted.current) notify('error', cause instanceof Error ? cause.message : 'Could not start moodboard generation.')
    } finally {
      if (mounted.current) setIsStarting(false)
    }
  }

  return (
    <section className="mt-10 border-t border-white/10 pt-8" aria-labelledby="moodboard-generation-title">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="headline-h1" id="moodboard-generation-title">Explore three directions</h2>
          <p className="mt-3 max-w-2xl text-neutral-300">Turn these references into Grounded, Exploratory, and Bold design directions. Each set is saved so you can revisit it.</p>
        </div>
        <Button disabled={isLoading || isStarting || Boolean(active) || Boolean(error)} onClick={() => void generate()}>
          {isStarting ? 'Starting…' : active ? 'Generating…' : sets[0]?.status === 'failed' ? 'Retry generation' : sets.some((set) => set.status === 'ready') ? 'Regenerate moodboards' : 'Generate moodboards'}
        </Button>
      </header>
      {isLoading ? <p className="mt-6 text-sm text-neutral-400" role="status">Loading saved sets…</p> : null}
      {error || detailError ? <div className="mt-6"><p className="text-sm text-red-300" role="alert">{error || detailError}</p><Button variant="outline" className="mt-3" onClick={() => setRevision((value) => value + 1)}>Try again</Button></div> : null}
      {sets.length ? (
        <div className="mt-6 flex flex-wrap gap-3" aria-label="Saved moodboard sets">
          {sets.map((set, index) => <Button key={set.id} variant="outline" aria-pressed={set.id === selectedId}
            className={set.id === selectedId ? 'border-[#85B9F1]/60 text-[#C2DCF8]' : ''} onClick={() => setSelectedId(set.id)}>
            Set {sets.length - index} · {moodboardStatus(set)}
          </Button>)}
        </div>
      ) : null}
      {selected && isGenerating(selected) ? <div className="glass-surface frosted-surface mt-6 flex items-start gap-3 rounded-2xl p-6" role="status">
        <LoaderCircle className="mt-1 h-5 w-5 shrink-0 animate-spin text-[#85B9F1]" />
        <div><p>{selected.stage}</p><p className="mt-2 text-sm text-neutral-400">Generation continues in the background. History will show when it’s ready.</p></div>
      </div> : null}
      {selected?.status === 'failed' ? <p className="mt-6 text-sm text-red-300" role="alert">{selected.error}</p> : null}
      {selected ? <Button asChild variant="outline" className="mt-5"><a href={`/moodboards/${selected.id}`}>Open moodboard set</a></Button> : null}
      {detail?.design ? (
        <div className="mt-6">
          <p className="mb-5 text-sm text-neutral-400">Saved direction plan · {detail.design.sampleFormat.replace(/-/g, ' ')} samples · {detail.design.sampleFormatReason}</p>
          <div className="grid gap-5 lg:grid-cols-3">
            {detail.design.directions.map((direction) => <article key={direction.risk} className="glass-surface frosted-surface rounded-2xl p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-[#85B9F1]">{direction.risk}</p>
              <h3 className="headline-h3 mt-3">{direction.title}</h3>
              <p className="mt-4 text-sm leading-6 text-neutral-300">{direction.summary}</p>
              <div className="mt-5 grid grid-cols-5 gap-2">{direction.palette.map((colour) => <div key={colour.role}>
                <div className="h-12 rounded-md border border-white/15" style={{ backgroundColor: colour.hex }} title={`${colour.role}: ${colour.hex}`} />
                <p className="mt-2 text-[10px] text-neutral-400">{colour.hex}</p>
              </div>)}</div>
              <p className="mt-5 text-sm text-neutral-300">{direction.typography.heading.family} + {direction.typography.body.family}</p>
              <details className="mt-5 text-sm leading-6 text-neutral-400">
                <summary className="cursor-pointer text-neutral-300">Direction rationale</summary>
                <p className="mt-3">{direction.rationale}</p><p className="mt-3">{direction.typography.rationale}</p>
                {direction.references.map((reference) => <p key={reference.photoId} className="mt-3">{reference.reason}</p>)}
              </details>
            </article>)}
          </div>
        </div>
      ) : null}
    </section>
  )
}
