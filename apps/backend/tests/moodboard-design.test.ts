import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contrastRatio, validateDesign } from '../src/moodboard-design.js'
import { colourFixture, designFixture } from './moodboard-fixture.js'

test('accepts coordinated directions and normalizes validated hex colours', () => {
  const input = designFixture()
  input.directions[0].palette[0].hex = '#ffffff'
  assert.equal(validateDesign(input, ['photo-1'], colourFixture).directions[0].palette[0].hex, '#FFFFFF')
  assert.equal(contrastRatio('#FFFFFF', '#000000'), 21)
})

test('rejects invented references, missing returned references, and palette source mismatches', () => {
  const input = designFixture()
  assert.throws(() => validateDesign(input, ['photo-2']), /invalid or duplicate reference/)
  assert.throws(() => validateDesign(input, ['photo-1', 'photo-2']), /every returned reference/)
  input.directions[1].palette[0].sourcePhotoId = 'photo-2'
  assert.throws(() => validateDesign(input, ['photo-1']), /Palette sources/)
})

test('rejects duplicate risk levels, repeated palettes, and repeated typography pairings', () => {
  const input = designFixture()
  input.directions[1].risk = 'Grounded'
  assert.throws(() => validateDesign(input, ['photo-1']), /in order/)
  input.directions[1].risk = 'Exploratory'
  input.directions[1].palette = structuredClone(input.directions[0].palette)
  assert.throws(() => validateDesign(input, ['photo-1']), /distinct/)
  const other = designFixture()
  other.directions[2].typography = structuredClone(other.directions[0].typography)
  assert.throws(() => validateDesign(other, ['photo-1']), /distinct/)
})

test('rejects invalid fonts, unsupported weights, CSS colours, duplicate roles, and unreadable text', () => {
  const input = designFixture()
  input.directions[0].typography.heading.weight = 999
  assert.throws(() => validateDesign(input, ['photo-1']), /Unsupported Google Fonts weight/)
  assert.throws(() => validateDesign({ ...input, directions: [{ ...input.directions[0], typography: { heading: { family: 'Invented Font', weight: 400 }, body: input.directions[0].typography.body, rationale: 'Invalid' } }, ...input.directions.slice(1)] }, ['photo-1']))
  const invalid = designFixture()
  invalid.directions[0].palette[0].hex = 'url(https://example.com)'
  assert.throws(() => validateDesign(invalid, ['photo-1']))
  const roles = designFixture()
  roles.directions[0].palette[0].role = 'surface'
  assert.throws(() => validateDesign(roles, ['photo-1']), /one colour per role/)
  const contrast = designFixture()
  contrast.directions[0].palette[2].hex = '#FFFFFF'
  assert.throws(() => validateDesign(contrast, ['photo-1']), /readable contrast/)
})

test('Grounded colours must be derived from the extracted source image colours', () => {
  assert.throws(() => validateDesign(designFixture(), ['photo-1'], [{ photoId: 'photo-1', colours: [{ hex: '#00FF00', proportion: 1 }] }]), /three Grounded colours/)
})
