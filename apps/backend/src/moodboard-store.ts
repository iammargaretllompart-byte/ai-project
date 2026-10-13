import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { ExtractedColours, MoodboardDesign, MoodboardSet, MoodboardSummary } from './moodboard-design.js'

type SetRow = {
  id: string; search_id: string; created_at: string; completed_at: string | null
  status: MoodboardSet['status']; stage: string; error: string | null; attempts: number
  design_json: string | null; colours_json: string | null
}

export function migrateMoodboards(database: DatabaseSync) {
  database.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE moodboard_sets (
      id TEXT PRIMARY KEY,
      search_id TEXT NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'ready', 'failed')),
      stage TEXT NOT NULL,
      error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      design_json TEXT CHECK (design_json IS NULL OR json_valid(design_json)),
      colours_json TEXT CHECK (colours_json IS NULL OR json_valid(colours_json)),
      CHECK (status != 'ready' OR (design_json IS NOT NULL AND colours_json IS NOT NULL))
    );
    CREATE INDEX moodboard_sets_search ON moodboard_sets(search_id, created_at DESC, id DESC);
    CREATE UNIQUE INDEX moodboard_sets_active ON moodboard_sets(search_id) WHERE status IN ('queued', 'running');
    PRAGMA user_version = 2;
    COMMIT;
  `)
}

function decode(row: SetRow): MoodboardSet {
  return {
    id: row.id, searchId: row.search_id, createdAt: row.created_at, completedAt: row.completed_at,
    status: row.status, stage: row.stage, error: row.error, attempts: row.attempts,
    design: row.design_json ? JSON.parse(row.design_json) as MoodboardDesign : null,
    extractedColours: row.colours_json ? JSON.parse(row.colours_json) as ExtractedColours : null,
  }
}

export class MoodboardStore {
  constructor(private readonly database: DatabaseSync) {}

  enqueue(searchId: string): MoodboardSet {
    const search = this.database.prepare('SELECT photo_count FROM searches WHERE id = ?').get(searchId)
    if (!search) throw new Error('Saved search not found')
    if (search.photo_count === 0) throw new Error('This search has no references to generate moodboards from')
    const active = this.database.prepare("SELECT * FROM moodboard_sets WHERE search_id = ? AND status IN ('queued', 'running')").get(searchId) as SetRow | undefined
    if (active) return decode(active)
    const id = randomUUID()
    this.database.prepare(`INSERT INTO moodboard_sets (id, search_id, created_at, status, stage)
      VALUES (?, ?, ?, 'queued', 'Waiting to generate')`).run(id, searchId, new Date().toISOString())
    return this.get(id)!
  }

  get(id: string): MoodboardSet | null {
    const row = this.database.prepare('SELECT * FROM moodboard_sets WHERE id = ?').get(id) as SetRow | undefined
    return row ? decode(row) : null
  }

  list(searchId: string): MoodboardSummary[] {
    return (this.database.prepare(`SELECT id, search_id, created_at, completed_at, status, stage, error, attempts,
      NULL AS design_json, NULL AS colours_json FROM moodboard_sets WHERE search_id = ? ORDER BY created_at DESC, id DESC`)
      .all(searchId) as SetRow[]).map((row) => {
        const { design: _design, extractedColours: _colours, ...summary } = decode(row)
        return summary
      })
  }

  recoverInterrupted() {
    this.database.prepare(`UPDATE moodboard_sets SET status = 'failed', stage = 'Generation failed',
      error = 'Generation was interrupted repeatedly. Please try again.', completed_at = ?
      WHERE status = 'running' AND attempts >= 3`).run(new Date().toISOString())
    this.database.exec("UPDATE moodboard_sets SET status = 'queued', stage = 'Resuming after restart' WHERE status = 'running'")
  }

  claimNext(): MoodboardSet | null {
    const row = this.database.prepare(`UPDATE moodboard_sets SET status = 'running', stage = 'Reading saved references', attempts = attempts + 1
      WHERE id = (SELECT id FROM moodboard_sets WHERE status = 'queued' ORDER BY created_at, id LIMIT 1)
      RETURNING *`).get() as SetRow | undefined
    return row ? decode(row) : null
  }

  progress(id: string, stage: string) {
    this.database.prepare("UPDATE moodboard_sets SET stage = ? WHERE id = ? AND status = 'running'").run(stage, id)
  }

  complete(id: string, design: MoodboardDesign, colours: ExtractedColours): boolean {
    return this.database.prepare(`UPDATE moodboard_sets SET status = 'ready', stage = 'Ready', completed_at = ?,
      design_json = ?, colours_json = ?, error = NULL WHERE id = ? AND status = 'running'`)
      .run(new Date().toISOString(), JSON.stringify(design), JSON.stringify(colours), id).changes > 0
  }

  fail(id: string, message: string) {
    this.database.prepare(`UPDATE moodboard_sets SET status = 'failed', stage = 'Generation failed', error = ?,
      completed_at = ? WHERE id = ? AND status = 'running'`).run(message, new Date().toISOString(), id)
  }

  delete(id: string): boolean {
    return this.database.prepare('DELETE FROM moodboard_sets WHERE id = ?').run(id).changes > 0
  }
}
