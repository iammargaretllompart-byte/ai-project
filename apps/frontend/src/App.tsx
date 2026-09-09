import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  LoaderCircle,
  RefreshCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'

const apiBaseUrl = 'http://localhost:4000'

type Photo = {
  id: string
  name?: string
  originalName: string
  filename: string
  url: string
  keywords: string[]
  createdAt: string
}

type PhotoSearchResult = Photo & {
  score: number
  selectionReason?: string
}

type SearchResponse = {
  keywords: string[]
  photos: PhotoSearchResult[]
  candidatePhotos?: PhotoSearchResult[]
  debug?: SearchDebug
}

type SearchDebug = {
  searches: Array<{
    keywords: string[]
    results: number
  }>
  candidatePhotoCount: number
  selectedPhotoCount: number
  selectionMethod: 'ai'
  timingsMs: {
    search: number
    selection: number
    total: number
  }
}

function App() {
  if (window.location.pathname === '/admin') {
    return <AdminPage />
  }

  if (window.location.pathname === '/search') {
    return <SearchPage />
  }

  return (
    <main className="app-canvas min-h-screen text-white">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-20 text-center">
        <p className="mb-4 rounded-full border border-[#FF6A38]/30 bg-[#FF6A38]/10 px-4 py-1 text-sm font-medium text-[#ffb39a]">
          Vite + React + TypeScript + Tailwind + shadcn/ui
        </p>
        <h1 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-7xl">
          Build the frontend without fighting the stack.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-300">
          A clean modern starter with typed React, utility-first styling, and
          local, customizable UI components.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button size="lg">
            Start building
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button size="lg" variant="outline">
            View components
          </Button>
        </div>
      </section>
    </main>
  )
}

function AdminAccess() {
  return (
    <Button
      asChild
      className="h-11 w-11 rounded-full border-white/15 bg-white/[0.05] p-0 shadow-lg shadow-black/20"
      variant="outline"
    >
      <a aria-label="Open admin" href="/admin" title="Open admin">
        <UserRound className="h-5 w-5" />
      </a>
    </Button>
  )
}

const keywordChipClassName =
  'max-w-full truncate rounded-full bg-[#FF6A38]/10 px-2.5 py-1 text-xs font-medium text-[#ffb39a]'

