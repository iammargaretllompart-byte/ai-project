import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test, type TestContext } from 'node:test'
import { SearchStore, type SearchResult } from '../src/search-store.js'

async function fixture(context: TestContext) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'visual-library-store-'))
  const dataDir = path.join(root, 'data')
  const uploadsDir = path.join(root, 'uploads')
  await fs.mkdir(uploadsDir)
  await fs.writeFile(path.join(uploadsDir, 'first.jpeg'), 'original image bytes')
  await fs.writeFile(path.join(uploadsDir, 'second.png'), 'candidate image bytes')
  const photo = {
    id: 'photo-1', name: 'Original title', originalName: 'reference.jpeg', filename: 'first.jpeg',
    url: '/uploads/first.jpeg', keywords: ['editorial', 'warm'], createdAt: '2026-10-13T10:00:00Z',
    score: 10, selectionReason: 'Matches the brief', matchType: 'partial' as const,
  }
  const result: SearchResult = {
    keywords: ['editorial'], photos: [photo], selectedPhotos: [photo],
    candidatePhotos: [photo, { ...photo, id: 'photo-2', filename: 'second.png', url: '/uploads/second.png' }],
    debug: { selectionMethod: 'ai', selectedPhotoCount: 1, candidatePhotoCount: 2 },
  }
  const state = { root, dataDir, uploadsDir, result, store: await SearchStore.open(dataDir, uploadsDir) }
  context.after(async () => {
    state.store.close()
    await fs.rm(root, { recursive: true, force: true })
  })
  return state
}

test('saved results, metadata, and image copies survive a database restart', async (context) => {
  const state = await fixture(context)
  const saved = await state.store.save('  Warm editorial identity  ', state.result)
  assert.equal(saved.prompt, 'Warm editorial identity')
  assert.ok(saved.id)
  assert.ok(saved.createdAt)
  assert.equal(state.result.photos[0].url, '/uploads/first.jpeg')
  assert.equal(saved.photos[0].url, saved.selectedPhotos[0].url)
  assert.equal(saved.photos[0].url, saved.candidatePhotos[0].url)
  assert.equal((await fs.readdir(path.join(state.store.snapshotsDir, saved.id))).length, 2)

  state.store.close()
  state.store = await SearchStore.open(state.dataDir, state.uploadsDir)
  assert.deepEqual(state.store.get(saved.id), saved)
  assert.equal(await fs.readFile(path.join(state.store.snapshotsDir, saved.id, '0.jpeg'), 'utf8'), 'original image bytes')
})

test('library edits and deletion cannot change historical metadata or image bytes', async (context) => {
  const state = await fixture(context)
  const saved = await state.store.save('Editorial', state.result)
  state.result.photos[0].keywords.push('new keyword')
  state.result.photos[0].name = 'Changed title'
  await fs.writeFile(path.join(state.uploadsDir, 'first.jpeg'), 'changed library image')
  await fs.rm(path.join(state.uploadsDir, 'first.jpeg'))

  const restored = state.store.get(saved.id)!
  assert.equal(restored.photos[0].name, 'Original title')
  assert.deepEqual(restored.photos[0].keywords, ['editorial', 'warm'])
  assert.equal(restored.photos[0].matchType, 'partial')
  assert.equal(await fs.readFile(path.join(state.store.snapshotsDir, saved.id, '0.jpeg'), 'utf8'), 'original image bytes')
})

test('a missing image rolls back the entire save and removes partial copies', async (context) => {
  const state = await fixture(context)
  await fs.rm(path.join(state.uploadsDir, 'second.png'))
  await assert.rejects(() => state.store.save('Editorial', state.result), /ENOENT/)
  assert.equal(state.store.list().total, 0)
  assert.deepEqual(await fs.readdir(state.store.snapshotsDir), [])
})

