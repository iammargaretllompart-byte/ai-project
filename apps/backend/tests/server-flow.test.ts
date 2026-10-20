import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once, EventEmitter } from 'node:events'
import { promises as fs } from 'node:fs'
import { createServer } from 'node:http'
import { createServer as createSocketServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { designFixture } from './moodboard-fixture.js'

async function until<T>(read: () => Promise<T>, check: (value: T) => boolean, timeout = 15_000): Promise<T> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const value = await read()
    if (check(value)) return value
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('Timed out waiting for the server state')
}

test('HTTP workflow preserves snapshots, resumes after a process crash, and revokes deleted links', { timeout: 60_000 }, async (context) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'visual-library-http-'))
  const ids = Array.from({ length: 25 }, () => randomUUID())
  const photos = ids.map((id, index) => ({ id, name: `Reference ${index + 1}`, filename: `${index}.png`,
    originalName: `${index}.png`, url: `/uploads/${index}.png`, keywords: ['editorial', 'warm'], createdAt: new Date().toISOString() }))
  await fs.mkdir(path.join(root, 'uploads'))
  await fs.mkdir(path.join(root, 'data'))
  const pixels = Buffer.alloc(96 * 96 * 3)
  for (let index = 0; index < 96 * 96; index++) {
    pixels.fill([255, 245, 16][Math.floor(index / (96 * 32))], index * 3, index * 3 + 3)
  }
  const png = await sharp(pixels, { raw: { width: 96, height: 96, channels: 3 } }).png().toBuffer()
  await Promise.all(photos.map((photo) => fs.writeFile(path.join(root, 'uploads', photo.filename), png)))
  await fs.writeFile(path.join(root, 'data/photos.json'), JSON.stringify(photos))

  let mode: 'success' | 'hold' | 'invalid' | 'no-matches' | 'invalid-search' | 'partial-search' | 'exclude' | 'insufficient' | 'schema-repair' | 'palette-repair' | 'too-few-references' = 'success'
  let schemaRepairCalls = 0
  let paletteRepairCalls = 0
  let release: (() => void) | undefined
  let held: Promise<void> = Promise.resolve()
  let calls = 0
  let generationCalls = 0
  const events = new EventEmitter()
  const provider = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body = JSON.parse(Buffer.concat(chunks).toString()) as { tools: Array<{ name: string }>; system?: Array<{ text: string }> | string; messages: Array<{ content: Array<{ type: string; text?: string }> | string }> }
      const texts = body.messages.flatMap((message) => typeof message.content === 'string' ? [message.content] : message.content.filter((part) => part.type === 'text').map((part) => part.text ?? ''))
      calls++
      const names = body.tools.map((tool) => tool.name)
      let content: Array<{ type: string; id: string; name: string; input: unknown }>
      if (names.includes('searchImages')) {
        content = (mode === 'no-matches' ? ['no-library-match', 'no-candidates'] : ['editorial', 'warm']).map((keyword) => ({ type: 'tool_use', id: randomUUID(), name: 'searchImages', input: { keywords: [keyword] } }))
      } else if (names.includes('selectImages')) {
        const candidates = [...new Set(texts.flatMap((text) => [...text.matchAll(/Candidate ID: ([0-9a-f-]+)/g)].map((match) => match[1])))]
        content = [{ type: 'tool_use', id: randomUUID(), name: 'selectImages', input: { selections: (mode === 'invalid-search' ? [randomUUID()] : candidates.slice(0, 6)).map((id, index) => ({
          id, matchType: mode === 'no-matches' || (mode === 'partial-search' && index >= 3) ? 'partial' : 'strong',
          reason: mode === 'no-matches' || (mode === 'partial-search' && index >= 3) ? 'Matches the composition but lacks the requested subject.' : 'Visible editorial reference.',
        })) } }]
      } else if (names.includes('repairPalette')) {
        paletteRepairCalls++
        assert.equal(mode, 'palette-repair')
        assert.equal(names.includes('saveDirections'), false, 'Palette correction must not regenerate the full set')
        const references = texts.flatMap((text) => {
          try { const value = JSON.parse(text); return typeof value.photoId === 'string' ? [value.photoId] : [] }
          catch { return [] }
        })
        content = [{ type: 'tool_use', id: randomUUID(), name: 'repairPalette', input: { palette: designFixture(references).directions[2].palette } }]
      } else if (names.includes('saveDirections')) {
        generationCalls++
        events.emit('generation')
        const currentMode = mode
        if (currentMode === 'hold') await held
        const references = texts.flatMap((text) => {
          try { const value = JSON.parse(text); return typeof value.photoId === 'string' ? [value.photoId] : [] }
          catch { return [] }
        })
        const design = designFixture(references)
        // Real models commonly omit the inapplicable brand-only provenance field.
        design.directions.forEach((direction) => direction.palette.forEach((colour) => { Reflect.deleteProperty(colour, 'sourceBriefQuote') }))
        const metadata = texts.flatMap((text) => {
          try { const value = JSON.parse(text); return typeof value.photoId === 'string' ? [value] : [] }
          catch { return [] }
        })
        if (metadata.every((photo) => photo.matchType === 'partial')) {
          design.referenceAssessment = { coverage: 'approximate', explanation: 'Only composition is supported; the requested subject is missing.' }
        }
        if (currentMode === 'exclude') {
          const excludedId = references.at(-1)!
          design.directions.forEach((direction) => { direction.references = direction.references.filter((reference) => reference.photoId !== excludedId) })
          design.excludedReferences = [{ photoId: excludedId, reason: 'This image adds no relevant qualities to the three directions.' }]
        }
        if (currentMode === 'invalid') design.directions[0].palette[0].role = 'surface'
        if (currentMode === 'too-few-references') design.directions.forEach((direction) => { direction.references = direction.references.slice(0, 2) })
        if (currentMode === 'palette-repair') design.directions[2].palette[1].hex = '#000000'
        if (currentMode === 'schema-repair') {
          if (schemaRepairCalls++ === 0) Reflect.deleteProperty(design.directions[0], 'paletteUsage')
          else {
            assert.ok(JSON.stringify(body.system).includes('directions.0.paletteUsage'), 'Schema error path must be sent as correction feedback')
            assert.ok(texts.some((text) => text.includes('Previous draft') && text.includes('Grounded direction')), 'Correction must receive the previous draft rather than starting over')
          }
        }
        content = currentMode === 'insufficient'
          ? [{ type: 'tool_use', id: randomUUID(), name: 'reportInsufficientReferences', input: { reason: 'The brief requires architectural material studies; these images only show unrelated UI screens. Add architectural textures and spatial references.' } }]
          : [{ type: 'tool_use', id: randomUUID(), name: 'saveDirections', input: design }]
      } else throw new Error(`Unexpected provider tool: ${names.join(', ')}`)
      if (response.destroyed) return
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ id: randomUUID(), type: 'message', role: 'assistant', model: 'verification-model', content,
        stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }))
    } catch (error) {
      if (!response.destroyed) { response.statusCode = 500; response.end(String(error)) }
    }
  })
  provider.listen(0, '127.0.0.1')
  await once(provider, 'listening')
  const providerPort = (provider.address() as { port: number }).port
  const reservation = createSocketServer()
  reservation.listen(0, '127.0.0.1')
  await once(reservation, 'listening')
  const port = (reservation.address() as { port: number }).port
  await new Promise<void>((resolve) => reservation.close(() => resolve()))
  const base = `http://127.0.0.1:${port}`
  let child: ChildProcess | null = null
  let output = ''
  async function start() {
    child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('../src/server.ts', import.meta.url))], {
      cwd: root,
      env: { ...process.env, PORT: String(port), AI_API_KEY: 'isolated-test-key', AI_BASE_URL: `http://127.0.0.1:${providerPort}/v1`, AI_MODEL: 'verification-model' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const current = child
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Server startup timeout: ${output}`)), 10_000)
      current.stdout!.on('data', (chunk) => {
        output += String(chunk)
        if (output.includes(`Backend running on http://localhost:${port}`)) { clearTimeout(timeout); resolve() }
      })
      current.stderr!.on('data', (chunk) => { output += String(chunk) })
      current.once('error', (error) => { clearTimeout(timeout); reject(error) })
      current.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Server exited (${code}): ${output}`)) })
    })
  }
  async function stop(signal: NodeJS.Signals = 'SIGTERM') {
    if (!child || child.exitCode !== null || child.signalCode !== null) return
    const exited = once(child, 'exit')
    child.kill(signal)
    await exited
    child = null
    output = ''
  }
  context.after(async () => {
    release?.()
    await stop()
    provider.closeAllConnections()
    await new Promise<void>((resolve) => provider.close(() => resolve()))
    await fs.rm(root, { recursive: true, force: true })
  })
  async function json(url: string, method = 'GET', body?: unknown) {
    const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    assert.ok(response.ok, `${method} ${url}: ${response.status}; ${output}`)
    return response.json()
  }
  const waitSet = (id: string, status: string) => until(async () => {
    const set = await json(`/moodboards/${id}`)
    if (status === 'ready' && set.status === 'failed') throw new Error(`Unexpected generation failure: ${set.error}; ${output}`)
    return set
  }, (set) => set.status === status)
  function hold() { mode = 'hold'; held = new Promise<void>((resolve) => { release = resolve }) }
  async function waitGeneration(count: number) {
    while (generationCalls < count) await once(events, 'generation')
  }

  await start()
  assert.equal((await json('/health')).ok, true)
  assert.deepEqual(await json('/library/status'), { photoCount: 25, minimumReferences: 6, canSearch: true })
  const search = await json('/search', 'POST', { prompt: 'Warm editorial website' })
  const keep = await json('/search', 'POST', { prompt: 'Second saved search' })
  assert.equal(search.photos.length, 6)
  assert.equal(new Set(search.photos.map((photo: { id: string }) => photo.id)).size, 6)
  assert.equal(search.debug.visuallyReviewedPhotoCount, 25)
  const countBeforeReads = calls
  assert.equal((await json('/searches')).total, 2)
  assert.deepEqual(await json(`/searches/${search.id}`), search)
  for (const photo of search.photos) assert.deepEqual(Buffer.from(await (await fetch(base + photo.url)).arrayBuffer()), png)
  assert.equal(calls, countBeforeReads)
  mode = 'invalid-search'
  const failedSearch = await fetch(base + '/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'Invalid selection' }) })
  assert.equal(failedSearch.status, 502)
  assert.equal((await json('/searches')).total, 2)
  mode = 'success'

  mode = 'partial-search'
  const partialSearch = await json('/search', 'POST', { prompt: 'A compound brief with partial matches' })
  assert.equal(partialSearch.photos.filter((photo: { matchType: string }) => photo.matchType === 'strong').length, 3)
  assert.equal(partialSearch.photos.filter((photo: { matchType: string }) => photo.matchType === 'partial').length, 3)
  assert.deepEqual((await json(`/searches/${partialSearch.id}`)).photos, partialSearch.photos)
  const mixedSet = await json(`/searches/${partialSearch.id}/moodboards`, 'POST')
  await waitSet(mixedSet.id, 'ready')
  assert.equal((await json(`/moodboards/${mixedSet.id}`)).design.schemaVersion, 2)
  await json(`/searches/${partialSearch.id}`, 'DELETE')
  mode = 'success'

  const first = await json(`/searches/${search.id}/moodboards`, 'POST')
  await waitSet(first.id, 'ready')
  const ready = await json(`/moodboards/${first.id}`)
  assert.equal(ready.design.directions.length, 3)
  assert.ok(ready.design.axis.explanation)
  assert.ok(ready.design.specimen.headline)
  assert.equal(ready.search.prompt, search.prompt)
  assert.deepEqual(ready.search.photos, search.photos)

  await json(`/photos/${ids[0]}/keywords`, 'PATCH', { keywords: ['changed keyword'] })
  await json('/photos', 'DELETE', { ids: [ids[0]] })
  assert.equal((await json(`/searches/${search.id}`)).photos[0].name, search.photos[0].name)
  assert.deepEqual((await json(`/searches/${search.id}`)).photos[0].keywords, ['editorial', 'warm'])
  assert.deepEqual(Buffer.from(await (await fetch(base + search.photos[0].url)).arrayBuffer()), png)
  const second = await json(`/searches/${search.id}/moodboards`, 'POST')
  await waitSet(second.id, 'ready')
  assert.notEqual(second.id, first.id)
  assert.deepEqual((await json(`/moodboards/${first.id}`)).design, ready.design)

  hold()
  const nextCall = generationCalls + 1
  const interrupted = await json(`/searches/${search.id}/moodboards`, 'POST')
  await waitGeneration(nextCall)
  assert.equal((await json(`/searches/${search.id}/moodboards`, 'POST')).id, interrupted.id)
  assert.equal((await json(`/moodboards/${first.id}`)).activeSetId, interrupted.id)
  await stop('SIGKILL')
  await start()
  await waitGeneration(nextCall + 1)
  assert.equal((await json(`/moodboards/${interrupted.id}`)).attempts, 2)
  mode = 'success'
  release!()
  await waitSet(interrupted.id, 'ready')
  assert.equal((await json(`/moodboards/${first.id}`)).status, 'ready')

  mode = 'invalid'
  const failed = await json(`/searches/${search.id}/moodboards`, 'POST')
  assert.match((await waitSet(failed.id, 'failed')).error, /design checks/)
  mode = 'success'
  const retry = await json(`/searches/${search.id}/moodboards`, 'POST')
  await waitSet(retry.id, 'ready')
  assert.notEqual(failed.id, retry.id)

  mode = 'too-few-references'
  const tooFewSet = await json(`/searches/${search.id}/moodboards`, 'POST')
  const tooFew = await waitSet(tooFewSet.id, 'failed')
  assert.equal(tooFew.design, null)
  assert.match(tooFew.error, /design checks/)

  mode = 'schema-repair'
  const repairedSet = await json(`/searches/${search.id}/moodboards`, 'POST')
  await waitSet(repairedSet.id, 'ready')
  assert.equal(schemaRepairCalls, 2)

  mode = 'palette-repair'
  const paletteSet = await json(`/searches/${search.id}/moodboards`, 'POST')
  const paletteReady = await waitSet(paletteSet.id, 'ready')
  assert.equal(paletteRepairCalls, 1)
  assert.deepEqual(paletteReady.design, designFixture(search.photos.map((photo: { id: string }) => photo.id)))

  mode = 'exclude'
  const excludedSet = await json(`/searches/${search.id}/moodboards`, 'POST')
  const excludedReady = await waitSet(excludedSet.id, 'ready')
  assert.equal(excludedReady.design.excludedReferences.length, 1)
  const excludedId = excludedReady.design.excludedReferences[0].photoId
  assert.ok(excludedReady.design.directions.every((direction: { references: Array<{ photoId: string }> }) => direction.references.every((reference) => reference.photoId !== excludedId)))
  mode = 'insufficient'
  const callsBeforeInsufficient = generationCalls
  const insufficientSet = await json(`/searches/${search.id}/moodboards`, 'POST')
  const insufficient = await waitSet(insufficientSet.id, 'failed')
  assert.equal(insufficient.design, null)
  assert.equal(insufficient.stage, 'More relevant references needed')
  assert.match(insufficient.error, /architectural material studies/)
  assert.match(insufficient.error, /run a new search/)
  assert.equal(generationCalls, callsBeforeInsufficient + 1)

  hold()
  const cancelCall = generationCalls + 1
  const cancelled = await json(`/searches/${search.id}/moodboards`, 'POST')
  await waitGeneration(cancelCall)
  await json(`/moodboards/${cancelled.id}`, 'DELETE')
  release!()
  assert.equal((await fetch(base + `/moodboards/${cancelled.id}`)).status, 404)
  assert.equal((await json(`/moodboards/${retry.id}`)).status, 'ready')

  const reads = calls
  await json(`/moodboards/${first.id}`)
  await json(`/searches/${search.id}/moodboards`)
  await json('/searches')
  assert.equal(calls, reads)
  hold()
  const cascadeCall = generationCalls + 1
  const cascade = await json(`/searches/${search.id}/moodboards`, 'POST')
  await waitGeneration(cascadeCall)
  await json('/searches', 'DELETE', { ids: [search.id] })
  release!()
  for (const id of [first.id, second.id, interrupted.id, failed.id, retry.id, tooFewSet.id, repairedSet.id, paletteSet.id, excludedSet.id, insufficientSet.id, cascade.id]) assert.equal((await fetch(base + `/moodboards/${id}`)).status, 404)
  assert.equal((await fetch(base + search.photos[0].url)).status, 404)
  assert.equal((await fetch(base + `/searches/${search.id}`)).status, 404)
  assert.equal((await json('/searches')).total, 1)
  assert.deepEqual(await json(`/searches/${keep.id}`), keep)
  assert.deepEqual(Buffer.from(await (await fetch(base + keep.photos[0].url)).arrayBuffer()), png)
  mode = 'no-matches'
  const expanded = await json('/search', 'POST', { prompt: 'A subject with no keyword matches' })
  assert.equal(expanded.photos.length, 6)
  assert.equal(expanded.debug.additionalLibraryPhotoCount, 24)
  assert.ok(expanded.photos.every((photo: { matchType: string }) => photo.matchType === 'partial'))
  const approximateSet = await json(`/searches/${expanded.id}/moodboards`, 'POST')
  const approximate = await waitSet(approximateSet.id, 'ready')
  assert.equal(approximate.design.referenceAssessment.coverage, 'approximate')
  await json('/photos', 'DELETE', { ids: ids.slice(3) })
  assert.deepEqual(await json('/library/status'), { photoCount: 2, minimumReferences: 6, canSearch: false })
  const callsBeforeBlockedSearch = calls
  const small = await fetch(base + '/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'A brief for a library with only two references' }) })
  assert.equal(small.status, 400)
  assert.equal((await small.json()).minimumReferences, 6)
  assert.equal(calls, callsBeforeBlockedSearch)
  await json('/photos', 'DELETE', { ids })
  assert.deepEqual(await json('/library/status'), { photoCount: 0, minimumReferences: 6, canSearch: false })
  assert.equal((await fetch(base + '/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'A subject with an empty library' }) })).status, 400)
  assert.equal(calls, callsBeforeBlockedSearch)
  assert.equal((await json('/searches')).total, 2)
  await json(`/searches/${expanded.id}`, 'DELETE')
  assert.deepEqual(await fs.readdir(path.join(root, 'data/search-snapshots')), [keep.id])
  const database = new DatabaseSync(path.join(root, 'data/workspace.sqlite'), { readOnly: true })
  try {
    assert.equal(database.prepare('PRAGMA integrity_check').get()!.integrity_check, 'ok')
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), [])
  } finally {
    database.close()
  }
})
