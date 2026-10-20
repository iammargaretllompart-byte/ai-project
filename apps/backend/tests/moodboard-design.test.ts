import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contrastRatio, designSchemaForReferences, validateDesign } from '../src/moodboard-design.js'
import { colourFixture, designFixture, fixturePhotoIds as photoIds } from './moodboard-fixture.js'

test('accepts coordinated directions and normalizes validated hex colours', () => {
  const input = designFixture()
  input.directions[0].palette[0].hex = '#ffffff'
  assert.equal(validateDesign(input, photoIds, colourFixture).directions[0].palette[0].hex, '#FFFFFF')
  assert.equal(contrastRatio('#FFFFFF', '#000000'), 21)
})

test('rejects invented references, unaccounted references, and palette source mismatches', () => {
  const input = designFixture()
  assert.throws(() => validateDesign(input, ['photo-2', 'photo-3', 'photo-4']), /invalid or duplicate reference/)
  assert.throws(() => validateDesign(input, [...photoIds, 'photo-4']), /every returned reference/)
  input.directions[1].palette[0].sourcePhotoId = 'photo-4'
  assert.throws(() => validateDesign(input, photoIds), /Palette sources/)
})

test('allows justified exclusions and overlap but rejects exclusions of used, unknown or duplicate images', () => {
  const input = designFixture()
  const available = [...photoIds, 'photo-4']
  input.excludedReferences = [{ photoId: 'photo-4', reason: 'The subject contradicts the brief and adds no useful visual qualities.' }]
  assert.equal(validateDesign(input, available).excludedReferences.length, 1)
  input.excludedReferences[0].photoId = 'photo-1'
  assert.throws(() => validateDesign(input, available), /Excluded references/)
  input.excludedReferences[0].photoId = 'invented'
  assert.throws(() => validateDesign(input, available), /Excluded references/)
  input.excludedReferences = Array.from({ length: 2 }, () => ({ photoId: 'photo-4', reason: 'Not useful.' }))
  assert.throws(() => validateDesign(input, available), /Excluded references/)
})

test('partial-only evidence must be approximate, including when strong references were excluded', () => {
  const input = designFixture()
  const available = [...photoIds, 'photo-4']
  input.excludedReferences = [{ photoId: 'photo-4', reason: 'Not relevant to these directions.' }]
  const context = { prompt: 'Editorial', photos: [...photoIds.map((id) => ({ id, matchType: 'partial' as const })), { id: 'photo-4', matchType: 'strong' as const }] }
  assert.throws(() => validateDesign(input, available, undefined, context), /only partial/)
  input.referenceAssessment.coverage = 'approximate'
  assert.equal(validateDesign(input, available, undefined, context).referenceAssessment.coverage, 'approximate')
})

test('requires complete comparison fields and limits reference emphasis', () => {
  const input = designFixture()
  input.axis.to = input.axis.from
  assert.throws(() => validateDesign(input, photoIds), /distinct poles/)
  input.axis.to = 'Precision'
  input.directions[0].references.forEach((reference) => { reference.emphasis = 'subtle' })
  assert.throws(() => validateDesign(input, photoIds), /at most one/)
  input.directions[0].references.slice(1).forEach((reference) => { reference.emphasis = 'standard' })
  assert.doesNotThrow(() => validateDesign(input, photoIds))
  assert.doesNotThrow(() => validateDesign({ ...input, specimen: undefined }, photoIds))
})

test('explicit brand hex constraints override image sampling only with verifiable brief provenance', () => {
  const input = designFixture()
  const colour = input.directions[0].palette[4]
  colour.hex = '#FF0000'
  colour.sourcePhotoId = null
  colour.sourceBriefQuote = 'Use our brand red #FF0000.'
  const context = { prompt: 'Editorial website. Use our brand red #FF0000.', photos: photoIds.map((id) => ({ id })) }
  assert.doesNotThrow(() => validateDesign(input, photoIds, colourFixture, context))
  assert.throws(() => validateDesign(input, photoIds, colourFixture, { ...context, prompt: 'Editorial website' }), /exact brief quote/)
  colour.sourceBriefQuote = 'Editorial website'
  assert.throws(() => validateDesign(input, photoIds, colourFixture, context), /exact brief quote/)
})

