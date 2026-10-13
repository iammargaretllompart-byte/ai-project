import type { GenerationInput, GenerationResult } from './moodboard-generator.js'
import type { SearchStore } from './search-store.js'

export class MoodboardWorker {
  private task: Promise<void> | null = null
  private active: { searchId: string; setId: string; controller: AbortController } | null = null
  private stopped = false

  constructor(private readonly store: SearchStore, private readonly generate: (input: GenerationInput) => Promise<GenerationResult>) {}

  start() {
    this.store.moodboards.recoverInterrupted()
    this.wake()
  }

  wake() {
    if (this.stopped || this.task) return
    this.task = this.drain().catch((error) => {
      console.error('Moodboard queue failed', error)
    }).finally(() => { this.task = null })
  }

  cancelSearches(ids: string[]) {
    if (this.active && ids.includes(this.active.searchId)) this.active.controller.abort()
  }

  cancelSet(id: string) {
    if (this.active?.setId === id) this.active.controller.abort()
  }

  async stop() {
    this.stopped = true
    this.active?.controller.abort()
    await this.task
  }

  async idle() {
    await this.task
  }

  private async drain() {
    while (!this.stopped) {
      const job = this.store.moodboards.claimNext()
      if (!job) return
      const controller = new AbortController()
      this.active = { searchId: job.searchId, setId: job.id, controller }
      try {
        const search = this.store.get(job.searchId)
        if (!search) continue
        const result = await this.generate({
          search, signal: controller.signal,
          progress: (stage) => this.store.moodboards.progress(job.id, stage),
        })
        if (!controller.signal.aborted) this.store.moodboards.complete(job.id, result.design, result.colours)
      } catch (error) {
        if (!this.stopped && this.store.moodboards.get(job.id)) {
          console.error(`Moodboard generation failed for ${job.id}`, error)
          this.store.moodboards.fail(job.id, 'Could not generate this set. Please try again; your saved references are preserved.')
        }
      } finally {
        this.active = null
      }
    }
  }
}
