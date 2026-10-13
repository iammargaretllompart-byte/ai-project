import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export type SnapshotPhoto = {
  id: string
  name?: string
  originalName: string
  filename: string
  url: string
  keywords: string[]
  createdAt: string
  score: number
  selectionReason?: string
}

export type SearchResult = {
  keywords: string[]
  photos: SnapshotPhoto[]
  selectedPhotos: SnapshotPhoto[]
  candidatePhotos: SnapshotPhoto[]
  debug: unknown
}

export type SavedSearch = SearchResult & {
  id: string
  prompt: string
  createdAt: string
}

export type SearchSummary = Pick<SavedSearch, 'id' | 'prompt' | 'createdAt'> & {
  photoCount: number
  previews: Array<Pick<SnapshotPhoto, 'id' | 'name' | 'url'>>
}

type SearchRow = { snapshot_json: string }

export class SearchStore {
  private constructor(
    private readonly database: DatabaseSync,
    readonly snapshotsDir: string,
    private readonly uploadsDir: string,
  ) {}

  static async open(dataDir: string, uploadsDir: string) {
    await fs.mkdir(dataDir, { recursive: true })
    const snapshotsDir = path.join(dataDir, 'search-snapshots')
    await fs.mkdir(snapshotsDir, { recursive: true })
    const database = new DatabaseSync(path.join(dataDir, 'workspace.sqlite'))

    try {
      database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
      const version = (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
      if (version > 1) throw new Error('Workspace database was created by a newer application version')

      if (version === 0) {
        database.exec(`
          BEGIN IMMEDIATE;
          CREATE TABLE searches (
            id TEXT PRIMARY KEY,
            prompt TEXT NOT NULL,
            created_at TEXT NOT NULL,
            photo_count INTEGER NOT NULL CHECK (photo_count >= 0),
            snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json))
          );
          CREATE INDEX searches_created_at ON searches(created_at DESC, id DESC);
          PRAGMA user_version = 1;
          COMMIT;
        `)
      }

      // A crash before the database insert can leave unpublished image copies.
      const savedIds = new Set(database.prepare('SELECT id FROM searches').all().map((row) => String(row.id)))
      for (const entry of await fs.readdir(snapshotsDir, { withFileTypes: true })) {
        if (entry.isDirectory() && !savedIds.has(entry.name) &&
          /^(?:\.pending-)?[0-9a-f-]{36}$/.test(entry.name)) {
          await fs.rm(path.join(snapshotsDir, entry.name), { recursive: true, force: true })
        }
      }

      return new SearchStore(database, snapshotsDir, uploadsDir)
    } catch (error) {
      database.close()
      throw error
    }
  }

  async save(prompt: string, result: SearchResult): Promise<SavedSearch> {
    const id = randomUUID()
    const stagingDir = path.join(this.snapshotsDir, `.pending-${id}`)
    const finalDir = path.join(this.snapshotsDir, id)
    const snapshot = structuredClone(result)
    const filenames = new Map<string, string>()
    await fs.mkdir(stagingDir)

    try {
      for (const photo of [...snapshot.photos, ...snapshot.selectedPhotos, ...snapshot.candidatePhotos]) {
        if (path.basename(photo.filename) !== photo.filename || photo.filename === '.' || photo.filename === '..') {
          throw new Error('Invalid reference filename')
        }

        let filename = filenames.get(photo.filename)
        if (!filename) {
          const extension = path.extname(photo.filename).toLowerCase()
          if (!/^\.[a-z0-9]{1,10}$/.test(extension)) throw new Error('Invalid reference extension')
          filename = `${filenames.size}${extension}`
          await fs.copyFile(path.join(this.uploadsDir, photo.filename), path.join(stagingDir, filename))
          filenames.set(photo.filename, filename)
        }
        photo.url = `/search-snapshots/${id}/${filename}`
      }

      const saved: SavedSearch = { ...snapshot, id, prompt: prompt.trim(), createdAt: new Date().toISOString() }
      await fs.rename(stagingDir, finalDir)
      // Publish only after all image copies are complete. One insert is atomic.
      this.database.prepare(`
        INSERT INTO searches (id, prompt, created_at, photo_count, snapshot_json)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, saved.prompt, saved.createdAt, saved.photos.length, JSON.stringify(saved))
      return saved
    } catch (error) {
      await fs.rm(stagingDir, { recursive: true, force: true })
      await fs.rm(finalDir, { recursive: true, force: true })
      throw error
    }
  }

  get(id: string): SavedSearch | null {
    const row = this.database.prepare('SELECT snapshot_json FROM searches WHERE id = ?').get(id) as SearchRow | undefined
    return row ? JSON.parse(row.snapshot_json) as SavedSearch : null
  }

  has(id: string): boolean {
    return Boolean(this.database.prepare('SELECT 1 FROM searches WHERE id = ?').get(id))
  }

  list(limit = 30, offset = 0): { searches: SearchSummary[]; total: number } {
    const rows = this.database.prepare(`
      SELECT snapshot_json FROM searches ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
    `).all(limit, offset) as SearchRow[]
    const searches = rows.map((row) => {
      const saved = JSON.parse(row.snapshot_json) as SavedSearch
      return {
        id: saved.id,
        prompt: saved.prompt,
        createdAt: saved.createdAt,
        photoCount: saved.photos.length,
        previews: saved.photos.slice(0, 3).map(({ id, name, url }) => ({ id, name, url })),
      }
    })
    const total = Number(this.database.prepare('SELECT COUNT(*) AS count FROM searches').get()!.count)
    return { searches, total }
  }

  async delete(id: string): Promise<boolean> {
    return (await this.deleteMany([id])).length > 0
  }

  async deleteMany(ids: string[]): Promise<string[]> {
    const deletedIds: string[] = []
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const remove = this.database.prepare('DELETE FROM searches WHERE id = ?')
      for (const id of new Set(ids)) {
        if (remove.run(id).changes > 0) deletedIds.push(id)
      }
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }

    await Promise.all(deletedIds.map(async (id) => {
      try {
        await fs.rm(path.join(this.snapshotsDir, id), { recursive: true, force: true })
      } catch (error) {
        // Records are already removed; startup cleanup retries leftover files.
        console.warn('Could not remove deleted search snapshots', error)
      }
    }))
    return deletedIds
  }

  close() {
    this.database.close()
  }
}
