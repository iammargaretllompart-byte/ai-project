import { z } from 'zod'

// Verified Google Fonts families and the weights used by the controlled renderer.
export const googleFonts = [
  { family: 'Inter', weights: [400, 500, 600, 700] },
  { family: 'DM Sans', weights: [400, 500, 600, 700] },
  { family: 'Manrope', weights: [400, 500, 600, 700] },
  { family: 'Space Grotesk', weights: [400, 500, 600, 700] },
  { family: 'Work Sans', weights: [400, 500, 600, 700] },
  { family: 'IBM Plex Sans', weights: [400, 500, 600, 700] },
  { family: 'Montserrat', weights: [400, 500, 600, 700] },
  { family: 'Archivo', weights: [400, 500, 600, 700] },
  { family: 'Barlow', weights: [400, 500, 600, 700] },
  { family: 'Public Sans', weights: [400, 500, 600, 700] },
  { family: 'Playfair Display', weights: [400, 600, 700] },
  { family: 'Cormorant Garamond', weights: [300, 400, 500, 600, 700] },
  { family: 'Crimson Pro', weights: [300, 400, 500, 600, 700] },
  { family: 'Lora', weights: [400, 500, 600, 700] },
  { family: 'Libre Baskerville', weights: [400, 700] },
  { family: 'Source Serif 4', weights: [400, 600, 700] },
  { family: 'DM Serif Display', weights: [400] },
  { family: 'Bodoni Moda', weights: [400, 600, 700] },
  { family: 'Fraunces', weights: [400, 600, 700] },
  { family: 'Space Mono', weights: [400, 700] },
] as const

const text = z.string().trim().min(1).max(3000)
const font = z.object({ family: z.enum(googleFonts.map((font) => font.family)), weight: z.number().int() })
export const hexColour = z.string().regex(/^#[0-9a-fA-F]{6}$/).transform((value) => value.toUpperCase())
export const designSchema = z.object({
  sampleFormat: z.enum(['landing-page', 'mobile-app', 'editorial', 'brand-board']),
  sampleFormatReason: text,
  directions: z.array(z.object({
    risk: z.enum(['Grounded', 'Exploratory', 'Bold']),
    title: z.string().trim().min(1).max(160),
    summary: text,
    rationale: text,
    references: z.array(z.object({ photoId: z.string(), reason: text })).min(1).max(30),
    typography: z.object({ heading: font, body: font, rationale: text }),
    palette: z.array(z.object({
      role: z.enum(['background', 'surface', 'text', 'primary', 'accent']),
      hex: hexColour,
      sourcePhotoId: z.string(),
      rationale: text,
    })).length(5),
    sample: z.object({
      eyebrow: z.string().trim().min(1).max(100),
      headline: z.string().trim().min(1).max(200),
      description: z.string().trim().min(1).max(600),
      actionLabel: z.string().trim().min(1).max(60),
      items: z.array(z.object({ label: z.string().trim().min(1).max(100), value: z.string().trim().min(1).max(150) })).min(1).max(3),
    }),
  })).length(3),
})

export type MoodboardDesign = z.infer<typeof designSchema>
export type ExtractedColours = Array<{ photoId: string; colours: Array<{ hex: string; proportion: number }> }>
export type MoodboardSet = {
  id: string
  searchId: string
  createdAt: string
  completedAt: string | null
  status: 'queued' | 'running' | 'ready' | 'failed'
  stage: string
  error: string | null
  attempts: number
  design: MoodboardDesign | null
  extractedColours: ExtractedColours | null
}
export type MoodboardSummary = Omit<MoodboardSet, 'design' | 'extractedColours'>

function luminance(hex: string) {
  const values = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
}

export function contrastRatio(first: string, second: string) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

export function validateDesign(input: unknown, photoIds: string[], extracted?: ExtractedColours): MoodboardDesign {
  const design = designSchema.parse(input)
  const used = new Set<string>()
  const titles = new Set<string>()
  const typePairs = new Set<string>()
  const palettes = new Set<string>()
  for (const [index, direction] of design.directions.entries()) {
    if (direction.risk !== ['Grounded', 'Exploratory', 'Bold'][index]) throw new Error('Directions must be Grounded, Exploratory, and Bold in order')
    const ids = direction.references.map((reference) => reference.photoId)
    if (new Set(ids).size !== ids.length || ids.some((id) => !photoIds.includes(id))) throw new Error('Direction has invalid or duplicate reference IDs')
    ids.forEach((id) => used.add(id))
    for (const font of [direction.typography.heading, direction.typography.body]) {
      const family = googleFonts.find((item) => item.family === font.family)!
      if (!(family.weights as readonly number[]).includes(font.weight)) throw new Error('Unsupported Google Fonts weight')
    }
    const roles = new Set(direction.palette.map((colour) => colour.role))
    if (roles.size !== 5) throw new Error('Palette must contain one colour per role')
    if (direction.palette.some((colour) => !ids.includes(colour.sourcePhotoId))) throw new Error('Palette sources must belong to the direction references')
    if (direction.risk === 'Grounded' && extracted) {
      const sampled = direction.palette.filter((colour) => {
        const sources = extracted.find((source) => source.photoId === colour.sourcePhotoId)?.colours ?? []
        return sources.some((source) => Math.hypot(...[1, 3, 5].map((index) =>
          parseInt(colour.hex.slice(index, index + 2), 16) - parseInt(source.hex.slice(index, index + 2), 16))) <= 64)
      })
      if (sampled.length < 3) throw new Error('At least three Grounded colours must closely follow their source image colours')
    }
    const colour = (role: string) => direction.palette.find((colour) => colour.role === role)!.hex
    if (contrastRatio(colour('text'), colour('background')) < 4.5 || contrastRatio(colour('text'), colour('surface')) < 4.5) {
      throw new Error('Sample text must have readable contrast on background and surface')
    }
    titles.add(direction.title.toLowerCase())
    typePairs.add(`${direction.typography.heading.family}/${direction.typography.body.family}`)
    palettes.add(direction.palette.map((colour) => colour.hex).sort().join(','))
  }
  if (used.size !== new Set(photoIds).size) throw new Error('Use every returned reference across the three directions')
  if (titles.size !== 3 || typePairs.size !== 3 || palettes.size !== 3) throw new Error('Directions need distinct names, font pairings, and palettes')
  return design
}
