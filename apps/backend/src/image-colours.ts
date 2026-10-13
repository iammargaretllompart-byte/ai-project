import sharp from 'sharp'

export async function extractColours(imagePath: string) {
  const { data } = await sharp(imagePath, { limitInputPixels: 80_000_000 })
    .rotate().resize(96, 96, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' }).toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const bins = new Map<string, { rgb: number[]; count: number }>()
  for (let index = 0; index < data.length; index += 3) {
    const rgb = [data[index], data[index + 1], data[index + 2]]
    const key = rgb.map((value) => Math.floor(value / 32)).join(',')
    const bin = bins.get(key) ?? { rgb: [0, 0, 0], count: 0 }
    rgb.forEach((value, channel) => { bin.rgb[channel] += value })
    bin.count++
    bins.set(key, bin)
  }
  const ranked = [...bins.values()].sort((a, b) => b.count - a.count)
  const selected: Array<{ rgb: number[]; hex: string; proportion: number }> = []
  for (const bin of ranked) {
    const rgb = bin.rgb.map((value) => Math.round(value / bin.count))
    if (selected.some((colour) => Math.hypot(...rgb.map((value, index) => value - colour.rgb[index])) < 40)) continue
    selected.push({ rgb, hex: `#${rgb.map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`, proportion: bin.count / (data.length / 3) })
    if (selected.length === 8) break
  }
  return selected.map(({ hex, proportion }) => ({ hex, proportion: Number(proportion.toFixed(4)) }))
}
