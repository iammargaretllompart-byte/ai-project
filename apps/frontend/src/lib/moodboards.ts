export type MoodboardSummary = {
  id: string
  searchId: string
  createdAt: string
  completedAt: string | null
  status: 'queued' | 'running' | 'ready' | 'failed'
  stage: string
  error: string | null
}

export type MoodboardSet = MoodboardSummary & {
  design: null | {
    sampleFormat: string
    sampleFormatReason: string
    directions: Array<{
      risk: 'Grounded' | 'Exploratory' | 'Bold'
      title: string
      summary: string
      rationale: string
      references: Array<{ photoId: string; reason: string }>
      typography: { heading: { family: string; weight: number }; body: { family: string; weight: number }; rationale: string }
      palette: Array<{ role: string; hex: string; sourcePhotoId: string; rationale: string }>
      sample: { eyebrow: string; headline: string; description: string; actionLabel: string; items: Array<{ label: string; value: string }> }
    }>
  }
}

export function isGenerating(set: MoodboardSummary) {
  return set.status === 'queued' || set.status === 'running'
}

export function moodboardStatus(set: MoodboardSummary) {
  return isGenerating(set) ? 'Generating' : set.status === 'ready' ? 'Ready' : 'Failed'
}
