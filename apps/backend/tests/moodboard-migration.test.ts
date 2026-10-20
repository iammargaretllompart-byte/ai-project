import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { SearchStore } from '../src/search-store.js'
import { designFixture } from './moodboard-fixture.js'

test('migration from search-only schema preserves saved results and adds cascading moodboard storage', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'moodboard-migration-'))
  const database = new DatabaseSync(path.join(root, 'workspace.sqlite'))
  database.exec(`CREATE TABLE searches (id TEXT PRIMARY KEY, prompt TEXT NOT NULL, created_at TEXT NOT NULL,
    photo_count INTEGER NOT NULL, snapshot_json TEXT NOT NULL);
    PRAGMA user_version = 1;`)
  const search = { id: 'existing-search', prompt: 'Existing brief', createdAt: '2026-10-01T10:00:00Z', photos: [], selectedPhotos: [], candidatePhotos: [], keywords: [], debug: null }
  database.prepare('INSERT INTO searches VALUES (?, ?, ?, ?, ?)').run(search.id, search.prompt, search.createdAt, 0, JSON.stringify(search))
  database.close()
  const store = await SearchStore.open(root, path.join(root, 'uploads'))
  try {
    assert.deepEqual(store.get(search.id), search)
    assert.deepEqual(store.moodboards.list(search.id), [])
    const check = new DatabaseSync(path.join(root, 'workspace.sqlite'), { readOnly: true })
    assert.equal(check.prepare('PRAGMA user_version').get()!.user_version, 2)
    assert.equal(check.prepare('PRAGMA integrity_check').get()!.integrity_check, 'ok')
    check.close()
  } finally {
    store.close()
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('opening legacy moodboards preserves saved JSON without requiring new generation fields', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'moodboard-legacy-'))
  const store = await SearchStore.open(root, path.join(root, 'uploads'))
  store.close()
  const database = new DatabaseSync(path.join(root, 'workspace.sqlite'))
  const legacy = { sampleFormat: 'editorial', sampleFormatReason: 'An older saved board.', directions: designFixture().directions.map((direction) => ({
    risk: direction.risk, title: direction.title, summary: direction.summary, rationale: direction.rationale,
    typography: direction.typography,
    references: direction.references.map(({ photoId, reason }) => ({ photoId, reason })),
    palette: direction.palette.map(({ role, hex, sourcePhotoId, rationale }) => ({ role, hex, sourcePhotoId, rationale })),
  })) }
  const savedJson = JSON.stringify(legacy)
  const search = { id: 'legacy-search', prompt: 'Original brief', createdAt: '2026-10-01T10:00:00Z', photos: [], selectedPhotos: [], candidatePhotos: [], keywords: [], debug: null }
  database.prepare('INSERT INTO searches VALUES (?, ?, ?, ?, ?)').run(search.id, search.prompt, search.createdAt, 0, JSON.stringify(search))
  database.prepare(`INSERT INTO moodboard_sets (id, search_id, created_at, status, stage, design_json, colours_json)
    VALUES ('legacy-set', ?, ?, 'ready', 'Ready', ?, '[]')`).run(search.id, search.createdAt, savedJson)
  database.close()
  const reopened = await SearchStore.open(root, path.join(root, 'uploads'))
  try {
    assert.deepEqual(reopened.moodboards.get('legacy-set')!.design, legacy)
    const check = new DatabaseSync(path.join(root, 'workspace.sqlite'), { readOnly: true })
    try { assert.equal(check.prepare("SELECT design_json FROM moodboard_sets WHERE id = 'legacy-set'").get()!.design_json, savedJson) }
    finally { check.close() }
  } finally {
    reopened.close()
    await fs.rm(root, { recursive: true, force: true })
  }
})
