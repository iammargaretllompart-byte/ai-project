import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, type TestContext } from 'node:test'
import { MoodboardWorker } from '../src/moodboard-worker.js'
import { SearchStore } from '../src/search-store.js'
import { createMoodboardGenerator } from '../src/moodboard-generator.js'
import { colourFixture, designFixture, fixturePhotoIds } from './moodboard-fixture.js'

async function fixture(context: TestContext) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'moodboard-worker-'))
  const uploads = path.join(root, 'uploads')
  const data = path.join(root, 'data')
  await fs.mkdir(uploads)
  await fs.writeFile(path.join(uploads, 'first.jpeg'), 'snapshot bytes')
  const state = { data, uploads, store: await SearchStore.open(data, uploads), workers: [] as MoodboardWorker[] }
  const photos = fixturePhotoIds.map((id) => ({ id, originalName: 'first.jpeg', filename: 'first.jpeg', url: '/uploads/first.jpeg', keywords: [], score: 1, createdAt: new Date().toISOString() }))
  const search = await state.store.save('Editorial website', { keywords: [], photos, selectedPhotos: photos, candidatePhotos: photos, debug: null })
  context.after(async () => {
    await Promise.all(state.workers.map((worker) => worker.stop()))
    state.store.close()
    await fs.rm(root, { recursive: true, force: true })
  })
  return { state, search }
}

const result = () => ({ design: designFixture(), colours: colourFixture })

test('queued jobs survive restart, duplicate enqueue reuses an active set, regeneration preserves earlier sets', async (context) => {
  const { state, search } = await fixture(context)
  const first = state.store.moodboards.enqueue(search.id)
  assert.equal(state.store.moodboards.enqueue(search.id).id, first.id)
  state.store.close()
  state.store = await SearchStore.open(state.data, state.uploads)
  let calls = 0
  const worker = new MoodboardWorker(state.store, async () => { calls++; return result() })
  state.workers.push(worker)
  worker.start()
  await worker.idle()
  assert.equal(state.store.moodboards.get(first.id)?.status, 'ready')
  assert.deepEqual(state.store.moodboards.get(first.id)?.design, designFixture())
  const second = state.store.moodboards.enqueue(search.id)
  assert.notEqual(second.id, first.id)
  worker.wake()
  await worker.idle()
  assert.equal(calls, 2)
  assert.equal(state.store.moodboards.list(search.id).filter((set) => set.status === 'ready').length, 2)
  assert.equal(state.store.list().searches[0].moodboardSets.length, 2)
  state.store.close()
  state.store = await SearchStore.open(state.data, state.uploads)
  assert.deepEqual(state.store.moodboards.get(first.id)?.design, designFixture())
  assert.equal(state.store.moodboards.get(second.id)?.status, 'ready')
  assert.equal(calls, 2)
})

test('interrupted running work is resumed, with bounded repeated restart recovery', async (context) => {
  const { state, search } = await fixture(context)
  const set = state.store.moodboards.enqueue(search.id)
  state.store.moodboards.claimNext()
  state.store.close()
  state.store = await SearchStore.open(state.data, state.uploads)
  state.store.moodboards.recoverInterrupted()
  assert.equal(state.store.moodboards.get(set.id)?.status, 'queued')
  assert.equal(state.store.moodboards.claimNext()?.attempts, 2)
  state.store.moodboards.recoverInterrupted()
  assert.equal(state.store.moodboards.claimNext()?.attempts, 3)
  state.store.moodboards.recoverInterrupted()
  assert.equal(state.store.moodboards.get(set.id)?.status, 'failed')
  assert.notEqual(state.store.moodboards.enqueue(search.id).id, set.id)
})

test('generation failure is persisted, while a later retry can complete', async (context) => {
  context.mock.method(console, 'error', () => {})
  const { state, search } = await fixture(context)
  const failed = state.store.moodboards.enqueue(search.id)
  const worker = new MoodboardWorker(state.store, async () => { throw new Error('Provider unavailable') })
  state.workers.push(worker)
  worker.start()
  await worker.idle()
  assert.equal(state.store.moodboards.get(failed.id)?.status, 'failed')
  assert.ok(state.store.moodboards.get(failed.id)?.error)
  const retry = state.store.moodboards.enqueue(search.id)
  const next = new MoodboardWorker(state.store, async () => result())
  state.workers.push(next)
  next.start()
  await next.idle()
  assert.equal(state.store.moodboards.get(retry.id)?.status, 'ready')
  assert.equal(state.store.moodboards.get(failed.id)?.status, 'failed')
})

