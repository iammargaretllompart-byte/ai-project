import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, LoaderCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiBaseUrl } from '@/lib/api'
import { isGenerating, type MoodboardPageData } from '@/lib/moodboards'
import { notify } from '@/lib/notifications'
import { copyText } from '@/lib/clipboard'
import MoodboardDirectionBoard from '@/components/MoodboardDirectionBoard'

export default function MoodboardPage({ setId }: { setId: string }) {
  const [data, setData] = useState<MoodboardPageData | null>(null)
  const [error, setError] = useState('')
  const [missing, setMissing] = useState(false)
  const [revision, setRevision] = useState(0)
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

  const backUrl = data ? `/search?search=${data.searchId}&from=history&view=moodboards` : '/history'
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
          <Button asChild variant="outline" className="mt-6"><a href="/history">Search History</a></Button>
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
              <Button ref={deleteRef} variant="outline" className="border-red-400/40 text-red-200 hover:bg-red-500/10 hover:text-red-100" onClick={() => setConfirmDelete(true)}>Delete set</Button>
            </div>
          </header>
          {error ? <p role="alert" className="mt-6 text-red-300">{error}</p> : null}
          {data.activeSetId && data.activeSetId !== data.id ? <p className="mt-6 text-sm text-neutral-300">A new set is generating. <a className="text-[#85B9F1] underline" href={`/moodboards/${data.activeSetId}`}>Open its progress</a></p> : null}
          {isGenerating(data) ? <section className="glass-surface frosted-surface mt-8 rounded-2xl p-8" role="status">
            <p className="flex items-center gap-3"><LoaderCircle className="h-5 w-5 animate-spin text-[#85B9F1]" />{data.stage}</p>
            <p className="mt-4 text-neutral-400">The three directions are being generated in the background. You can leave and reopen this same link.</p>
          </section> : data.status === 'failed' ? <section className="glass-surface mt-8 rounded-2xl p-8" role="alert">
            <h2 className="headline-h3">{data.stage === 'More relevant references needed' ? 'More relevant references needed' : 'This set couldn’t be generated'}</h2>
            <p className="mt-4 leading-7 text-red-200">{data.error}</p>
            {data.stage === 'More relevant references needed' ? <div className="mt-5 flex flex-wrap gap-3"><Button asChild variant="outline"><a href="/admin">Add references</a></Button><Button asChild variant="outline"><a href="/search">Start a new search</a></Button></div> : null}
          </section> : data.design ? <>
            {data.design.referenceAssessment?.coverage === 'approximate' ? <section className="mt-6 rounded-xl border border-amber-200/20 bg-amber-200/5 p-5" role="note" aria-label="Approximate interpretation">
              <h2 className="text-sm font-medium text-amber-200">Approximate interpretation</h2><p className="mt-2 text-sm leading-6 text-neutral-300">{data.design.referenceAssessment.explanation}</p>
            </section> : null}
            <nav aria-label="Moodboard directions" className="mt-8 grid gap-4 md:grid-cols-3">
              {data.design.directions.map((direction, index) => <a key={direction.risk} href={`#${direction.risk.toLowerCase()}`} className="glass-surface frosted-surface rounded-2xl p-5 transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#85B9F1]">
                <p className="text-xs uppercase tracking-wider text-[#85B9F1]">0{index + 1} · {direction.risk}</p>
                <h2 className="headline-h3 mt-3">{direction.title}</h2>
                {direction.descriptors ? <p className="mt-3 text-xs leading-6 text-neutral-400">{direction.descriptors.join(' · ')}</p> : null}
                <div className="mt-4 flex overflow-hidden rounded-md">{direction.palette.map((colour) => <span key={colour.role} className="h-3 flex-1" style={{ backgroundColor: colour.hex }} />)}</div>
              </a>)}
            </nav>
            <div className="mt-10 space-y-12">
              {data.design.directions.map((direction, index) => {
                const photos = direction.references.map((reference) => data.search.photos.find((photo) => photo.id === reference.photoId)!).filter(Boolean)
                return <section key={direction.risk} id={direction.risk.toLowerCase()} aria-labelledby={`${direction.risk}-title`} className="moodboard-direction scroll-mt-6 border-t border-white/15 pt-8 sm:pt-10">
                  <div className="moodboard-direction-layout">
                  <div className="moodboard-direction-info">
                  <header className="mb-6"><p className="text-xs uppercase tracking-[0.2em] text-[#85B9F1]">0{index + 1} · {direction.risk}</p>
                    <h2 id={`${direction.risk}-title`} className="headline-h3 mt-3">{direction.title}</h2>
                    {direction.descriptors ? <p className="mt-3 text-sm font-medium tracking-wide text-neutral-400">{direction.descriptors.join(' · ')}</p> : null}
                    <p className="mt-4 text-sm leading-7 text-neutral-300">{direction.summary}</p>
                    {direction.chooseThisIf ? <p className="mt-4 max-w-4xl text-sm leading-6 text-neutral-400"><span className="font-medium text-neutral-200">Choose this if… </span>{direction.chooseThisIf}</p> : null}
                  </header>
                  <div className="space-y-6">
                    <details><summary className="cursor-pointer text-sm font-medium text-neutral-100">The direction</summary>
                      <p className="mt-3 text-sm leading-7 text-neutral-400">{direction.rationale}</p>
                      {direction.visualApproach ? <details className="mt-4 text-sm leading-7 text-neutral-400"><summary className="cursor-pointer text-neutral-200">Visual approach</summary>
                        {Object.entries(direction.visualApproach).map(([label, guidance]) => <p key={label} className="mt-3"><span className="capitalize text-neutral-200">{label}: </span>{guidance}</p>)}
                      </details> : null}
                    </details>
                    <section><h3 className="text-sm font-medium text-neutral-100">Typography pairing</h3>
                      <p className="mt-3 text-sm leading-7 text-neutral-300">{direction.typography.heading.family} · {direction.typography.heading.weight} <span className="text-neutral-500">/ Display</span><br />{direction.typography.body.family} · {direction.typography.body.weight} <span className="text-neutral-500">/ Body</span></p>
                      <details className="mt-3 text-sm leading-7 text-neutral-400"><summary className="cursor-pointer text-neutral-200">Why this pairing</summary><p className="mt-2">{direction.typography.rationale}</p></details>
                    </section>
                    <section><h3 className="text-sm font-medium text-neutral-100">Colour choices</h3>
                      <ul className="mt-3 space-y-2 text-xs text-neutral-300">{direction.palette.map(colour => <li key={colour.role} className="flex items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/25" style={{ backgroundColor: colour.hex }} /><span><span className="capitalize">{colour.role}</span> · {colour.hex}</span></li>)}</ul>
                      {direction.paletteUsage ? <p className="mt-3 text-sm leading-7 text-neutral-400">{direction.paletteUsage}</p> : null}
                      <details className="mt-3 text-sm leading-7 text-neutral-400"><summary className="cursor-pointer text-neutral-200">Palette details and origins</summary>
                        {direction.palette.map((colour) => <div key={colour.role} className="mt-4">
                          <p className="text-neutral-200">{colour.name ? `${colour.name} · ` : ''}<span className="capitalize">{colour.role}</span> · {colour.hex}</p>
                          <p className="mt-1">{colour.sourceBriefQuote ? `From the brief: “${colour.sourceBriefQuote}”` : `From ${data.search.photos.find((photo) => photo.id === colour.sourcePhotoId)?.name ?? 'saved reference'}`}</p><p className="mt-1">{colour.rationale}</p>
                        </div>)}
                      </details>
                    </section>
                  </div>
                  <details className="mt-6 rounded-xl border border-white/10 p-4 text-sm leading-7 text-neutral-400"><summary className="cursor-pointer text-neutral-200">Reference choices · {photos.length} used</summary>
                    {direction.references.map((reference) => {
                      const photo = photos.find((photo) => photo.id === reference.photoId)
                      return <div className="mt-4" key={reference.photoId}><p className="font-medium text-neutral-200">{photo?.name ?? photo?.originalName ?? 'Reference'}{photo?.matchType === 'partial' ? <span className="ml-2 text-xs font-normal text-amber-200">Partial match</span> : null}</p><p className="mt-1">{reference.reason}</p>
                        {photo?.matchType === 'partial' && photo.selectionReason ? <p className="mt-1 text-xs leading-6 text-neutral-500">Search limitation: {photo.selectionReason}</p> : null}
                      </div>
                    })}
                  </details>
                  <a href="#moodboard-page-title" className="mt-6 inline-block text-sm text-neutral-400 hover:text-white">Back to overview</a>
                  </div>
                  <MoodboardDirectionBoard direction={direction} photos={photos} />
                  </div>
                </section>
              })}
            </div>
            {data.design.excludedReferences?.length ? <details className="glass-surface mt-10 rounded-2xl p-5 text-sm leading-7 text-neutral-400"><summary className="cursor-pointer text-neutral-200">Reference choices · {data.design.excludedReferences.length} not used in this set</summary>
              {data.design.excludedReferences.map((reference) => <div className="mt-4" key={reference.photoId}><p className="font-medium text-neutral-200">{data.search.photos.find((photo) => photo.id === reference.photoId)?.name ?? 'Saved reference'}</p><p className="mt-1">{reference.reason}</p></div>)}
            </details> : null}
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
