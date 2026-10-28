import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiBaseUrl } from '@/lib/api'
import { isGenerating, moodboardStatus, type MoodboardSet, type MoodboardSummary } from '@/lib/moodboards'
import { notify } from '@/lib/notifications'

function MoodboardSetCard({ set, number }: { set: MoodboardSummary; number: number }) {
  const [detail, setDetail] = useState<MoodboardSet | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (set.status !== 'ready') return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let fetching = false
    let loaded = false
    async function load() {
      if (fetching || loaded || controller.signal.aborted) return
      fetching = true
      clearTimeout(timer)
      let retry = true
      try {
        const response = await fetch(`${apiBaseUrl}/moodboards/${encodeURIComponent(set.id)}`, { signal: controller.signal })
        retry = response.status !== 404
        if (!response.ok) throw new Error('Preview unavailable. Open this card to view the saved moodboard.')
        const data = await response.json() as MoodboardSet
        if (!controller.signal.aborted) {
          setDetail(data)
          setError('')
          loaded = true
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Could not load the moodboard preview.')
          if (retry) timer = setTimeout(() => void load(), 5000)
        }
      } finally {
        fetching = false
      }
    }
    void load()
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => { controller.abort(); clearTimeout(timer); window.removeEventListener('focus', onFocus) }
  }, [set.id, set.status])

  return <li>
    <a href={`/moodboards/${set.id}`} aria-labelledby={`moodboard-set-${set.id}`} className="glass-surface frosted-surface group block rounded-2xl p-5 transition-colors hover:border-[#85B9F1]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#85B9F1] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h3 id={`moodboard-set-${set.id}`} className="headline-h3">Moodboard {number}</h3>
            <span className={`rounded-full border px-2.5 py-1 text-xs ${set.status === 'failed' ? 'border-red-300/25 text-red-300' : 'border-[#85B9F1]/25 text-[#C2DCF8]'}`}>{moodboardStatus(set)}</span>
          </div>
          <p className="mt-2 text-xs text-neutral-500">Created <time dateTime={set.createdAt}>{new Date(set.createdAt).toLocaleString()}</time></p>
        </div>
        <ArrowUpRight aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-neutral-400 transition-colors group-hover:text-[#C2DCF8]" />
      </div>
      {isGenerating(set) ? <div className="mt-5 flex items-start gap-3" role="status">
        <LoaderCircle className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-[#85B9F1]" />
        <div><p className="text-sm text-neutral-200">{set.stage}</p><p className="mt-2 text-sm text-neutral-400">Generation continues in the background. You can open this card to follow its progress.</p></div>
      </div> : null}
      {set.status === 'failed' ? <p className="mt-5 text-sm leading-6 text-red-300">{set.error}</p> : null}
      {set.status === 'ready' && !detail && !error ? <p className="mt-5 text-sm text-neutral-400" role="status">Loading direction previews…</p> : null}
      {error ? <p className="mt-5 text-sm text-neutral-400">{error}</p> : null}
      {detail?.design ? <>
        {detail.design.referenceAssessment?.coverage === 'approximate' ? <p className="mt-5 text-xs leading-6 text-amber-200">Approximate interpretation · {detail.design.referenceAssessment.explanation}</p> : null}
        <div className="mt-5 grid gap-5 border-t border-white/10 pt-5 lg:grid-cols-3">
          {detail.design.directions.map(direction => <section key={direction.risk} className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-[#85B9F1]">{direction.risk}</p>
            <h4 className="headline-h3 mt-2 break-words">{direction.title}</h4>
            {direction.descriptors ? <p className="mt-2 text-xs leading-6 text-neutral-400">{direction.descriptors.join(' · ')}</p> : null}
            <p className="mt-3 text-sm leading-6 text-neutral-300">{direction.summary}</p>
            <div className="mt-4 flex overflow-hidden rounded-md" aria-label={`${direction.title} colour palette`}>{direction.palette.map(colour => <span key={colour.role} className="h-6 min-w-0 flex-1" style={{ backgroundColor: colour.hex }} title={`${colour.role}: ${colour.hex}`} />)}</div>
            <p className="mt-3 text-xs leading-6 text-neutral-400">{direction.typography.heading.family} + {direction.typography.body.family}</p>
          </section>)}
        </div>
      </> : null}
    </a>
  </li>
}

export default function MoodboardGeneration({ searchId }: { searchId: string }) {
  const [sets, setSets] = useState<MoodboardSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const mounted = useRef(true)
  const active = sets.find(isGenerating)

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

  async function generate() {
    if (isStarting || active) return
    setIsStarting(true)
    try {
      const response = await fetch(`${apiBaseUrl}/searches/${encodeURIComponent(searchId)}/moodboards`, { method: 'POST' })
      const data = await response.json() as MoodboardSummary & { error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Could not start moodboard generation.')
      if (!mounted.current) return
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
    <section aria-labelledby="moodboard-generation-title">
      <header>
        <h2 className="headline-h1" id="moodboard-generation-title">Explore three directions</h2>
        <p className="mt-3 max-w-2xl text-neutral-300">Turn these references into Grounded, Exploratory, and Bold design directions.</p>
      </header>
      <div className="mt-10 flex justify-end sm:mt-12">
        <Button disabled={isLoading || isStarting || Boolean(active) || Boolean(error)} onClick={() => void generate()}>
          {isStarting ? 'Starting…' : active ? 'Generating…' : sets[0]?.status === 'failed' ? 'Retry generation' : sets.some((set) => set.status === 'ready') ? 'Create another moodboard' : 'Generate moodboards'}
        </Button>
      </div>
      {isLoading ? <p className="mt-6 text-sm text-neutral-400" role="status">Loading saved sets…</p> : null}
      {error ? <div className="mt-6"><p className="text-sm text-red-300" role="alert">{error}</p><Button variant="outline" className="mt-3" onClick={() => setRevision((value) => value + 1)}>Try again</Button></div> : null}
      {sets.length ? (
        <ul className="mt-4 space-y-5" aria-label="Saved moodboards">
          {sets.map((set, index) => <MoodboardSetCard key={set.id} set={set} number={sets.length - index} />)}
        </ul>
      ) : null}
    </section>
  )
}