test('a provider timeout has an actionable saved message and preserves earlier ready sets', async (context) => {
  context.mock.method(console, 'error', () => {})
  const { state, search } = await fixture(context)
  const ready = state.store.moodboards.enqueue(search.id)
  state.store.moodboards.claimNext()
  state.store.moodboards.complete(ready.id, designFixture(), colourFixture)
  const failed = state.store.moodboards.enqueue(search.id)
  const worker = new MoodboardWorker(state.store, async () => { throw new DOMException('Request timeout', 'TimeoutError') })
  state.workers.push(worker)
  worker.start()
  await worker.idle()
  assert.equal(state.store.moodboards.get(failed.id)?.stage, 'Generation timed out')
  assert.match(state.store.moodboards.get(failed.id)!.error!, /took too long/)
  assert.equal(state.store.moodboards.get(failed.id)?.design, null)
  assert.deepEqual(state.store.moodboards.get(ready.id)?.design, designFixture())
  assert.ok(state.store.get(search.id))
})

test('historical searches with fewer than three references fail before image processing or AI calls', async (context) => {
  context.mock.method(console, 'error', () => {})
  const { state, search } = await fixture(context)
  const photos = search.photos.slice(0, 2)
  const small = await state.store.save('Historical small search', { keywords: [], photos, selectedPhotos: photos, candidatePhotos: photos, debug: null })
  const set = state.store.moodboards.enqueue(small.id)
  let calls = 0
  const worker = new MoodboardWorker(state.store, createMoodboardGenerator(state.store.snapshotsDir, () => { calls++; throw new Error('AI must not be called') }))
  state.workers.push(worker)
  worker.start()
  await worker.idle()
  assert.equal(calls, 0)
  assert.equal(state.store.moodboards.get(set.id)?.stage, 'More relevant references needed')
  assert.match(state.store.moodboards.get(set.id)!.error!, /at least three distinct, relevant references/)
  assert.equal(state.store.moodboards.get(set.id)?.design, null)
})

test('deleting a search cancels its running work and prevents late completion from resurrecting it', async (context) => {
  const { state, search } = await fixture(context)
  const set = state.store.moodboards.enqueue(search.id)
  let release!: () => void
  const blocked = new Promise<void>((resolve) => { release = resolve })
  let signal!: AbortSignal
  const worker = new MoodboardWorker(state.store, async (input) => { signal = input.signal; await blocked; return result() })
  state.workers.push(worker)
  worker.start()
  await state.store.delete(search.id)
  worker.cancelSearches([search.id])
  assert.equal(signal.aborted, true)
  release()
  await worker.idle()
  assert.equal(state.store.moodboards.get(set.id), null)
})

test('deleting one set preserves its search and other sets; empty results cannot be queued', async (context) => {
  const { state, search } = await fixture(context)
  const first = state.store.moodboards.enqueue(search.id)
  state.store.moodboards.claimNext()
  state.store.moodboards.complete(first.id, designFixture(), colourFixture)
  const second = state.store.moodboards.enqueue(search.id)
  assert.equal(state.store.moodboards.delete(first.id), true)
  assert.equal(state.store.moodboards.get(first.id), null)
  assert.ok(state.store.moodboards.get(second.id))
  assert.ok(state.store.get(search.id))
  const empty = await state.store.save('No matches', { keywords: [], photos: [], selectedPhotos: [], candidatePhotos: [], debug: null })
  assert.throws(() => state.store.moodboards.enqueue(empty.id), /no references/)
})

test('stopping the worker leaves interrupted work durable for the next startup', async (context) => {
  const { state, search } = await fixture(context)
  const set = state.store.moodboards.enqueue(search.id)
  const worker = new MoodboardWorker(state.store, async ({ signal }) => {
    await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Stopped')), { once: true }))
    return result()
  })
  state.workers.push(worker)
  worker.start()
  await worker.stop()
  assert.equal(state.store.moodboards.get(set.id)?.status, 'running')
  const next = new MoodboardWorker(state.store, async () => result())
  state.workers.push(next)
  next.start()
  await next.idle()
  assert.equal(state.store.moodboards.get(set.id)?.status, 'ready')
})