function KeywordPreview({ keywords }: { keywords: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const measurementRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(keywords.length)

  useLayoutEffect(() => {
    const container = containerRef.current
    const measurement = measurementRef.current

    if (!container || !measurement) {
      return
    }

    const previewContainer = container
    const measurementContainer = measurement

    function calculateVisibleCount() {
      const availableWidth = previewContainer.clientWidth
      const elements = Array.from(
        measurementContainer.querySelectorAll<HTMLElement>('[data-keyword-chip]'),
      )
      const keywordWidths = elements
        .slice(0, keywords.length)
        .map((element) => element.getBoundingClientRect().width)
      const overflowWidth = elements.at(-1)?.getBoundingClientRect().width ?? 0
      const gap = 8

      function fits(widths: number[]) {
        let rows = 1
        let rowWidth = 0

        for (const width of widths) {
          if (rowWidth > 0 && rowWidth + gap + width > availableWidth) {
            rows += 1
            rowWidth = width
          } else {
            rowWidth += (rowWidth > 0 ? gap : 0) + width
          }
        }

        return rows <= 3
      }

      if (fits(keywordWidths)) {
        setVisibleCount(keywords.length)
        return
      }

      for (let count = keywords.length - 1; count >= 0; count -= 1) {
        if (fits([...keywordWidths.slice(0, count), overflowWidth])) {
          setVisibleCount(count)
          return
        }
      }

      setVisibleCount(0)
    }

    calculateVisibleCount()
    const observer = new ResizeObserver(calculateVisibleCount)
    observer.observe(previewContainer)
    return () => observer.disconnect()
  }, [keywords])

  const hiddenCount = keywords.length - visibleCount

  return (
    <div className="relative" ref={containerRef}>
      <div
        aria-hidden="true"
        className="invisible absolute inset-x-0 top-0 flex flex-wrap gap-2"
        ref={measurementRef}
      >
        {keywords.map((keyword, index) => (
          <span className={keywordChipClassName} data-keyword-chip key={`${keyword}-${index}`}>
            {keyword}
          </span>
        ))}
        <span className={keywordChipClassName} data-keyword-chip>
          {keywords.length} more
        </span>
      </div>
      <div className="flex min-h-[5.5rem] content-start flex-wrap gap-2">
        {keywords.slice(0, visibleCount).map((keyword, index) => (
          <span className={keywordChipClassName} key={`${keyword}-${index}`}>
            {keyword}
          </span>
        ))}
        {hiddenCount > 0 ? (
          <span className="max-w-full truncate rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-neutral-300">
            {hiddenCount} more
          </span>
        ) : null}
      </div>
    </div>
  )
}

function SearchPage() {
  const [prompt, setPrompt] = useState('')
  const [results, setResults] = useState<PhotoSearchResult[]>([])
  const [keywordsUsed, setKeywordsUsed] = useState<string[]>([])
  const [searchDebug, setSearchDebug] = useState<SearchDebug | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [message, setMessage] = useState('')
  const requestRef = useRef<AbortController | null>(null)

  const loadingMessages = [
    'Searching your library',
    'Reviewing candidate images',
    'Selecting the best references',
  ]

  useEffect(() => {
    if (!isSearching) {
      return
    }

    const interval = window.setInterval(() => {
      setLoadingStep((current) => (current + 1) % loadingMessages.length)
    }, 4500)

    return () => window.clearInterval(interval)
  }, [isSearching])

  useEffect(() => {
    if (!hasSearched) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [hasSearched])

  async function searchPhotos(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!prompt.trim()) {
      setMessage('Type a prompt before searching.')
      setResults([])
      setKeywordsUsed([])
      setSearchDebug(null)
      setHasSearched(false)
      return
    }

    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller

    setIsSearching(true)
    setLoadingStep(0)
    setMessage('')
    setResults([])
    setKeywordsUsed([])
    setSearchDebug(null)
    setHasSearched(true)

    try {
      const response = await fetch(`${apiBaseUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error ?? 'Could not search photos')
      }

      const data = (await response.json()) as SearchResponse

      if (requestRef.current !== controller) {
        return
      }

      setKeywordsUsed(data.keywords)
      setResults(data.photos)
      setSearchDebug(data.debug ?? null)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not complete the AI search.',
      )
      setResults([])
      setKeywordsUsed([])
      setSearchDebug(null)
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        setIsSearching(false)
      }
    }
  }

  function closeSearch() {
    requestRef.current?.abort()
    requestRef.current = null
    setHasSearched(false)
    setIsSearching(false)
    setLoadingStep(0)
    setMessage('')
    setResults([])
    setKeywordsUsed([])
    setSearchDebug(null)
  }

  return (
    <main className="app-canvas min-h-screen px-6 py-8 text-white">
      <nav aria-label="Account" className="mx-auto flex max-w-6xl justify-end">
        <AdminAccess />
      </nav>
      <div className="mx-auto flex min-h-[calc(100vh-7.75rem)] max-w-6xl items-center">
        <section className="glass-surface w-full rounded-3xl bg-white/[0.04] p-6 sm:p-10">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-[#FF6A38]">
            Visual Search
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            Find image references from your admin library.
          </h1>
          <p className="mt-5 max-w-2xl text-neutral-300">
            Describe the style, content, or mood you want. The agent searches
            your library, reviews the candidates, and selects the best references.
          </p>

          <form
            className="mt-8 grid gap-3 lg:grid-cols-[1fr_auto]"
            onSubmit={(event) => void searchPhotos(event)}
          >
            <textarea
              className="min-h-28 rounded-2xl border border-white/15 bg-black/30 px-4 py-3 text-base text-white outline-none ring-[#FF6A38]/40 placeholder:text-neutral-500 focus:ring-2"
              placeholder="Example: modern web design portfolio with colorful minimal style"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
            <Button className="h-auto lg:w-40" disabled={isSearching} type="submit">
              <Search className="mr-2 h-4 w-4" />
              {isSearching ? 'Searching...' : 'Search'}
            </Button>
          </form>
          {message && !hasSearched ? (
            <p className="mt-4 text-sm text-rose-300">{message}</p>
          ) : null}
        </section>
      </div>

      {hasSearched ? (
        <section
          aria-label="Search results"
          aria-modal="true"
          className="app-canvas fixed inset-0 z-50 overflow-y-auto text-white"
          role="dialog"
        >
          <header className="canvas-overlay sticky top-0 z-10 border-b border-white/10 px-5 py-4 backdrop-blur-xl sm:px-8">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
              <Button variant="outline" onClick={closeSearch}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to search
              </Button>
              <div className="flex min-w-0 items-center gap-3">
                <div className="min-w-0 text-right">
                  <p className="text-xs font-medium uppercase tracking-[0.25em] text-[#FF6A38]">
                    Visual Search
                  </p>
                  <p className="mt-1 truncate text-sm text-neutral-400">{prompt}</p>
                </div>
                <AdminAccess />
              </div>
            </div>
          </header>

          {isSearching ? (
            <div className="mx-auto flex min-h-[calc(100vh-73px)] max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
              <div className="relative flex h-28 w-28 items-center justify-center">
                <div className="absolute inset-0 animate-ping rounded-full bg-[#FF6A38]/10" />
                <div className="absolute inset-3 rounded-full border border-[#FF6A38]/20 bg-[#FF6A38]/5" />
                <LoaderCircle className="relative h-10 w-10 animate-spin text-[#FF6A38]" />
              </div>
              <p className="mt-8 text-sm font-medium uppercase tracking-[0.3em] text-[#FF6A38]">
                Agent at work
              </p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">
                {loadingMessages[loadingStep]}
              </h2>
              <p className="mt-4 max-w-xl text-neutral-400">
                The agent is searching your library and visually comparing the strongest candidates.
              </p>
              <div className="mt-10 flex gap-2">
                {loadingMessages.map((loadingMessage, index) => (
                  <span
                    aria-label={loadingMessage}
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      index === loadingStep ? 'w-10 bg-[#FF6A38]' : 'w-4 bg-neutral-700'
                    }`}
                    key={loadingMessage}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
              {message ? (
                <div className="mx-auto max-w-xl rounded-2xl border border-rose-400/20 bg-rose-400/5 p-8 text-center">
                  <h2 className="text-2xl font-semibold">Search could not be completed</h2>
                  <p className="mt-3 text-neutral-300">{message}</p>
                  <Button className="mt-6" onClick={closeSearch}>
                    Try another search
                  </Button>
                </div>
              ) : null}

              {!message && results.length === 0 ? (
                <div className="glass-surface mx-auto max-w-xl rounded-2xl border-dashed p-10 text-center">
                  <h2 className="text-2xl font-semibold">No references found</h2>
                  <p className="mt-3 text-neutral-400">
                    Try changing the style, content, or mood in your prompt.
                  </p>
                  <Button className="mt-6" onClick={closeSearch}>
                    Try another search
                  </Button>
                </div>
              ) : null}

              {!message && results.length > 0 ? (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-sm font-medium uppercase tracking-[0.25em] text-[#FF6A38]">
                        Curated by AI
                      </p>
                      <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">
                        Selected references
                      </h2>
                    </div>
                    <p className="text-sm text-neutral-400">
                      {results.length} selected from {searchDebug?.candidatePhotoCount ?? 0} candidates
                    </p>
                  </div>

                  <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {results.map((photo) => (
                      <article
                        className="glass-surface overflow-hidden rounded-2xl"
                        key={photo.id}
                      >
                        <img
                          alt={photo.originalName}
                          className="aspect-[4/3] w-full object-cover"
                          src={`${apiBaseUrl}${photo.url}`}
                        />
                        <div className="space-y-4 p-5">
                          <h3 className="line-clamp-2 font-medium">{photo.originalName}</h3>
                          {photo.selectionReason ? (
                            <div className="rounded-lg border border-[#FF6A38]/20 bg-[#FF6A38]/5 p-3">
                              <p className="text-xs font-medium uppercase tracking-wider text-[#FF6A38]">
                                Why it was selected
                              </p>
                              <p className="mt-1 text-sm leading-6 text-neutral-300">
                                {photo.selectionReason}
                              </p>
                            </div>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            {photo.keywords.map((keyword) => (
                              <span
                                className="rounded-full bg-[#FF6A38]/10 px-2.5 py-1 text-xs font-medium text-[#ffb39a]"
                                key={keyword}
                              >
                                {keyword}
                              </span>
                            ))}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>

                  <details className="glass-surface mt-8 rounded-xl p-4">
                    <summary className="cursor-pointer text-sm font-medium text-neutral-300">
                      View agent details
                    </summary>
                    <div className="mt-4 space-y-4 text-sm text-neutral-400">
                      <div>
                        <p className="font-medium text-neutral-300">Keywords used</p>
                        <p className="mt-1">{keywordsUsed.join(', ')}</p>
                      </div>
                      {searchDebug ? (
                        <>
                          <p>
                            Timing: search {(searchDebug.timingsMs.search / 1000).toFixed(1)}s · selection{' '}
                            {(searchDebug.timingsMs.selection / 1000).toFixed(1)}s · total{' '}
                            {(searchDebug.timingsMs.total / 1000).toFixed(1)}s
                          </p>
                          {searchDebug.searches.map((search, index) => (
                            <p key={`${search.keywords.join('-')}-${index}`}>
                              Search {index + 1}: {search.keywords.join(', ')} · {search.results} results
                            </p>
                          ))}
                        </>
                      ) : null}
                    </div>
                  </details>
                </>
              ) : null}
            </div>
          )}
        </section>
      ) : null}
    </main>
  )
}

function AdminPage() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadKeywords, setUploadKeywords] = useState('')
  const [editingKeywords, setEditingKeywords] = useState<Record<string, string>>(
    {},
  )
  const [suggestedKeywordsByPhoto, setSuggestedKeywordsByPhoto] = useState<
    Record<string, string[] | undefined>
  >({})
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [savingPhotoId, setSavingPhotoId] = useState<string | null>(null)
  const [suggestingPhotoId, setSuggestingPhotoId] = useState<string | null>(null)
  const [detailPhotoId, setDetailPhotoId] = useState<string | null>(null)
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([])
  const [photosPendingDelete, setPhotosPendingDelete] = useState<Photo[] | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void loadPhotos()
  }, [])

  useEffect(() => {
    if (!photosPendingDelete) {
      return
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isDeleting) {
        setPhotosPendingDelete(null)
      }
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [photosPendingDelete, isDeleting])

  useEffect(() => {
    if (!detailPhotoId) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function closeOnEscape(event: KeyboardEvent) {
      if (
        event.key === 'Escape' &&
        !photosPendingDelete &&
        !savingPhotoId &&
        !suggestingPhotoId
      ) {
        setDetailPhotoId(null)
      }
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [detailPhotoId, photosPendingDelete, savingPhotoId, suggestingPhotoId])

  async function loadPhotos() {
    setIsLoading(true)
    setMessage('')

    try {
      const response = await fetch(`${apiBaseUrl}/photos`)

      if (!response.ok) {
        throw new Error('Could not load photos')
      }

      const nextPhotos = (await response.json()) as Photo[]
      setPhotos(nextPhotos)
      setDetailPhotoId(null)
      setSelectedPhotoIds([])
      setSuggestedKeywordsByPhoto({})
      setEditingKeywords(
        Object.fromEntries(
          nextPhotos.map((photo) => [photo.id, photo.keywords.join(', ')]),
        ),
      )
    } catch {
      setMessage('Could not load photos. Make sure the backend is running.')
    } finally {
      setIsLoading(false)
    }
  }

  async function uploadPhoto(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedFile) {
      setMessage('Choose a photo before uploading.')
      return
    }

    setIsUploading(true)
    setMessage('')

    const formData = new FormData()
    formData.append('photo', selectedFile)
    formData.append('keywords', uploadKeywords)

    try {
      const response = await fetch(`${apiBaseUrl}/photos`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Could not upload photo')
      }

      setSelectedFile(null)
      setUploadKeywords('')
      setMessage('Photo uploaded.')
      event.currentTarget.reset()
      await loadPhotos()
    } catch {
      setMessage('Could not upload photo. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  async function saveKeywords(photoId: string) {
    setSavingPhotoId(photoId)
    setMessage('')

    try {
      const response = await fetch(`${apiBaseUrl}/photos/${photoId}/keywords`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ keywords: editingKeywords[photoId] ?? '' }),
      })

      if (!response.ok) {
        throw new Error('Could not save keywords')
      }

      const updatedPhoto = (await response.json()) as Photo
      setPhotos((current) =>
        current.map((photo) => (photo.id === photoId ? updatedPhoto : photo)),
      )
      setEditingKeywords((current) => ({
        ...current,
        [photoId]: updatedPhoto.keywords.join(', '),
      }))
      setSuggestedKeywordsByPhoto((current) => ({
        ...current,
        [photoId]: undefined,
      }))
      setMessage('Keywords saved.')
    } catch {
      setMessage('Could not save keywords. Please try again.')
    } finally {
      setSavingPhotoId(null)
    }
  }

  async function suggestKeywords(photoId: string) {
    setSuggestingPhotoId(photoId)
    setMessage('')

    try {
      const response = await fetch(`${apiBaseUrl}/photos/${photoId}/suggest-keywords`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('Could not suggest keywords')
      }

      const data = (await response.json()) as {
        keywords: string[]
        suggestedKeywords: string[]
      }
      const savedKeywords = photos.find((photo) => photo.id === photoId)?.keywords ?? []
      const addedKeywords = data.suggestedKeywords.filter(
        (keyword) => !savedKeywords.includes(keyword),
      )
      setEditingKeywords((current) => ({
        ...current,
        [photoId]: data.keywords.join(', '),
      }))
      setSuggestedKeywordsByPhoto((current) => ({
        ...current,
        [photoId]: addedKeywords,
      }))
    } catch {
      setMessage('Could not suggest keywords. Please try again.')
    } finally {
      setSuggestingPhotoId(null)
    }
  }

  function togglePhotoSelection(photoId: string) {
    setSelectedPhotoIds((current) =>
      current.includes(photoId)
        ? current.filter((id) => id !== photoId)
        : [...current, photoId],
    )
  }

  function openPhotoDetail(photo: Photo) {
    setMessage('')
    setEditingKeywords((current) => ({
      ...current,
      [photo.id]: photo.keywords.join(', '),
    }))
    setSuggestedKeywordsByPhoto((current) => ({
      ...current,
      [photo.id]: undefined,
    }))
    setDetailPhotoId(photo.id)
  }

  function closePhotoDetail() {
    if (savingPhotoId || suggestingPhotoId) {
      return
    }

    setDetailPhotoId(null)
  }

  function cancelKeywordChanges(photo: Photo) {
    setEditingKeywords((current) => ({
      ...current,
      [photo.id]: photo.keywords.join(', '),
    }))
    setSuggestedKeywordsByPhoto((current) => ({
      ...current,
      [photo.id]: undefined,
    }))
    setMessage('')
  }

  function toggleAllPhotos() {
    setSelectedPhotoIds((current) =>
      current.length === photos.length ? [] : photos.map((photo) => photo.id),
    )
  }

  function requestPhotoDeletion(photoIds: string[]) {
    setPhotosPendingDelete(photos.filter((photo) => photoIds.includes(photo.id)))
  }

  async function deletePhotos() {
    if (!photosPendingDelete) {
      return
    }

    const ids = photosPendingDelete.map((photo) => photo.id)
    setIsDeleting(true)
    setMessage('')

    try {
      const response = await fetch(`${apiBaseUrl}/photos`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids }),
      })

      if (!response.ok) {
        throw new Error('Could not delete photos')
      }

      const data = (await response.json()) as { deletedIds: string[] }
      const deletedIds = new Set(data.deletedIds)
      setPhotos((current) => current.filter((photo) => !deletedIds.has(photo.id)))
      setSelectedPhotoIds((current) => current.filter((id) => !deletedIds.has(id)))
      setEditingKeywords((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([id]) => !deletedIds.has(id)),
        ),
      )
      setSuggestedKeywordsByPhoto((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([id]) => !deletedIds.has(id)),
        ),
      )
      setDetailPhotoId((current) =>
        current && deletedIds.has(current) ? null : current,
      )
      setPhotosPendingDelete(null)
      setMessage(
        `${data.deletedIds.length} ${data.deletedIds.length === 1 ? 'photo' : 'photos'} deleted.`,
      )
    } catch {
      setMessage('Could not delete the selected photos. Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }

  const detailPhoto = photos.find((photo) => photo.id === detailPhotoId) ?? null
  const hasKeywordChanges = detailPhoto
    ? (editingKeywords[detailPhoto.id] ?? '') !== detailPhoto.keywords.join(', ')
    : false
  const detailSuggestedKeywords = detailPhoto
    ? suggestedKeywordsByPhoto[detailPhoto.id]
    : undefined

  return (
    <main className="app-canvas min-h-screen px-6 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <nav
          aria-label="Breadcrumb"
          className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5"
        >
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <a className="transition-colors hover:text-white" href="/search">
              Visual Search
            </a>
            <span aria-hidden="true" className="text-neutral-600">
              /
            </span>
            <span aria-current="page" className="text-[#FF6A38]">
              Admin
            </span>
          </div>
          <Button asChild variant="outline">
            <a href="/search">
              <X className="mr-2 h-4 w-4" />
              Exit admin
            </a>
          </Button>
        </nav>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.3em] text-[#FF6A38]">
              Admin
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight">
              Photo Library
            </h1>
            <p className="mt-3 max-w-2xl text-neutral-300">
              Upload image references, add keywords manually, and edit them as
              the library grows.
            </p>
          </div>
          <Button variant="outline" onClick={() => void loadPhotos()}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        <form
          className="glass-surface mt-8 rounded-2xl p-5"
          onSubmit={(event) => void uploadPhoto(event)}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#FF6A38] p-2 text-black">
              <ImagePlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">Upload a photo</h2>
              <p className="text-sm text-neutral-400">
                Keywords are optional. The app will suggest some automatically.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
            <input
              accept="image/*"
              className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-neutral-200 file:mr-4 file:rounded-md file:border-0 file:bg-[#FF6A38] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-black"
              type="file"
              onChange={(event) =>
                setSelectedFile(event.target.files?.[0] ?? null)
              }
            />
            <input
              className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none ring-[#FF6A38]/40 placeholder:text-neutral-500 focus:ring-2"
              placeholder="Optional: kitchen, marble, warm light"
              value={uploadKeywords}
              onChange={(event) => setUploadKeywords(event.target.value)}
            />
            <Button disabled={isUploading} type="submit">
              <Upload className="mr-2 h-4 w-4" />
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        </form>

        {message ? (
          <p className="glass-surface mt-4 rounded-lg px-4 py-3 text-sm text-neutral-200">
            {message}
          </p>
        ) : null}

        <section className="mt-8">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">Uploaded photos</h2>
              <span className="text-sm text-neutral-400">{photos.length} total</span>
            </div>
            {photos.length > 0 ? (
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-300">
                  <input
                    checked={selectedPhotoIds.length === photos.length}
                    className="h-4 w-4 accent-[#FF6A38]"
                    type="checkbox"
                    onChange={toggleAllPhotos}
                  />
                  Select all
                </label>
                <Button
                  className="border-red-400/40 text-red-200 hover:bg-red-500/10 hover:text-red-100"
                  disabled={selectedPhotoIds.length === 0}
                  type="button"
                  variant="outline"
                  onClick={() => requestPhotoDeletion(selectedPhotoIds)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete selected ({selectedPhotoIds.length})
                </Button>
              </div>
            ) : null}
          </div>

          {isLoading ? (
            <p className="glass-surface rounded-xl p-5 text-neutral-300">
              Loading photos...
            </p>
          ) : null}

          {!isLoading && photos.length === 0 ? (
            <p className="glass-surface rounded-xl border-dashed p-8 text-center text-neutral-300">
              No photos uploaded yet.
            </p>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {photos.map((photo) => (
              <article
                className={`glass-surface relative overflow-hidden rounded-2xl transition-transform hover:-translate-y-0.5 ${
                  selectedPhotoIds.includes(photo.id)
                    ? 'border-[#FF6A38] ring-1 ring-[#FF6A38]'
                    : 'border-white/10'
                }`}
                key={photo.id}
              >
                <label className="absolute left-3 top-3 z-10 flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-black/75 px-3 py-2 text-sm text-white shadow-lg backdrop-blur-xl">
                  <input
                    checked={selectedPhotoIds.includes(photo.id)}
                    className="h-4 w-4 accent-[#FF6A38]"
                    type="checkbox"
                    onChange={() => togglePhotoSelection(photo.id)}
                  />
                  Select
                </label>
                <button
                  aria-label={`View details for ${photo.name ?? 'uploaded photo'}`}
                  className="group block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF6A38]"
                  type="button"
                  onClick={() => openPhotoDetail(photo)}
                >
                  <img
                    alt={photo.name ?? 'Uploaded visual reference'}
                    className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    src={`${apiBaseUrl}${photo.url}`}
                  />
                  <div className="space-y-4 p-4">
                    {photo.name ? (
                      <h3 className="text-lg font-medium leading-6">{photo.name}</h3>
                    ) : null}
                    <p className="text-xs text-neutral-500">
                      Uploaded {new Date(photo.createdAt).toLocaleString()}
                    </p>
                    <KeywordPreview keywords={photo.keywords} />
                  </div>
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>

      {detailPhoto ? (
        <div
          aria-labelledby="photo-detail-title"
          aria-modal="true"
          className="fixed inset-0 z-40 overflow-y-auto bg-black/80 p-4 backdrop-blur-md sm:p-8"
          role="dialog"
        >
          <div className="flex min-h-full items-center justify-center">
            <section className="glass-surface w-full max-w-5xl overflow-hidden rounded-3xl">
              <header className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.25em] text-[#FF6A38]">
                    Photo detail
                  </p>
                  <h2 className="mt-1 text-xl font-semibold" id="photo-detail-title">
                    {detailPhoto.name ?? 'Untitled photo'}
                  </h2>
                </div>
                <Button
                  aria-label="Close photo detail"
                  className="h-10 w-10 shrink-0 rounded-full p-0"
                  disabled={Boolean(savingPhotoId || suggestingPhotoId)}
                  type="button"
                  variant="outline"
                  onClick={closePhotoDetail}
                >
                  <X className="h-4 w-4" />
                </Button>
              </header>

              <div className="grid lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
                <div className="flex items-center justify-center bg-black/35 p-4 sm:p-6">
                  <img
                    alt={detailPhoto.name ?? 'Uploaded visual reference'}
                    className="max-h-[70vh] w-full rounded-2xl object-contain"
                    src={`${apiBaseUrl}${detailPhoto.url}`}
                  />
                </div>

                <div className="space-y-6 border-t border-white/10 p-5 lg:border-l lg:border-t-0 lg:p-6">
                  <div>
                    <p className="text-sm text-neutral-400">Date added</p>
                    <p className="mt-1 text-sm text-neutral-200">
                      {new Date(detailPhoto.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-neutral-300">Keywords</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {detailPhoto.keywords.map((keyword, index) => (
                        <span
                          className={keywordChipClassName}
                          key={`${keyword}-${index}`}
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>

                  {detailSuggestedKeywords !== undefined ? (
                    <div className="rounded-xl border border-[#76BCDF]/20 bg-[#76BCDF]/[0.06] p-4">
                      <p className="text-sm font-medium text-[#9dd5f1]">
                        Suggested additions
                      </p>
                      {detailSuggestedKeywords.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {detailSuggestedKeywords.map((keyword, index) => (
                            <span
                              className="max-w-full truncate rounded-full bg-[#76BCDF]/10 px-2.5 py-1 text-xs font-medium text-[#b9e2f6]"
                              key={`${keyword}-${index}`}
                            >
                              {keyword}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-neutral-400">
                          No new keywords were suggested.
                        </p>
                      )}
                    </div>
                  ) : null}

                  {message ? (
                    <p className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-neutral-300">
                      {message}
                    </p>
                  ) : null}

                  <div className="space-y-2 border-t border-white/10 pt-5">
                    <label
                      className="text-sm font-medium text-neutral-300"
                      htmlFor={`keywords-${detailPhoto.id}`}
                    >
                      Edit keywords
                    </label>
                    <textarea
                      className="min-h-28 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none ring-[#FF6A38]/40 placeholder:text-neutral-500 focus:ring-2"
                      id={`keywords-${detailPhoto.id}`}
                      value={editingKeywords[detailPhoto.id] ?? ''}
                      onChange={(event) =>
                        setEditingKeywords((current) => ({
                          ...current,
                          [detailPhoto.id]: event.target.value,
                        }))
                      }
                    />
                    {detailSuggestedKeywords !== undefined ? (
                      <p className="rounded-lg border border-[#76BCDF]/20 bg-[#76BCDF]/[0.06] px-3 py-2 text-sm text-[#b9e2f6]">
                        {detailSuggestedKeywords.length > 0
                          ? `${detailSuggestedKeywords.length} suggested ${detailSuggestedKeywords.length === 1 ? 'keyword has' : 'keywords have'} been added to the edit box.`
                          : 'The current edit box already contains the suggested keywords.'}
                      </p>
                    ) : null}
                    {hasKeywordChanges ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Button
                          className="w-full"
                          disabled={
                            savingPhotoId === detailPhoto.id ||
                            suggestingPhotoId === detailPhoto.id
                          }
                          type="button"
                          variant="outline"
                          onClick={() => cancelKeywordChanges(detailPhoto)}
                        >
                          Cancel changes
                        </Button>
                        <Button
                          className="w-full"
                          disabled={
                            savingPhotoId === detailPhoto.id ||
                            suggestingPhotoId === detailPhoto.id
                          }
                          type="button"
                          onClick={() => void saveKeywords(detailPhoto.id)}
                        >
                          <Save className="mr-2 h-4 w-4" />
                          {savingPhotoId === detailPhoto.id
                            ? 'Saving...'
                            : 'Save changes'}
                        </Button>
                      </div>
                    ) : null}
                    <div className="space-y-2 pt-5">
                      <Button
                        className="w-full"
                        disabled={
                          suggestingPhotoId === detailPhoto.id ||
                          savingPhotoId === detailPhoto.id
                        }
                        type="button"
                        variant="outline"
                        onClick={() => void suggestKeywords(detailPhoto.id)}
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        {suggestingPhotoId === detailPhoto.id
                          ? 'Suggesting...'
                          : 'Suggest keywords'}
                      </Button>
                      <Button
                        className="w-full border-red-400/40 text-red-200 hover:bg-red-500/10 hover:text-red-100"
                        disabled={Boolean(savingPhotoId || suggestingPhotoId)}
                        type="button"
                        variant="outline"
                        onClick={() => requestPhotoDeletion([detailPhoto.id])}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete photo
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {photosPendingDelete ? (
        <div
          aria-labelledby="delete-dialog-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          role="dialog"
        >
          <div className="glass-surface w-full max-w-md rounded-2xl border-red-400/30 p-6 shadow-2xl shadow-black/60">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500/15 text-red-300">
              <Trash2 className="h-5 w-5" />
            </div>
            <h2 className="mt-5 text-2xl font-semibold" id="delete-dialog-title">
              Delete {photosPendingDelete.length === 1 ? 'this photo?' : `${photosPendingDelete.length} photos?`}
            </h2>
            <p className="mt-3 leading-6 text-neutral-300">
              This permanently removes {photosPendingDelete.length === 1
                ? photosPendingDelete[0].name
                  ? `“${photosPendingDelete[0].name}”`
                  : 'this photo'
                : 'the selected photos'} from the library and cannot be undone.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                autoFocus
                disabled={isDeleting}
                type="button"
                variant="outline"
                onClick={() => setPhotosPendingDelete(null)}
              >
                Cancel
              </Button>
              <Button
                className="bg-red-500 text-white hover:bg-red-400"
                disabled={isDeleting}
                type="button"
                onClick={() => void deletePhotos()}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {isDeleting ? 'Deleting...' : 'Delete permanently'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default App
