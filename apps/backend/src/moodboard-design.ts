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
export const minimumMoodboardReferences = 3
const font = z.object({ family: z.enum(googleFonts.map((font) => font.family)), weight: z.number().int() })
export const hexColour = z.string().regex(/^#[0-9a-fA-F]{6}$/).transform((value) => value.toUpperCase())
export const designSchema = z.object({
  schemaVersion: z.literal(2),
  axis: z.object({ from: z.string().trim().min(1).max(120), to: z.string().trim().min(1).max(120), explanation: text }),
  // Retained for older output; the renderer now uses the fixed AaBbCc specimen.
  specimen: z.object({ headline: z.string().trim().min(1).max(120), paragraph: z.string().trim().min(1).max(400) }).optional(),
  referenceAssessment: z.object({ coverage: z.enum(['supported', 'approximate']), explanation: text }),
  excludedReferences: z.array(z.object({ photoId: z.string(), reason: text })).max(100),
  directions: z.array(z.object({
    risk: z.enum(['Grounded', 'Exploratory', 'Bold']),
    title: z.string().trim().min(1).max(160),
    summary: text,
    rationale: text,
    descriptors: z.array(z.string().trim().min(1).max(40)).length(3),
    axisPosition: text,
    chooseThisIf: text,
    visualApproach: z.object({ imagery: text, texture: text, composition: text }),
    paletteUsage: text,
    references: z.array(z.object({ photoId: z.string(), reason: text, emphasis: z.enum(['standard', 'subtle']) })).min(minimumMoodboardReferences, 'Each direction needs at least three relevant references').max(30),
    typography: z.object({ heading: font, body: font, rationale: text }),
    palette: z.array(z.object({
      role: z.enum(['background', 'surface', 'text', 'primary', 'accent']),
      name: z.string().trim().min(1).max(80),
      hex: hexColour,
      sourcePhotoId: z.string().nullable().default(null),
      sourceBriefQuote: text.nullable().default(null),
      rationale: text,
    })).length(5),
  })).length(3),
})

export function designSchemaForReferences(photoIds: string[]) {
  const photoId = z.enum(photoIds)
  const direction = designSchema.shape.directions.element
  return designSchema.extend({
    excludedReferences: z.array(designSchema.shape.excludedReferences.element.extend({ photoId })).max(100),
    directions: z.array(direction.extend({
      references: z.array(direction.shape.references.element.extend({ photoId })).min(minimumMoodboardReferences, 'Each direction needs at least three relevant references').max(30),
      palette: z.array(direction.shape.palette.element.extend({ sourcePhotoId: photoId.nullable().default(null) })).length(5),
    })).length(3),
  })
}

export type MoodboardDesign = z.infer<typeof designSchema>
export class MoodboardPaletteError extends Error {
  constructor(message: string, readonly draft: MoodboardDesign, readonly directionIndex: number) {
    super(message)
    this.name = 'MoodboardPaletteError'
  }
}
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

export function validateDesign(input: unknown, photoIds: string[], extracted?: ExtractedColours, context?: {
  prompt: string
  photos: Array<{ id: string; matchType?: 'strong' | 'partial' }>
}): MoodboardDesign {
  const design = designSchema.parse(input)
  if (design.axis.from.toLowerCase() === design.axis.to.toLowerCase()) throw new Error('Creative axis needs distinct poles')
  const used = new Set<string>()
  const titles = new Set<string>()
  const typePairs = new Set<string>()
  const palettes = new Set<string>()
  for (const [index, direction] of design.directions.entries()) {
    if (direction.risk !== ['Grounded', 'Exploratory', 'Bold'][index]) throw new Error('Directions must be Grounded, Exploratory, and Bold in order')
    const ids = direction.references.map((reference) => reference.photoId)
    const invalidIds = ids.filter((id) => !photoIds.includes(id))
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index)
    if (invalidIds.length || duplicateIds.length) throw new Error(`Direction ${direction.risk} has invalid or duplicate reference IDs. Invalid: ${invalidIds.join(', ') || 'none'}; duplicated: ${duplicateIds.join(', ') || 'none'}. Allowed IDs: ${photoIds.join(', ')}`)
    if (direction.references.filter((reference) => reference.emphasis === 'subtle').length > 1) throw new Error('Use subtle emphasis on at most one reference per direction')
    if (new Set(direction.descriptors.map((word) => word.toLowerCase())).size !== 3) throw new Error('Direction needs three distinct descriptors')
    ids.forEach((id) => used.add(id))
    for (const font of [direction.typography.heading, direction.typography.body]) {
      const family = googleFonts.find((item) => item.family === font.family)!
      if (!(family.weights as readonly number[]).includes(font.weight)) throw new Error('Unsupported Google Fonts weight')
    }
    const roles = new Set(direction.palette.map((colour) => colour.role))
    if (roles.size !== 5) throw new Error('Palette must contain one colour per role')
    for (const colour of direction.palette) {
      if (colour.sourceBriefQuote !== null) {
        if (colour.sourcePhotoId !== null || !context?.prompt.includes(colour.sourceBriefQuote)
          || !colour.sourceBriefQuote.toUpperCase().includes(colour.hex)) {
          throw new MoodboardPaletteError('Brand palette colours need an exact brief quote containing their hex, with no image source', design, index)
        }
      } else if (!colour.sourcePhotoId || !ids.includes(colour.sourcePhotoId)) {
        throw new MoodboardPaletteError(`Palette sources must belong to the direction references: ${direction.risk}.${colour.role} has source ${colour.sourcePhotoId ?? '(missing)'}. Choose an actual supporting source from [${ids.join(', ')}].`, design, index)
      }
    }
    if (direction.risk === 'Grounded' && extracted) {
      const sampled = direction.palette.filter((colour) => {
        if (colour.sourceBriefQuote !== null) return true
        const sources = extracted.find((source) => source.photoId === colour.sourcePhotoId)?.colours ?? []
        return sources.some((source) => Math.hypot(...[1, 3, 5].map((index) =>
          parseInt(colour.hex.slice(index, index + 2), 16) - parseInt(source.hex.slice(index, index + 2), 16))) <= 64)
      })
      if (sampled.length < 3) throw new MoodboardPaletteError('At least three Grounded colours must closely follow their source image colours or explicit brand hex constraints', design, index)
    }
    const colour = (role: string) => direction.palette.find((colour) => colour.role === role)!.hex
    if (contrastRatio(colour('text'), colour('background')) < 4.5 || contrastRatio(colour('text'), colour('surface')) < 4.5) {
      throw new MoodboardPaletteError(`Palette text must have readable contrast on background and surface: ${direction.risk} text ${colour('text')}, background ${colour('background')} (${contrastRatio(colour('text'), colour('background')).toFixed(2)}:1), surface ${colour('surface')} (${contrastRatio(colour('text'), colour('surface')).toFixed(2)}:1). Both ratios must be at least 4.5:1. Keep background and surface in a similar lightness range so one text colour works on both.`, design, index)
    }
    titles.add(direction.title.toLowerCase())
    typePairs.add(`${direction.typography.heading.family}/${direction.typography.body.family}`)
    palettes.add(direction.palette.map((colour) => colour.hex).sort().join(','))
  }
  const excluded = design.excludedReferences.map((reference) => reference.photoId)
  if (new Set(excluded).size !== excluded.length || excluded.some((id) => !photoIds.includes(id) || used.has(id))) {
    throw new Error('Excluded references must be valid, unique, and unused in all directions')
  }
  if (new Set([...used, ...excluded]).size !== new Set(photoIds).size) throw new Error('Account for every returned reference: use it or explain its exclusion')
  const usedPhotos = context?.photos.filter((photo) => used.has(photo.id)) ?? []
  if (usedPhotos.length && usedPhotos.every((photo) => photo.matchType === 'partial') && design.referenceAssessment.coverage !== 'approximate') {
    throw new Error('A set using only partial matches must be labelled approximate')
  }
  if (titles.size !== 3 || typePairs.size !== 3 || palettes.size !== 3) throw new Error('Directions need distinct names, font pairings, and palettes')
  return design
}