test('unused provenance may be omitted but every palette colour still needs a valid source', () => {
  const input = designFixture()
  for (const direction of input.directions) {
    for (const colour of direction.palette) Reflect.deleteProperty(colour, 'sourceBriefQuote')
  }
  const parsed = validateDesign(input, photoIds, colourFixture)
  assert.equal(parsed.directions[0].palette[0].sourceBriefQuote, null)
  Reflect.deleteProperty(input.directions[0].palette[0], 'sourcePhotoId')
  assert.throws(() => validateDesign(input, photoIds, colourFixture), /Palette sources/)
})

test('the model tool schema restricts reference and palette-source IDs to the saved search', () => {
  const input = designFixture()
  const schema = designSchemaForReferences(photoIds)
  assert.equal(schema.safeParse(input).success, true)
  input.directions[0].references[0].photoId = 'invented'
  assert.equal(schema.safeParse(input).success, false)
  input.directions[0].references[0].photoId = 'photo-1'
  input.directions[0].palette[0].sourcePhotoId = 'invented'
  assert.equal(schema.safeParse(input).success, false)
})

test('rejects duplicate risk levels, repeated palettes, and repeated typography pairings', () => {
  const input = designFixture()
  input.directions[1].risk = 'Grounded'
  assert.throws(() => validateDesign(input, photoIds), /in order/)
  input.directions[1].risk = 'Exploratory'
  input.directions[1].palette = structuredClone(input.directions[0].palette)
  assert.throws(() => validateDesign(input, photoIds), /distinct/)
  const other = designFixture()
  other.directions[2].typography = structuredClone(other.directions[0].typography)
  assert.throws(() => validateDesign(other, photoIds), /distinct/)
})

test('rejects invalid fonts, unsupported weights, CSS colours, duplicate roles, and unreadable text', () => {
  const input = designFixture()
  input.directions[0].typography.heading.weight = 999
  assert.throws(() => validateDesign(input, photoIds), /Unsupported Google Fonts weight/)
  assert.throws(() => validateDesign({ ...input, directions: [{ ...input.directions[0], typography: { heading: { family: 'Invented Font', weight: 400 }, body: input.directions[0].typography.body, rationale: 'Invalid' } }, ...input.directions.slice(1)] }, photoIds))
  const invalid = designFixture()
  invalid.directions[0].palette[0].hex = 'url(https://example.com)'
  assert.throws(() => validateDesign(invalid, photoIds))
  const roles = designFixture()
  roles.directions[0].palette[0].role = 'surface'
  assert.throws(() => validateDesign(roles, photoIds), /one colour per role/)
  const contrast = designFixture()
  contrast.directions[0].palette[2].hex = '#FFFFFF'
  assert.throws(() => validateDesign(contrast, photoIds), /readable contrast/)
})

test('Grounded colours must be derived from the extracted source image colours', () => {
  assert.throws(() => validateDesign(designFixture(), photoIds, [{ photoId: 'photo-1', colours: [{ hex: '#00FF00', proportion: 1 }] }]), /three Grounded colours/)
})

test('every direction needs three references in both schemas, and duplicates cannot meet the minimum', () => {
  for (const directionIndex of [0, 1, 2]) {
    for (const count of [1, 2]) {
      const input = designFixture()
      input.directions[directionIndex].references = input.directions[directionIndex].references.slice(0, count)
      assert.throws(() => validateDesign(input, photoIds), /at least three relevant references/)
      assert.equal(designSchemaForReferences(photoIds).safeParse(input).success, false)
    }
  }
  const duplicate = designFixture()
  duplicate.directions[0].references[2] = { ...duplicate.directions[0].references[0] }
  assert.throws(() => validateDesign(duplicate, photoIds), /invalid or duplicate reference/)
  assert.doesNotThrow(() => validateDesign(designFixture(), photoIds))
})
