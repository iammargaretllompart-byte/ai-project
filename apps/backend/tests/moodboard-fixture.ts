import type { ExtractedColours, MoodboardDesign } from '../src/moodboard-design.js'

export function designFixture(photoIds = ['photo-1']): MoodboardDesign {
  return {
    directions: (['Grounded', 'Exploratory', 'Bold'] as const).map((risk, index) => ({
      risk, title: `${risk} direction`, summary: 'Visual summary', rationale: 'Connects to the image composition.',
      references: photoIds.map((photoId) => ({ photoId, reason: 'Uses the reference structure.' })),
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
      ].map((colour) => ({ ...colour, sourcePhotoId: photoIds[0], rationale: 'Refined from the reference.' })),
    })),
  }
}

export const colourFixture: ExtractedColours = [{ photoId: 'photo-1', colours: [
  { hex: '#FFFFFF', proportion: 0.4 }, { hex: '#F5F5F5', proportion: 0.2 }, { hex: '#101010', proportion: 0.2 },
] }]
