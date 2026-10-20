import type { ExtractedColours, MoodboardDesign } from '../src/moodboard-design.js'

export const fixturePhotoIds = ['photo-1', 'photo-2', 'photo-3']

export function designFixture(photoIds = fixturePhotoIds): MoodboardDesign {
  return {
    schemaVersion: 2,
    axis: { from: 'Tactile warmth', to: 'Editorial precision', explanation: 'Explore natural textures through an editorial lens.' },
    specimen: { headline: 'Stories with a natural rhythm', paragraph: 'An editorial identity shaped by material, light and thoughtful detail.' },
    referenceAssessment: { coverage: 'supported', explanation: 'The references support the requested editorial treatment.' },
    excludedReferences: [],
    directions: (['Grounded', 'Exploratory', 'Bold'] as const).map((risk, index) => ({
      risk, title: `${risk} direction`, summary: 'Visual summary', rationale: 'Connects to the image composition.',
      descriptors: [['Tactile', 'Quiet', 'Warm'], ['Structured', 'Luminous', 'Expressive'], ['Dramatic', 'Confident', 'Textural']][index],
      axisPosition: 'Balances tactile imagery and a precise typographic rhythm.',
      chooseThisIf: 'You want natural textures with a clear editorial voice.',
      visualApproach: { imagery: 'Close crops reveal material detail.', texture: 'Use restrained paper textures.', composition: 'Leave generous space around a clear hierarchy.' },
      paletteUsage: 'Use neutral surfaces, dark text and a small accent for emphasis.',
      references: photoIds.map((photoId) => ({ photoId, reason: 'Uses the reference structure.', emphasis: 'standard' as const })),
      typography: {
        heading: { family: (['Inter', 'Lora', 'Fraunces'] as const)[index], weight: 400 },
        body: { family: 'DM Sans', weight: 400 }, rationale: 'A deliberate type contrast.',
      },
      palette: [
        { role: 'background' as const, hex: '#FFFFFF' },
        { role: 'surface' as const, hex: '#F5F5F5' },
        { role: 'text' as const, hex: '#101010' },
        { role: 'primary' as const, hex: ['#333333', '#114477', '#883311'][index] },
        { role: 'accent' as const, hex: ['#555555', '#224488', '#993311'][index] },
      ].map((colour) => ({ ...colour, name: `${colour.role} tone`, sourcePhotoId: photoIds[0], sourceBriefQuote: null, rationale: 'Refined from the reference.' })),
    })),
  }
}

export const colourFixture: ExtractedColours = [{ photoId: 'photo-1', colours: [
  { hex: '#FFFFFF', proportion: 0.4 }, { hex: '#F5F5F5', proportion: 0.2 }, { hex: '#101010', proportion: 0.2 },
] }]
