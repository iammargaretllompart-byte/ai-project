import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, LoaderCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import MoodboardSample, { directionStyles } from '@/components/MoodboardSample'
import { apiBaseUrl } from '@/lib/api'
import { isGenerating, type MoodboardPageData, type MoodboardSummary } from '@/lib/moodboards'
import { notify } from '@/lib/notifications'
import { copyText } from '@/lib/clipboard'

export default function MoodboardPage({ setId }: { setId: string }) {
  const [data, setData] = useState<MoodboardPageData | null>(null)
  const [error, setError] = useState('')
  const [missing, setMissing] = useState(false)
  const [revision, setRevision] = useState(0)
  const [isStarting, setIsStarting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const deleteRef = useRef<HTMLButtonElement | null>(null)
  const fontSpecification = JSON.stringify(data?.design?.directions.flatMap((direction) => [direction.typography.heading, direction.typography.body]))

  useEffect(() => {
    const previous = document.title
    document.title = data ? `Moodboards · ${data.search.prompt}` : 'Moodboards'
    return () => { document.title = previous }
  }, [data?.search.prompt])

  useEffect(() => {
    if (missing) document.getElementById('moodboard-page-title')?.focus()
  }, [missing])

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let fetching = false
    async function load() {
      if (fetching || controller.signal.aborted) return
      fetching = true
      clearTimeout(timer)
      try {
        const response = await fetch(`${apiBaseUrl}/moodboards/${encodeURIComponent(setId)}`, { signal: controller.signal })
        if (controller.signal.aborted) return
        if (response.status === 404) {
          setMissing(true)
          setData(null)
          return
        }
        if (!response.ok) throw new Error('Could not open this moodboard set. Please try again.')
        const next = await response.json() as MoodboardPageData
        if (controller.signal.aborted) return
        setData(next)
        setError('')
        setMissing(false)
        if (isGenerating(next) || next.activeSetId) timer = setTimeout(() => void load(), 3000)
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Could not open this moodboard set.')
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
  }, [setId, revision])

  useEffect(() => {
    if (!fontSpecification) return
    const fonts = new Map<string, Set<number>>()
    for (const font of JSON.parse(fontSpecification) as Array<{ family: string; weight: number }>) {
        const weights = fonts.get(font.family) ?? new Set<number>()
        weights.add(font.weight)
        fonts.set(font.family, weights)
    }
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?${[...fonts].sort(([a], [b]) => a.localeCompare(b)).map(([family, weights]) =>
      `family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${[...weights].sort((a, b) => a - b).join(';')}`).join('&')}&display=swap`
    document.head.append(link)
    return () => link.remove()
  }, [fontSpecification])

  useEffect(() => {
    if (!confirmDelete) return
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cancelRef.current?.focus()
    return () => { document.body.style.overflow = overflow }
  }, [confirmDelete])

  async function regenerate() {
    if (!data || isStarting || data.activeSetId) return
    setIsStarting(true)
    try {
      const response = await fetch(`${apiBaseUrl}/searches/${data.searchId}/moodboards`, { method: 'POST' })
      const next = await response.json() as MoodboardSummary & { error?: string }
      if (!response.ok) throw new Error(next.error ?? 'Could not start generation.')
      window.location.assign(`/moodboards/${next.id}`)
    } catch (cause) {
      notify('error', cause instanceof Error ? cause.message : 'Could not start generation.')
      setIsStarting(false)
    }
  }

  async function copyLink() {
    try {
      await copyText(`${window.location.origin}/moodboards/${setId}`)
      notify('success', 'Moodboard link copied.')
    } catch {
      notify('error', 'Could not copy the link. You can copy it from the address bar.')
    }
  }

  function closeDelete() {
    if (isDeleting) return
    setConfirmDelete(false)
    setDeleteError('')
    deleteRef.current?.focus()
  }

  async function deleteSet() {
    if (!data || isDeleting) return
    setIsDeleting(true)
    setDeleteError('')
    try {
      const response = await fetch(`${apiBaseUrl}/moodboards/${encodeURIComponent(setId)}`, { method: 'DELETE' })
      if (!response.ok && response.status !== 404) throw new Error('Could not delete this set. Please try again.')
      setConfirmDelete(false)
      setMissing(true)
      setData(null)
      setRevision((value) => value + 1)
      notify('success', 'Moodboard set deleted.')
      document.getElementById('moodboard-page-title')?.focus()
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : 'Could not delete this set.')
    } finally {
      setIsDeleting(false)
    }
  }

  const backUrl = data ? `/search?search=${data.searchId}&from=history` : '/history'
  return (
    <main className="app-canvas min-h-screen pb-16 text-white">
      <div className="page-container">
        <nav aria-label="Breadcrumb" className="page-header mb-10 flex-wrap gap-4 border-b border-white/10">
          <Button asChild size="icon" variant="outline"><a href={backUrl} aria-label="Back to search results" title="Back to search results"><ArrowLeft className="h-4 w-4" /></a></Button>
          <div className="flex items-center gap-2 text-sm text-neutral-400"><a href="/history" className="hover:text-white">History</a><span aria-hidden="true">/</span><span aria-current="page" className="text-[#85B9F1]">Moodboards</span></div>
        </nav>
        {missing ? <section className="glass-surface frosted-surface rounded-2xl p-8">
          <h1 className="headline-h1 outline-none" id="moodboard-page-title" tabIndex={-1}>This moodboard is unavailable</h1>
          <p className="mt-4 text-neutral-300">The set may have been deleted, or the link may be incorrect.</p>
          <Button asChild variant="outline" className="mt-6"><a href="/history">Your history</a></Button>
        </section> : !data ? <section className="py-16" role="status">
          {error ? <><p role="alert">{error}</p><Button className="mt-4" onClick={() => setRevision((value) => value + 1)}>Try again</Button></> : <p className="flex items-center gap-3"><LoaderCircle className="h-5 w-5 animate-spin" /> Opening moodboards…</p>}
        </section> : <>
          <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0 max-w-3xl">
              <h1 className="headline-h1" id="moodboard-page-title">Three directions, one brief</h1>
              <p className="mt-4 break-words leading-7 text-neutral-300">{data.search.prompt}</p>
              <p className="mt-3 text-xs text-neutral-500">Created {new Date(data.createdAt).toLocaleString()} · {data.search.photos.length} preserved references</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Button variant="outline" onClick={() => void copyLink()}>Copy share link</Button>
              <Button disabled={isStarting || Boolean(data.activeSetId)} onClick={() => void regenerate()}>{isStarting ? 'Starting…' : data.status === 'failed' ? 'Retry generation' : 'Regenerate'}</Button>
              <Button ref={deleteRef} variant="outline" className="border-red-400/40 text-red-200 hover:bg-red-500/10 hover:text-red-100" onClick={() => setConfirmDelete(true)}>Delete set</Button>
            </div>
          </header>
          {error ? <p role="alert" className="mt-6 text-red-300">{error}</p> : null}
          {data.activeSetId && data.activeSetId !== data.id ? <p className="mt-6 text-sm text-neutral-300">A new set is generating. <a className="text-[#85B9F1] underline" href={`/moodboards/${data.activeSetId}`}>Open its progress</a></p> : null}
          {isGenerating(data) ? <section className="glass-surface frosted-surface mt-8 rounded-2xl p-8" role="status">
            <p className="flex items-center gap-3"><LoaderCircle className="h-5 w-5 animate-spin text-[#85B9F1]" />{data.stage}</p>
            <p className="mt-4 text-neutral-400">The three directions are being generated in the background. You can leave and reopen this same link.</p>
          </section> : data.status === 'failed' ? <p className="glass-surface mt-8 rounded-2xl p-8 text-red-300" role="alert">{data.error}</p> : data.design ? <>
            <nav aria-label="Moodboard directions" className="mt-8 grid gap-4 md:grid-cols-3">
              {data.design.directions.map((direction, index) => <a key={direction.risk} href={`#${direction.risk.toLowerCase()}`} className="glass-surface frosted-surface rounded-2xl p-5 transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#85B9F1]">
                <p className="text-xs uppercase tracking-wider text-[#85B9F1]">0{index + 1} · {direction.risk}</p>
                <h2 className="headline-h3 mt-3">{direction.title}</h2>
                <div className="mt-4 flex overflow-hidden rounded-md">{direction.palette.map((colour) => <span key={colour.role} className="h-3 flex-1" style={{ backgroundColor: colour.hex }} />)}</div>
              </a>)}
            </nav>
            <p className="mt-6 text-sm leading-6 text-neutral-400">Sample format: {data.design.sampleFormat.replace(/-/g, ' ')} · {data.design.sampleFormatReason}</p>
            <div className="mt-10 space-y-12">
              {data.design.directions.map((direction, index) => {
                const styles = directionStyles(direction)
                const photos = direction.references.map((reference) => data.search.photos.find((photo) => photo.id === reference.photoId)!).filter(Boolean)
                return <section key={direction.risk} id={direction.risk.toLowerCase()} aria-labelledby={`${direction.risk}-title`} className="moodboard-direction glass-surface frosted-surface scroll-mt-6 rounded-3xl p-5 sm:p-8">
                  <header className="mb-8"><p className="text-xs uppercase tracking-[0.2em] text-[#85B9F1]">0{index + 1} · {direction.risk}</p>
                    <h2 id={`${direction.risk}-title`} className="headline-h1 mt-3">{direction.title}</h2><p className="mt-4 max-w-4xl leading-7 text-neutral-300">{direction.summary}</p>
                  </header>
                  <div className="grid items-start gap-8 lg:grid-cols-2">
                    <div>
                      <h3 className="headline-h3 mb-4">Reference collage</h3>
                      <div className="moodboard-collage" data-count={photos.length}>{photos.map((photo) => <figure key={photo.id}>
                        <img src={`${apiBaseUrl}${photo.url}`} alt={photo.name ?? photo.originalName} loading="lazy" />
                        <figcaption>{photo.name ?? photo.originalName}</figcaption>
                      </figure>)}</div>
                      <p className="mt-5 text-sm leading-7 text-neutral-300">{direction.rationale}</p>
                      <details className="mt-5 text-sm leading-6 text-neutral-400"><summary className="cursor-pointer text-neutral-300">Why these references</summary>
                        {direction.references.map((reference) => <div className="mt-4" key={reference.photoId}><p className="font-medium text-neutral-200">{photos.find((photo) => photo.id === reference.photoId)?.name ?? 'Reference'}</p><p className="mt-1">{reference.reason}</p></div>)}
                      </details>
                    </div>
                    <div className="space-y-8">
                      <section><h3 className="headline-h3 mb-4">Typography pairing</h3>
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                          <p className="text-xs text-neutral-500">{direction.typography.heading.family} · {direction.typography.heading.weight}</p>
                          <p className="mt-3 break-words text-4xl leading-tight sm:text-5xl" style={styles.heading}>{direction.sample.headline}</p>
                          <p className="mt-6 text-xs text-neutral-500">{direction.typography.body.family} · {direction.typography.body.weight}</p>
                          <p className="mt-3 text-base leading-7" style={styles.body}>{direction.sample.description}</p>
                        </div><p className="mt-4 text-sm leading-6 text-neutral-400">{direction.typography.rationale}</p>
                      </section>
                      <section><h3 className="headline-h3 mb-4">Colour palette</h3>
                        <div className="grid grid-cols-5 gap-2 sm:gap-3">{direction.palette.map((colour) => <div key={colour.role}>
                          <div className="h-16 rounded-lg border border-white/15 sm:h-20" style={{ backgroundColor: colour.hex }} />
                          <p className="mt-2 text-[10px] capitalize text-neutral-400 sm:text-xs">{colour.role}</p><p className="mt-1 text-[10px] text-neutral-200 sm:text-xs">{colour.hex}</p>
                        </div>)}</div>
                        <details className="mt-5 text-sm leading-6 text-neutral-400"><summary className="cursor-pointer text-neutral-300">Colour origins and refinements</summary>
                          {direction.palette.map((colour) => <div key={colour.role} className="mt-3"><p className="text-neutral-200"><span className="capitalize">{colour.role}</span> · {data.search.photos.find((photo) => photo.id === colour.sourcePhotoId)?.name ?? 'Saved reference'}</p><p className="mt-1">{colour.rationale}</p></div>)}
                        </details>
                      </section>
                    </div>
                  </div>
                  <section className="mt-8 border-t border-white/10 pt-8"><h3 className="headline-h3 mb-4">Design sample</h3>
                    <MoodboardSample direction={direction} format={data.design!.sampleFormat} photos={photos} />
                  </section>
                  <a href="#moodboard-page-title" className="mt-6 inline-block text-sm text-neutral-400 hover:text-white">Back to overview</a>
                </section>
              })}
            </div>
          </> : null}
        </>}
      </div>
      {confirmDelete ? <div role="alertdialog" aria-modal="true" aria-labelledby="delete-set-title" aria-describedby="delete-set-description" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[6px]"
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.preventDefault(); closeDelete() }
          if (event.key !== 'Tab') return
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
          const first = buttons[0], last = buttons[buttons.length - 1]
          if (!first) { event.preventDefault(); return }
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
        }}>
        <section className="glass-surface frosted-surface w-full max-w-xl rounded-2xl p-6"><header className="flex items-center justify-between gap-4"><h2 className="headline-h3" id="delete-set-title">Delete this moodboard set?</h2><Button size="icon" variant="outline" aria-label="Cancel deletion" disabled={isDeleting} onClick={closeDelete}><X className="h-4 w-4" /></Button></header>
          <p className="mt-4 leading-7 text-neutral-300" id="delete-set-description">This permanently removes this set of three directions. Its shared link will stop working. Your search and other sets are preserved. This cannot be undone.</p>
          {deleteError ? <p className="mt-4 text-sm text-red-300" role="alert">{deleteError}</p> : null}
          <div className="mt-6 flex justify-end gap-3"><Button ref={cancelRef} variant="outline" disabled={isDeleting} onClick={closeDelete}>Cancel</Button><Button className="bg-red-500 text-white hover:bg-red-400" disabled={isDeleting} onClick={() => void deleteSet()}>{isDeleting ? 'Deleting…' : 'Delete permanently'}</Button></div>
        </section>
      </div> : null}
    </main>
  )
}
