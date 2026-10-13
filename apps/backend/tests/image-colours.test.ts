import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import sharp from 'sharp'
import { extractColours } from '../src/image-colours.js'

test('colour extraction reads actual pixels, preserves bright and dark colours, and flattens transparency', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'moodboard-colours-'))
  try {
    for (const [name, colour, expected] of [['red', '#FF0000', '#FF0000'], ['black', '#000000', '#000000'], ['transparent', '#00000000', '#FFFFFF']]) {
      const file = path.join(root, `${name}.png`)
      await sharp({ create: { width: 32, height: 32, channels: 4, background: colour } }).png().toFile(file)
      assert.deepEqual(await extractColours(file), [{ hex: expected, proportion: 1 }])
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
