import { useState, type CSSProperties } from 'react'
import { apiBaseUrl } from '@/lib/api'
import type { MoodboardDirection, MoodboardPhoto } from '@/lib/moodboards'

type Box = { x: number; y: number; width: number; height: number }
const box = (x: number, y: number, width: number, height: number): Box => ({ x, y: y / 1.6, width, height: height / 1.6 })
const layouts = [
  { photos: [box(2, 5, 32, 57), box(36, 25, 30, 70), box(69, 30, 29, 62)], display: box(2, 64, 32, 26), body: box(69, 5, 29, 23) },
  { photos: [box(2, 4, 33, 56), box(37, 7, 30, 64), box(70, 41, 28, 54)], display: box(2, 63, 33, 26), body: box(70, 13, 28, 24) },
  { photos: [box(2, 36, 31, 59), box(36, 7, 31, 82), box(70, 41, 28, 54)], display: box(2, 7, 31, 26), body: box(70, 12, 28, 25) },
]
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
function fit(slot: Box, ratio: number): Box {
  const width = Math.min(slot.width, slot.height * ratio)
  const height = width / ratio
  return { x: slot.x + (slot.width - width) / 2, y: slot.y + (slot.height - height) / 2, width, height }
}

export default function MoodboardDirectionBoard({ direction, photos }: {
  direction: MoodboardDirection
  photos: MoodboardPhoto[]
}) {
  const [ratios, setRatios] = useState<Record<string, number>>({})
  const preferred = ['Grounded', 'Exploratory', 'Bold'].indexOf(direction.risk)
  // Image proportions choose the best-fitting arrangement; risk is only a tie-breaker.
  const layout = layouts.map((candidate, index) => ({ candidate, score: photos.slice(0, 3).reduce((score, photo, photoIndex) => {
    const slot = candidate.photos[photoIndex]
    const fitted = fit(slot, ratios[photo.id] ?? 1)
    return score + fitted.width * fitted.height
  }, 0) * (index === preferred ? 1.04 : 1) })).sort((a, b) => b.score - a.score)[0].candidate
  const extraRows = Math.ceil(Math.max(0, photos.length - 3) / 3)
  const height = 62.5 + extraRows * 31
  const bounds = photos.map((photo, index) => {
    const slot = index < 3 ? layout.photos[index] : { x: 2 + ((index - 3) % 3) * 33, y: 65 + Math.floor((index - 3) / 3) * 31, width: 30, height: 27 }
    const fitted = fit(slot, ratios[photo.id] ?? 1)
    if (direction.references.find(reference => reference.photoId === photo.id)?.emphasis !== 'subtle') return fitted
    return { x: fitted.x - fitted.width * .0075, y: fitted.y - fitted.height * .0075, width: fitted.width * 1.015, height: fitted.height * 1.015 }
  })
  const style = (rect: Box): CSSProperties => ({ left: `${rect.x}%`, top: `${rect.y / height * 100}%`, width: `${rect.width}%`, height: `${rect.height / height * 100}%` })
  const obstacles = [layout.display, layout.body]
  const anchors = [[.96, .04], [.04, .96], [1, .48], [.96, .96], [.5, 0], [0, .5], [.5, 1], [.04, .04]]
  const placements = [[0, 0], [0, 1], [1, 2], [1, 1], [2, 3]]
  const swatches = direction.palette.map((colour, index) => {
    const [photoIndex, preferredAnchor] = placements[index % placements.length]
    const photo = bounds[photoIndex % bounds.length]
    if (!photo) return null
    const candidates = anchors.map(([x, y], anchorIndex) => {
      const cx = Math.max(3.5, Math.min(96.5, photo.x + photo.width * x))
      const cy = Math.max(3.5, Math.min(height - 3.5, photo.y + photo.height * y))
      const rect = { x: cx - 3.5, y: cy - 3.5, width: 7, height: 7 }
      return { rect, score: obstacles.reduce((score, obstacle) => score + overlap(rect, obstacle), 0) + (anchorIndex === preferredAnchor ? 0 : .01) }
    })
    const chosen = candidates.sort((a, b) => a.score - b.score)[0].rect
    obstacles.push(chosen)
    return <span key={colour.role} className="moodboard-colour-circle" role="img" aria-label={`${colour.role}: ${colour.hex}`} style={{ ...style(chosen), backgroundColor: colour.hex }} />
  })
  return <div className="moodboard-card glass-surface frosted-surface">
    <div className="visual-moodboard" style={{ aspectRatio: `100 / ${height}` }} role="group" aria-label={`${direction.title} visual moodboard`}>
      {photos.map((photo, index) => <figure key={photo.id} style={style(bounds[index])}>
        <img src={`${apiBaseUrl}${photo.url}`} alt={photo.name ?? photo.originalName} loading="lazy" onLoad={(event) => {
          const image = event.currentTarget
          if (image.naturalWidth && image.naturalHeight) {
            const ratio = image.naturalWidth / image.naturalHeight
            setRatios(current => current[photo.id] === ratio ? current : { ...current, [photo.id]: ratio })
          }
        }} />
      </figure>)}
      {(['heading', 'body'] as const).map(kind => {
        const font = direction.typography[kind]
        return <div key={kind} className="moodboard-type-specimen" style={style(kind === 'heading' ? layout.display : layout.body)}>
          <p className="moodboard-type-label">{kind === 'heading' ? 'Display font' : 'Body font'}</p>
          <p className="moodboard-type-sample" style={{ fontFamily: `"${font.family}", ${kind === 'heading' ? 'serif' : 'sans-serif'}`, fontWeight: font.weight }}>AaBbCc</p>
          <p className="moodboard-type-weight">Weight {font.weight}</p>
        </div>
      })}
      {swatches}
    </div>
  </div>
}