test('concurrent saves remain separate and pagination returns stable summaries', async (context) => {
  const state = await fixture(context)
  const saved = await Promise.all(Array.from({ length: 4 }, (_, index) => state.store.save(`Search ${index}`, state.result)))
  assert.equal(new Set(saved.map((search) => search.id)).size, 4)
  assert.equal(state.store.list(2, 0).total, 4)
  const first = state.store.list(2, 0).searches
  const second = state.store.list(2, 2).searches
  assert.equal(first.length, 2)
  assert.equal(second.length, 2)
  assert.equal(new Set([...first, ...second].map((search) => search.id)).size, 4)
  assert.equal(first[0].photoCount, 1)
  assert.ok(first[0].previews[0].url.startsWith('/search-snapshots/'))
  assert.equal(state.store.get('missing'), null)
})

test('completed searches with no matching references are saved without image files', async (context) => {
  const state = await fixture(context)
  const saved = await state.store.save('No matches', { ...state.result, photos: [], selectedPhotos: [], candidatePhotos: [] })
  assert.deepEqual(state.store.get(saved.id)?.photos, [])
  assert.equal(state.store.list().searches[0].photoCount, 0)
  assert.deepEqual(await fs.readdir(path.join(state.store.snapshotsDir, saved.id)), [])
})

test('reference filenames cannot copy files outside the upload directory', async (context) => {
  const state = await fixture(context)
  state.result.photos[0].filename = '../private.jpeg'
  await assert.rejects(() => state.store.save('Invalid', state.result), /Invalid reference filename/)
  assert.equal(state.store.list().total, 0)
})

test('startup cleans interrupted snapshot writes without removing saved searches', async (context) => {
  const state = await fixture(context)
  const saved = await state.store.save('Saved', state.result)
  const abandoned = '.pending-12345678-1234-1234-1234-123456789abc'
  await fs.mkdir(path.join(state.store.snapshotsDir, abandoned))
  state.store.close()
  state.store = await SearchStore.open(state.dataDir, state.uploadsDir)
  assert.deepEqual(await fs.readdir(state.store.snapshotsDir), [saved.id])
  assert.ok(state.store.get(saved.id))
})

test('opening a newer database schema fails without changing its version', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'visual-library-schema-'))
  const database = new DatabaseSync(path.join(root, 'workspace.sqlite'))
  database.exec('PRAGMA user_version = 99')
  database.close()
  try {
    await assert.rejects(() => SearchStore.open(root, path.join(root, 'uploads')), /newer application version/)
    const check = new DatabaseSync(path.join(root, 'workspace.sqlite'), { readOnly: true })
    assert.equal(check.prepare('PRAGMA user_version').get()!.user_version, 99)
    check.close()
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('deleting a search removes its snapshots while preserving the library and other searches', async (context) => {
  const state = await fixture(context)
  const first = await state.store.save('Delete me', state.result)
  const second = await state.store.save('Keep me', state.result)
  assert.equal(state.store.has(first.id), true)
  assert.equal(await state.store.delete(first.id), true)
  assert.equal(state.store.has(first.id), false)
  assert.equal(state.store.get(first.id), null)
  assert.equal(await state.store.delete(first.id), false)
  assert.deepEqual(await fs.readdir(state.store.snapshotsDir), [second.id])
  assert.equal(await fs.readFile(path.join(state.uploadsDir, 'first.jpeg'), 'utf8'), 'original image bytes')
  assert.deepEqual(state.store.get(second.id), second)
  state.store.close()
  state.store = await SearchStore.open(state.dataDir, state.uploadsDir)
  assert.equal(state.store.list().total, 1)
  assert.equal(state.store.get(first.id), null)
})

test('bulk deletion removes selected searches once and preserves unselected snapshots', async (context) => {
  const state = await fixture(context)
  const first = await state.store.save('First', state.result)
  const second = await state.store.save('Second', state.result)
  const keep = await state.store.save('Keep', state.result)
  assert.deepEqual(await state.store.deleteMany([first.id, second.id, first.id, 'missing']), [first.id, second.id])
  assert.deepEqual(state.store.list().searches.map((search) => search.id), [keep.id])
  assert.deepEqual(await fs.readdir(state.store.snapshotsDir), [keep.id])
  assert.equal(await fs.readFile(path.join(state.uploadsDir, 'first.jpeg'), 'utf8'), 'original image bytes')
  assert.deepEqual(await state.store.deleteMany([first.id, second.id]), [])
})
