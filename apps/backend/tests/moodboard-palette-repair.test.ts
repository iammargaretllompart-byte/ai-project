import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contrastRatio, MoodboardPaletteError, validateDesign, type ExtractedColours } from '../src/moodboard-design.js'
import { paletteCandidates } from '../src/moodboard-palette-repair.js'
import { colourFixture, designFixture, fixturePhotoIds } from './moodboard-fixture.js'

const context = { prompt: 'Colourful photography driven editorial landing page', photos: fixturePhotoIds.map(id => ({ id })) }

test('repairs the reported missing-source and mixed-surface contrast failure together', () => {
  const draft = designFixture()
  const palette = draft.directions[0].palette
  palette[0].hex = '#18181A'
  palette[1].hex = '#D8D7D3'
  palette[2].hex = '#18181A'
  palette[2].sourcePhotoId = null
  const extracted: ExtractedColours = [{ photoId: 'photo-1', colours: ['#18181A', '#D8D7D3', '#333333', '#555555'].map(hex => ({ hex, proportion: .25 })) }]
  const before = structuredClone(draft)
  const candidates = paletteCandidates(new MoodboardPaletteError('Missing source', draft, 0), extracted, context)
  assert.ok(candidates.length)
  for (const candidate of candidates) {
    const repaired = structuredClone(draft)
    repaired.directions[0].palette = candidate.palette
    assert.doesNotThrow(() => validateDesign(repaired, fixturePhotoIds, extracted, context))
    const colour = (role: string) => candidate.palette.find(colour => colour.role === role)!.hex
    assert.ok(contrastRatio(colour('text'), colour('background')) >= 4.5)
    assert.ok(contrastRatio(colour('text'), colour('surface')) >= 4.5)
    assert.deepEqual(candidate.palette.slice(3), palette.slice(3), 'Keep supported primary/accent colours')
    assert.ok(candidate.palette.every(colour => colour.sourcePhotoId === 'photo-1'))
  }
  assert.deepEqual(draft, before, 'Candidate planning must not mutate the draft')
})

test('repairs white text on mixed dark/light surfaces, using only selected image samples', () => {
  const draft = designFixture()
  draft.directions[0].palette[0].hex = '#18181A'
  draft.directions[0].palette[1].hex = '#D8D7D3'
  draft.directions[0].palette[2].hex = '#FFFFFF'
  const extracted: ExtractedColours = [{ photoId: 'photo-1', colours: ['#18181A', '#D8D7D3', '#333333', '#555555'].map(hex => ({ hex, proportion: .25 })) }, { photoId: 'unselected', colours: [{ hex: '#000000', proportion: 1 }] }]
  const candidates = paletteCandidates(new MoodboardPaletteError('Contrast', draft, 0), extracted, context)
  assert.ok(candidates.length)
  assert.ok(candidates.every(candidate => candidate.palette.every(colour => colour.sourcePhotoId !== 'unselected')))
})

test('does not override exact brand colours or invent a valid option when evidence cannot support one', () => {
  const draft = designFixture()
  const prompt = 'Use brand background #18181A, surface #D8D7D3 and text #18181A.'
  draft.directions[0].palette.slice(0, 3).forEach((colour, index) => {
    colour.hex = ['#18181A', '#D8D7D3', '#18181A'][index]
    colour.sourceBriefQuote = prompt
    colour.sourcePhotoId = null
  })
  assert.deepEqual(paletteCandidates(new MoodboardPaletteError('Contrast', draft, 0), colourFixture, { ...context, prompt }), [])
  assert.deepEqual(paletteCandidates(new MoodboardPaletteError('Missing source', designFixture(), 0), [], context), [])
})

test('a later broken palette does not prevent offering a valid repair for the current direction', () => {
  const draft = designFixture()
  draft.directions[0].palette[1].hex = '#000000'
  draft.directions[1].palette[1].hex = '#000000'
  const candidates = paletteCandidates(new MoodboardPaletteError('Contrast', draft, 0), colourFixture, context)
  assert.ok(candidates.length)
  const repaired = structuredClone(draft)
  repaired.directions[0].palette = candidates[0].palette
  assert.throws(() => validateDesign(repaired, fixturePhotoIds, colourFixture, context), (error: unknown) => error instanceof MoodboardPaletteError && error.directionIndex === 1)
})
