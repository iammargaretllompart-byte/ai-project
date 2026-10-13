import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { SearchStore } from '../src/search-store.js'

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
