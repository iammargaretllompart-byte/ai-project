import type { CSSProperties } from 'react'
import { apiBaseUrl } from '@/lib/api'
import type { MoodboardDirection, MoodboardPhoto, MoodboardSet } from '@/lib/moodboards'

export function directionStyles(direction: MoodboardDirection) {
  const colours = Object.fromEntries(direction.palette.map((colour) => [colour.role, colour.hex]))
  const linear = [1, 3, 5].map((index) => parseInt(colours.primary.slice(index, index + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  const primaryText = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722 > 0.179 ? '#000000' : '#FFFFFF'
  return {
    colours,
    heading: { fontFamily: `"${direction.typography.heading.family}", serif`, fontWeight: direction.typography.heading.weight } as CSSProperties,
    body: { fontFamily: `"${direction.typography.body.family}", sans-serif`, fontWeight: direction.typography.body.weight } as CSSProperties,
    variables: { ...Object.fromEntries(Object.entries(colours).map(([role, value]) => [`--sample-${role}`, value])), '--sample-primary-text': primaryText } as CSSProperties,
  }
}

export default function MoodboardSample({ direction, format, photos }: {
  direction: MoodboardDirection
  format: NonNullable<MoodboardSet['design']>['sampleFormat']
  photos: MoodboardPhoto[]
}) {
  const styles = directionStyles(direction)
  const sample = direction.sample
  const images = photos.filter((photo) => direction.references.some((reference) => reference.photoId === photo.id))
  const image = images[0]
  const picture = image ? <img src={`${apiBaseUrl}${image.url}`} alt={image.name ?? 'Saved reference'} loading="lazy" className="sample-photo" /> : null
  const items = <div className="sample-items">{sample.items.map((item, index) => <div key={index}>
    <p className="sample-item-label">{item.label}</p><p className="sample-item-value">{item.value}</p>
  </div>)}</div>
  const title = <h4 className="sample-heading" style={styles.heading}>{sample.headline}</h4>
  const description = <p className="sample-description">{sample.description}</p>
  const action = <span className="sample-action">{sample.actionLabel}</span>

  return (
    <div className="design-sample" data-format={format} style={{ ...styles.body, ...styles.variables }} aria-label={`${direction.risk} ${format.replace(/-/g, ' ')} design sample`}>
      {format === 'landing-page' ? <>
        <div className="sample-nav"><span>{sample.eyebrow}</span><span>01 / {direction.risk}</span></div>
        <div className="sample-web-hero"><div>{title}{description}{action}</div><div className="sample-image-frame">{picture}</div></div>
        {items}
      </> : format === 'mobile-app' ? <div className="sample-phone">
        <div className="sample-phone-status"><span>9:41</span><span aria-hidden="true">● ▰</span></div>
        <p className="sample-eyebrow">{sample.eyebrow}</p>{title}{description}
        {items}<div className="sample-mobile-image">{picture}</div>{action}
        <div className="sample-phone-bar" aria-hidden="true" />
      </div> : format === 'editorial' ? <>
        <div className="sample-nav"><span>{sample.eyebrow}</span><span>Volume 01</span></div>
        <div className="sample-editorial-grid"><div>{title}{description}{action}</div><div className="sample-image-frame">{picture}</div></div>
        {items}
      </> : <>
        <p className="sample-eyebrow">{sample.eyebrow}</p>{title}{description}
        <div className="sample-brand-images">{images.map((photo) => <img key={photo.id} src={`${apiBaseUrl}${photo.url}`} alt={photo.name ?? 'Saved reference'} loading="lazy" />)}</div>
        <div className="sample-brand-footer">{items}{action}</div>
      </>}
    </div>
  )
}
