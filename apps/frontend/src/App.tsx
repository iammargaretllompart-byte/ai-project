import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  ImagePlus,
  LoaderCircle,
  RefreshCcw,
  Save,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'

const apiBaseUrl = 'http://localhost:4000'

type Photo = {
  id: string
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
  selectionMethod: 'ai' | 'score-fallback'
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
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-20 text-center">
        <p className="mb-4 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1 text-sm font-medium text-cyan-200">
          Vite + React + TypeScript + Tailwind + shadcn/ui
        </p>
        <h1 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-7xl">
          Build the frontend without fighting the stack.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
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
        throw new Error('Could not search photos')
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

      setMessage('Could not search photos. Make sure the backend is running.')
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
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
        <section className="w-full rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-2xl shadow-slate-950/50 sm:p-10">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-cyan-300">
            Visual Search
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            Find image references from your admin library.
          </h1>
          <p className="mt-5 max-w-2xl text-slate-300">
            Describe the style, content, or mood you want. The agent searches
            your library, reviews the candidates, and selects the best references.
          </p>

          <form
            className="mt-8 grid gap-3 lg:grid-cols-[1fr_auto]"
            onSubmit={(event) => void searchPhotos(event)}
          >
            <textarea
              className="min-h-28 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-white outline-none ring-cyan-300/40 placeholder:text-slate-500 focus:ring-2"
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
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950 text-white"
          role="dialog"
        >
          <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 px-5 py-4 backdrop-blur sm:px-8">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.25em] text-cyan-300">
                  Visual Search
                </p>
                <p className="mt-1 truncate text-sm text-slate-400">{prompt}</p>
              </div>
              <Button variant="outline" onClick={closeSearch}>
                <X className="mr-2 h-4 w-4" />
                Back to search
              </Button>
            </div>
          </header>

          {isSearching ? (
            <div className="mx-auto flex min-h-[calc(100vh-73px)] max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
              <div className="relative flex h-28 w-28 items-center justify-center">
                <div className="absolute inset-0 animate-ping rounded-full bg-cyan-300/10" />
                <div className="absolute inset-3 rounded-full border border-cyan-300/20 bg-cyan-300/5" />
                <LoaderCircle className="relative h-10 w-10 animate-spin text-cyan-300" />
              </div>
              <p className="mt-8 text-sm font-medium uppercase tracking-[0.3em] text-cyan-300">
                Agent at work
              </p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">
                {loadingMessages[loadingStep]}
              </h2>
              <p className="mt-4 max-w-xl text-slate-400">
                The agent is searching your library and visually comparing the strongest candidates.
              </p>
              <div className="mt-10 flex gap-2">
                {loadingMessages.map((loadingMessage, index) => (
                  <span
                    aria-label={loadingMessage}
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      index === loadingStep ? 'w-10 bg-cyan-300' : 'w-4 bg-slate-700'
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
                  <p className="mt-3 text-slate-300">{message}</p>
                  <Button className="mt-6" onClick={closeSearch}>
                    Try another search
                  </Button>
                </div>
              ) : null}

              {!message && results.length === 0 ? (
                <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-10 text-center">
                  <h2 className="text-2xl font-semibold">No references found</h2>
                  <p className="mt-3 text-slate-400">
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
                      <p className="text-sm font-medium uppercase tracking-[0.25em] text-cyan-300">
                        Curated by AI
                      </p>
                      <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">
                        Selected references
                      </h2>
                    </div>
                    <p className="text-sm text-slate-400">
                      {results.length} selected from {searchDebug?.candidatePhotoCount ?? 0} candidates
                    </p>
                  </div>

                  <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {results.map((photo) => (
                      <article
                        className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl shadow-slate-950/30"
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
                            <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/5 p-3">
                              <p className="text-xs font-medium uppercase tracking-wider text-cyan-300">
                                Why it was selected
                              </p>
                              <p className="mt-1 text-sm leading-6 text-slate-300">
                                {photo.selectionReason}
                              </p>
                            </div>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            {photo.keywords.map((keyword) => (
                              <span
                                className="rounded-full bg-cyan-300/10 px-2.5 py-1 text-xs font-medium text-cyan-200"
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

                  <details className="mt-8 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <summary className="cursor-pointer text-sm font-medium text-slate-300">
                      View agent details
                    </summary>
                    <div className="mt-4 space-y-4 text-sm text-slate-400">
                      <div>
                        <p className="font-medium text-slate-300">Keywords used</p>
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
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [suggestingPhotoId, setSuggestingPhotoId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void loadPhotos()
  }, [])

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

      setMessage('Keywords saved.')
      await loadPhotos()
    } catch {
      setMessage('Could not save keywords. Please try again.')
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

      const data = (await response.json()) as { keywords: string[] }
      setEditingKeywords((current) => ({
        ...current,
        [photoId]: data.keywords.join(', '),
      }))
      setMessage('Suggested keywords added to the edit box. Save them if they look right.')
    } catch {
      setMessage('Could not suggest keywords. Please try again.')
    } finally {
      setSuggestingPhotoId(null)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.3em] text-cyan-300">
              Admin
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight">
              Photo Library
            </h1>
            <p className="mt-3 max-w-2xl text-slate-300">
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
          className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-2xl shadow-slate-950/40"
          onSubmit={(event) => void uploadPhoto(event)}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-cyan-300 p-2 text-slate-950">
              <ImagePlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">Upload a photo</h2>
              <p className="text-sm text-slate-400">
                Keywords are optional. The app will suggest some automatically.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
            <input
              accept="image/*"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 file:mr-4 file:rounded-md file:border-0 file:bg-cyan-300 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-950"
              type="file"
              onChange={(event) =>
                setSelectedFile(event.target.files?.[0] ?? null)
              }
            />
            <input
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-cyan-300/40 placeholder:text-slate-500 focus:ring-2"
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
          <p className="mt-4 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-200">
            {message}
          </p>
        ) : null}

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Uploaded photos</h2>
            <span className="text-sm text-slate-400">{photos.length} total</span>
          </div>

          {isLoading ? (
            <p className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-slate-300">
              Loading photos...
            </p>
          ) : null}

          {!isLoading && photos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-700 bg-slate-900/60 p-8 text-center text-slate-300">
              No photos uploaded yet.
            </p>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {photos.map((photo) => (
              <article
                className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl shadow-slate-950/30"
                key={photo.id}
              >
                <img
                  alt={photo.originalName}
                  className="aspect-[4/3] w-full object-cover"
                  src={`${apiBaseUrl}${photo.url}`}
                />
                <div className="space-y-4 p-4">
                  <div>
                    <h3 className="line-clamp-2 font-medium">
                      {photo.originalName}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(photo.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {photo.keywords.map((keyword) => (
                      <span
                        className="rounded-full bg-cyan-300/10 px-2.5 py-1 text-xs font-medium text-cyan-200"
                        key={keyword}
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium text-slate-300"
                      htmlFor={`keywords-${photo.id}`}
                    >
                      Edit keywords
                    </label>
                    <textarea
                      className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-cyan-300/40 placeholder:text-slate-500 focus:ring-2"
                      id={`keywords-${photo.id}`}
                      value={editingKeywords[photo.id] ?? ''}
                      onChange={(event) =>
                        setEditingKeywords((current) => ({
                          ...current,
                          [photo.id]: event.target.value,
                        }))
                      }
                    />
                    <Button
                      className="w-full"
                      type="button"
                      variant="outline"
                      disabled={suggestingPhotoId === photo.id}
                      onClick={() => void suggestKeywords(photo.id)}
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      {suggestingPhotoId === photo.id
                        ? 'Suggesting...'
                        : 'Suggest keywords'}
                    </Button>
                    <Button
                      className="w-full"
                      type="button"
                      onClick={() => void saveKeywords(photo.id)}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Save keywords
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
