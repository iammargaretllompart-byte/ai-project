import { contrastRatio, MoodboardPaletteError, validateDesign, type ExtractedColours, type MoodboardDesign } from './moodboard-design.js'

type Colour = MoodboardDesign['directions'][number]['palette'][number]
export type PaletteCandidate = { id: string; palette: Colour[]; paletteUsage: string }
const distance = (a: string, b: string) => Math.hypot(...[1, 3, 5].map(index => parseInt(a.slice(index, index + 2), 16) - parseInt(b.slice(index, index + 2), 16)))

// Offer only checked combinations, so the model need not do contrast arithmetic.
// No saved design is changed here; the model explicitly selects a candidate.
export function paletteCandidates(error: MoodboardPaletteError, extracted: ExtractedColours, context: {
  prompt: string; photos: Array<{ id: string; matchType?: 'strong' | 'partial' }>
}): PaletteCandidate[] {
  const { draft, directionIndex } = error
  const direction = draft.directions[directionIndex]
  const ids = direction.references.map(reference => reference.photoId)
  const samples = extracted.filter(source => ids.includes(source.photoId)).flatMap(source => source.colours.map(colour => ({ hex: colour.hex, sourcePhotoId: source.photoId })))
  const pools = direction.palette.map(original => {
    // Never replace a brief-supplied brand colour to make a repair pass.
    if (original.sourceBriefQuote !== null) return [original]
    const options: Colour[] = []
    if (original.sourcePhotoId && ids.includes(original.sourcePhotoId)) options.push(original)
    else {
      const nearest = [...samples].sort((a, b) => distance(a.hex, original.hex) - distance(b.hex, original.hex))[0]
      if (nearest && distance(nearest.hex, original.hex) <= 64) options.push({ ...original, sourcePhotoId: nearest.sourcePhotoId,
        rationale: `Refined from sampled ${nearest.hex} in the selected reference.` })
    }
    // Also fix missing provenance on primary/accent, but keep their hex if supported.
    if (options.length && (original.role === 'primary' || original.role === 'accent')) return options
    const nearest = [...samples].sort((a, b) => distance(a.hex, original.hex) - distance(b.hex, original.hex))
    const unique = nearest.filter((sample, index) => nearest.findIndex(other => other.hex === sample.hex) === index)
    const lightness = [...unique].sort((a, b) => contrastRatio(a.hex, '#000000') - contrastRatio(b.hex, '#000000'))
    const choices = [...unique.slice(0, 14), ...lightness.slice(0, 1), ...lightness.slice(-1)]
    for (const sample of choices) {
      if (options.some(option => option.hex === sample.hex)) continue
      options.push({ ...original, ...sample, name: `Reference ${original.role}`, sourceBriefQuote: null, rationale: `Sampled ${sample.hex} from the selected reference; used for ${original.role}.` })
    }
    return options
  })
  if (pools.some(pool => !pool.length)) return []
  const roleIndex = (role: string) => direction.palette.findIndex(colour => colour.role === role)
  const textIndex = roleIndex('text'), backgroundIndex = roleIndex('background'), surfaceIndex = roleIndex('surface')
  const candidates: Array<PaletteCandidate & { score: number }> = []
  for (const text of pools[textIndex]) for (const background of pools[backgroundIndex]) {
    if (contrastRatio(text.hex, background.hex) < 4.5) continue
    for (const surface of pools[surfaceIndex]) {
      if (contrastRatio(text.hex, surface.hex) < 4.5) continue
      const palette = pools.map(pool => pool[0])
      palette[textIndex] = text
      palette[backgroundIndex] = background
      palette[surfaceIndex] = surface
      const corrected = structuredClone(draft)
      corrected.directions[directionIndex].palette = palette
      try { validateDesign(corrected, context.photos.map(photo => photo.id), extracted, context) }
      catch (failure) {
        // Later directions may need their own repair; this direction must pass.
        if (!(failure instanceof MoodboardPaletteError) || failure.directionIndex <= directionIndex) continue
      }
      const score = palette.reduce((sum, colour, index) => sum + (colour.hex === direction.palette[index].hex ? 0 : 1000 + distance(colour.hex, direction.palette[index].hex)), 0)
      candidates.push({ id: '', palette, score, paletteUsage: palette.some((colour, index) => colour.hex !== direction.palette[index].hex)
        ? palette.map(colour => `${colour.name} (${colour.hex}) for ${colour.role}`).join('; ') + '.' : direction.paletteUsage })
    }
  }
  return candidates.sort((a, b) => a.score - b.score).slice(0, 3).map(({ score: _score, ...candidate }, index) => ({ ...candidate, id: `palette-${index + 1}` }))
}
