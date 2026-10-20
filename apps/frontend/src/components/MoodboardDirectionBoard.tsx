import type { CSSProperties } from 'react'
import { apiBaseUrl } from '@/lib/api'
import type { MoodboardDirection, MoodboardPhoto } from '@/lib/moodboards'

export default function MoodboardDirectionBoard({ direction, photos, specimen }: {
  direction: MoodboardDirection
  photos: MoodboardPhoto[]
  specimen: { headline: string; paragraph: string }
}) {
  const colours = Object.fromEntries(direction.palette.map((colour) => [colour.role, colour.hex]))
  const variables = {
    '--board-background': colours.background,
    '--board-surface': colours.surface,
    '--board-text': colours.text,
  } as CSSProperties
  return (
    <div className="visual-moodboard" style={variables} role="group" aria-label={`${direction.title} visual moodboard`}>
      <div className="visual-board-references" data-count={photos.length}>
        {photos.map((photo) => <figure key={photo.id} className={direction.references.find((reference) => reference.photoId === photo.id)?.emphasis === 'subtle' ? 'reference-subtle-emphasis' : undefined}>
          <img src={`${apiBaseUrl}${photo.url}`} alt={photo.name ?? photo.originalName} loading="lazy" />
        </figure>)}
      </div>
      <div className="visual-board-specifications">
        <div className="visual-board-type" role="group" aria-label="Typography specimen">
          <p className="visual-board-heading" style={{ fontFamily: `"${direction.typography.heading.family}", serif`, fontWeight: direction.typography.heading.weight }}>{specimen.headline}</p>
          <p className="visual-board-body" style={{ fontFamily: `"${direction.typography.body.family}", sans-serif`, fontWeight: direction.typography.body.weight }}>{specimen.paragraph}</p>
        </div>
        <div className="visual-board-palette" role="group" aria-label="Colour palette">
          {direction.palette.map((colour) => <div className="visual-board-swatch" key={colour.role} aria-label={`${colour.name ?? colour.role}: ${colour.hex}`}>
            <div style={{ backgroundColor: colour.hex }} />
            <span>{colour.hex}</span>
          </div>)}
        </div>
      </div>
    </div>
  )
}
