import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, LoaderCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiBaseUrl } from '@/lib/api'
import { notify } from '@/lib/notifications'
import { isGenerating, moodboardStatus, type MoodboardSummary } from '@/lib/moodboards'

type SearchSummary = {
  id: string
  prompt: string
  createdAt: string
  photoCount: number
  previews: Array<{ id: string; name?: string; url: string }>
  moodboardSets: MoodboardSummary[]
}

const pageSize = 12
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export default function HistoryPage() {
  const [searches, setSearches] = useState<SearchSummary[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedSearches, setSelectedSearches] = useState<SearchSummary[]>([])
  const [pendingDelete, setPendingDelete] = useState<SearchSummary[] | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const cancelRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let fetching = false
    setIsLoading(true)
    setError('')
    async function load() {
      if (fetching || controller.signal.aborted) return
      fetching = true
      clearTimeout(timer)
      try {
        const response = await fetch(`${apiBaseUrl}/searches?limit=${pageSize}&offset=${offset}`, { signal: controller.signal })
        if (!response.ok) throw new Error('Could not load your search history. Please try again.')
        const data = await response.json() as { searches: SearchSummary[]; total: number }
        if (controller.signal.aborted) return
        if (offset > 0 && offset >= data.total) {
          setOffset(Math.max(0, Math.ceil(data.total / pageSize) - 1) * pageSize)
          return
        }
        setSearches(data.searches)
        setTotal(data.total)
        setError('')
        if (data.searches.some((search) => search.moodboardSets.some(isGenerating))) timer = setTimeout(() => void load(), 3000)
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Could not load your search history.')
          timer = setTimeout(() => void load(), 5000)
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
  }, [offset, revision])

  const closeDelete = useCallback(() => {
    if (isDeleting) return
    setPendingDelete(null)
    setDeleteError('')
    returnFocusRef.current?.focus()
  }, [isDeleting])

  useEffect(() => {
    if (!pendingDelete) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cancelRef.current?.focus()
    return () => { document.body.style.overflow = previousOverflow }
  }, [pendingDelete])

  async function deleteSearch() {
    if (!pendingDelete || isDeleting) return
    setIsDeleting(true)
    setDeleteError('')
    try {
      const response = await fetch(`${apiBaseUrl}/searches`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: pendingDelete.map((search) => search.id) }),
      })
      if (!response.ok) throw new Error('Could not delete the selected searches. Please try again.')
      setPendingDelete(null)
      setSelectedSearches([])
      setIsSelectionMode(false)
      setRevision((value) => value + 1)
      notify('success', pendingDelete.length === 1 ? 'Search deleted from history.' : 'Selected searches deleted from history.')
      document.getElementById('history-heading')?.focus()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not delete this search.'
      setDeleteError(message)
      notify('error', message)
    } finally {
      setIsDeleting(false)
    }
  }

  function toggleSearchSelection(search: SearchSummary) {
    setSelectedSearches((current) => current.some((item) => item.id === search.id)
      ? current.filter((item) => item.id !== search.id)
      : [...current, search])
  }

  return (
    <main className="app-canvas min-h-screen pb-8 text-white">
      <div className="page-container">
      <nav aria-label="Breadcrumb" className="page-header mb-10 flex-wrap gap-4 border-b border-white/10">
        <Button asChild size="icon" variant="outline">
          <a href="/search" aria-label="Back to search" title="Back to search"><ArrowLeft className="h-4 w-4" /></a>
        </Button>
        <div className="flex items-center gap-2 text-sm text-neutral-400">
          <a className="transition-colors hover:text-white" href="/search">Visual Search</a>
          <span aria-hidden="true" className="text-neutral-600">/</span>
          <span aria-current="page" className="text-[#85B9F1]">History</span>
        </div>
      </nav>

        <header>
          <h1 className="headline-h1 outline-none" id="history-heading" tabIndex={-1}>Your history</h1>
          <p className="mt-3 max-w-2xl text-neutral-300">
            Pick up where you left off. Your original results and reference images are saved with every completed search.
          </p>
        </header>

      <section className="mt-8 pb-12" aria-busy={isLoading}>
        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-neutral-300" role="status">
            <LoaderCircle className="h-5 w-5 animate-spin text-[#85B9F1]" /> Loading your history
          </div>
        ) : error ? (
          <div className="frosted-surface rounded-2xl p-8">
            <p role="alert" className="text-neutral-200">{error}</p>
            <Button className="mt-4" onClick={() => setRevision((value) => value + 1)}>Try again</Button>
          </div>
        ) : total === 0 ? (
          <div className="frosted-surface rounded-2xl px-6 py-16 text-center">
            <h2 className="headline-h3">Your next idea starts here</h2>
            <p className="mx-auto mt-4 max-w-lg leading-7 text-neutral-300">
              No searches saved yet. Search your library and your results will appear here, ready to revisit.
            </p>
            <Button asChild className="mt-6"><a href="/search">Start a search</a></Button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-h-10 items-center gap-3">
                <span className="relative top-1 text-sm text-neutral-400">{total} saved {total === 1 ? 'search' : 'searches'}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {isSelectionMode ? (
                  <>
                    <Button variant="outline" className="border-red-400/40 text-red-200 hover:bg-red-500/10 hover:text-red-100"
                      disabled={selectedSearches.length === 0}
                      onClick={(event) => {
                        returnFocusRef.current = event.currentTarget
                        setDeleteError('')
                        setPendingDelete([...selectedSearches])
                      }}>Delete selected ({selectedSearches.length})</Button>
                    <Button variant="outline" onClick={() => { setIsSelectionMode(false); setSelectedSearches([]) }}>Cancel selection</Button>
                  </>
                ) : <Button variant="outline" onClick={() => setIsSelectionMode(true)}>Select</Button>}
              </div>
            </div>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {searches.map((search) => {
                const isSelected = selectedSearches.some((item) => item.id === search.id)
                const cardContent = (
                  <>
                    <div className="grid aspect-[4/3] grid-cols-3 gap-1 overflow-hidden bg-black/20">
                      {search.previews.length ? search.previews.map((photo) => (
                        <img key={photo.id} src={`${apiBaseUrl}${photo.url}`} alt={photo.name ?? 'Saved reference'} loading="lazy"
                          className="h-full min-h-0 w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
                      )) : <p className="col-span-3 self-center text-center text-sm text-neutral-400">No matching references</p>}
                    </div>
                    <div className="space-y-4 p-4">
                      <h2 className="headline-h3 break-words">{search.prompt}</h2>
                      <p className="text-xs text-neutral-500">Searched <time dateTime={search.createdAt}>{dateFormat.format(new Date(search.createdAt))}</time></p>
                      <p className="text-sm text-neutral-400">{search.photoCount} selected {search.photoCount === 1 ? 'reference' : 'references'}</p>
                      {search.moodboardSets.length ? <p className={`text-xs ${search.moodboardSets[0].status === 'failed' ? 'text-red-300' : 'text-[#C2DCF8]'}`}>
                        Moodboards · {moodboardStatus(search.moodboardSets.find(isGenerating) ?? search.moodboardSets[0])} · {search.moodboardSets.filter((set) => set.status === 'ready').length} saved {search.moodboardSets.filter((set) => set.status === 'ready').length === 1 ? 'set' : 'sets'}
                      </p> : null}
                    </div>
                  </>
                )
                const cardClassName = 'group block h-full w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#85B9F1]'
                return (
                  <article key={search.id} className={`glass-surface frosted-surface relative min-w-0 overflow-hidden rounded-2xl transition-transform hover:-translate-y-0.5 ${isSelected ? 'border-[#85B9F1] ring-1 ring-[#85B9F1]' : 'border-white/10'}`}>
                    {isSelectionMode ? (
                      <label className="absolute left-3 top-3 z-10 flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-black/75 px-3 py-2 text-sm text-white shadow-lg backdrop-blur-xl">
                        <input type="checkbox" checked={isSelected} className="h-4 w-4 accent-[#85B9F1]"
                          aria-label={`Select search: ${search.prompt}`} onChange={() => toggleSearchSelection(search)} />
                        Select
                      </label>
                    ) : null}
                    {isSelectionMode ? (
                      <button type="button" className={cardClassName} aria-label={`${isSelected ? 'Deselect' : 'Select'} search: ${search.prompt}`}
                        aria-pressed={isSelected} onClick={() => toggleSearchSelection(search)}>{cardContent}</button>
                    ) : (
                      <a href={`/search?search=${encodeURIComponent(search.id)}&from=history`} className={cardClassName}
                        aria-label={`Open search: ${search.prompt}`}>{cardContent}</a>
                    )}
                  </article>
                )
              })}
            </div>
            <nav aria-label="History pages" className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-neutral-400">Showing {offset + 1}–{Math.min(offset + pageSize, total)} of {total}</p>
              <div className="flex gap-3">
                <Button variant="outline" disabled={offset === 0} onClick={() => setOffset((value) => Math.max(0, value - pageSize))}>Previous</Button>
                <Button variant="outline" disabled={offset + pageSize >= total} onClick={() => setOffset((value) => value + pageSize)}>Next</Button>
              </div>
            </nav>
          </>
        )}
      </section>
      </div>

      {pendingDelete ? (
        <div role="alertdialog" aria-modal="true" aria-labelledby="delete-search-title" aria-describedby="delete-search-description"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[6px]"
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); closeDelete() }
            if (event.key !== 'Tab') return
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
            const first = buttons[0]
            const last = buttons[buttons.length - 1]
            if (!first) { event.preventDefault(); return }
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
          }}>
          <section className="frosted-surface w-full max-w-xl rounded-2xl p-6">
            <header className="flex items-center justify-between gap-4">
              <h2 className="headline-h3" id="delete-search-title">{pendingDelete.length === 1 ? 'Delete this search?' : `Delete ${pendingDelete.length} searches?`}</h2>
              <Button size="icon" variant="outline" aria-label="Cancel deletion" disabled={isDeleting} onClick={closeDelete}><X className="h-4 w-4" /></Button>
            </header>
            <p id="delete-search-description" className="mt-4 break-words leading-7 text-neutral-300">
              This permanently removes {pendingDelete.length === 1 ? `“${pendingDelete[0].prompt}”` : 'the selected searches'} and {pendingDelete.length === 1 ? 'its' : 'their'} saved reference snapshots from history. {pendingDelete.length === 1 ? 'Its saved link' : 'Their saved links'} will stop working. This cannot be undone.
            </p>
            {deleteError ? <p role="alert" className="mt-4 text-sm text-red-300">{deleteError}</p> : null}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button ref={cancelRef} variant="outline" disabled={isDeleting} onClick={closeDelete}>Cancel</Button>
              <Button disabled={isDeleting} className="bg-red-500 text-white hover:bg-red-400" onClick={() => void deleteSearch()}>{isDeleting ? 'Deleting…' : 'Delete permanently'}</Button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}
