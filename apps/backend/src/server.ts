import 'dotenv/config'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText, stepCountIs, tool, type UserContent } from 'ai'
import cors from 'cors'
import express from 'express'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { z } from 'zod'

type Photo = {
  id: string
  originalName: string
  filename: string
  url: string
  keywords: string[]
  createdAt: string
}

type PhotoSearchResult = Photo & {
  score: number
}

type SelectedPhoto = PhotoSearchResult & {
  selectionReason: string
}

type KeywordSuggestionInput = {
  originalName: string
  existingKeywords: string[]
  imagePath: string
  mimeType: string
}

type SearchDebug = {
  searches: Array<{
    keywords: string[]
    results: number
  }>
  candidatePhotoCount: number
  selectedPhotoCount: number
  selectionMethod: 'ai' | 'score-fallback'
  timingsMs: {
    search: number
    selection: number
    total: number
  }
}

const app = express()
const port = Number(process.env.PORT ?? 4000)
const aiApiKey = process.env.AI_API_KEY
const aiBaseUrl = process.env.AI_BASE_URL ?? 'https://opencode.ai/zen/go/v1'
const aiModel = process.env.AI_MODEL ?? 'qwen3.7-plus'
const aiProvider = aiApiKey
  ? createOpenAI({
      apiKey: aiApiKey,
      baseURL: aiBaseUrl,
    })
  : null
const dataDir = path.resolve('data')
const uploadsDir = path.resolve('uploads')
const photosFile = path.join(dataDir, 'photos.json')

const upload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => {
      callback(null, uploadsDir)
    },
    filename: (_request, file, callback) => {
      const extension = path.extname(file.originalname)
      callback(null, `${crypto.randomUUID()}${extension}`)
    },
  }),
  fileFilter: (_request, file, callback) => {
    if (!file.mimetype.startsWith('image/')) {
      callback(new Error('Only image uploads are allowed'))
      return
    }

    callback(null, true)
  },
})

app.use(cors())
app.use(express.json())
app.use('/uploads', express.static(uploadsDir))

app.get('/health', (_request, response) => {
  response.json({ ok: true })
})

app.get('/photos', async (_request, response, next) => {
  try {
    response.json(await readPhotos())
  } catch (error) {
    next(error)
  }
})

app.get('/photos/search', async (request, response, next) => {
  try {
    const query = typeof request.query.q === 'string' ? request.query.q : ''
    response.json(await searchPhotos(query))
  } catch (error) {
    next(error)
  }
})

app.post('/search', async (request, response, next) => {
  try {
    const totalStartedAt = performance.now()
    const prompt = typeof request.body.prompt === 'string' ? request.body.prompt : ''
    const searchStartedAt = performance.now()
    const agentSearch = await searchPhotosWithAgent(prompt)
    const searchDuration = performance.now() - searchStartedAt
    const selectionStartedAt = performance.now()
    const selection = await selectFinalPhotos(prompt, agentSearch.candidatePhotos)
    const selectionDuration = performance.now() - selectionStartedAt

    response.json({
      keywords: agentSearch.keywords,
      photos: selection.photos,
      selectedPhotos: selection.photos,
      candidatePhotos: agentSearch.candidatePhotos,
      debug: {
        ...agentSearch.debug,
        selectedPhotoCount: selection.photos.length,
        selectionMethod: selection.method,
        timingsMs: {
          search: Math.round(searchDuration),
          selection: Math.round(selectionDuration),
          total: Math.round(performance.now() - totalStartedAt),
        },
      },
    })
  } catch (error) {
    next(error)
  }
})

app.post('/photos', upload.single('photo'), async (request, response, next) => {
  try {
    if (!request.file) {
      response.status(400).json({ error: 'Photo file is required' })
      return
    }

    const photos = await readPhotos()
    const manualKeywords = parseKeywords(request.body.keywords)
    const suggestedKeywords = await suggestKeywords({
      originalName: request.file.originalname,
      existingKeywords: manualKeywords,
      imagePath: request.file.path,
      mimeType: request.file.mimetype,
    })
    const photo: Photo = {
      id: crypto.randomUUID(),
      originalName: request.file.originalname,
      filename: request.file.filename,
      url: `/uploads/${request.file.filename}`,
      keywords: mergeKeywords(manualKeywords, suggestedKeywords),
      createdAt: new Date().toISOString(),
    }

    photos.unshift(photo)
    await writePhotos(photos)

    response.status(201).json(photo)
  } catch (error) {
    next(error)
  }
})

app.post('/photos/:id/suggest-keywords', async (request, response, next) => {
  try {
    const photos = await readPhotos()
    const photo = photos.find((item) => item.id === request.params.id)

    if (!photo) {
      response.status(404).json({ error: 'Photo not found' })
      return
    }

    const suggestedKeywords = await suggestKeywords({
      originalName: photo.originalName,
      existingKeywords: photo.keywords,
      imagePath: path.join(uploadsDir, photo.filename),
      mimeType: getMimeType(photo.filename),
    })

    response.json({
      keywords: mergeKeywords(photo.keywords, suggestedKeywords),
      suggestedKeywords,
    })
  } catch (error) {
    next(error)
  }
})

app.patch('/photos/:id/keywords', async (request, response, next) => {
  try {
    const photos = await readPhotos()
    const photo = photos.find((item) => item.id === request.params.id)

    if (!photo) {
      response.status(404).json({ error: 'Photo not found' })
      return
    }

    photo.keywords = parseKeywords(request.body.keywords)
    await writePhotos(photos)

    response.json(photo)
  } catch (error) {
    next(error)
  }
})

async function ensureStorage() {
  await fs.mkdir(dataDir, { recursive: true })
  await fs.mkdir(uploadsDir, { recursive: true })

  try {
    await fs.access(photosFile)
  } catch {
    await fs.writeFile(photosFile, '[]\n')
  }
}

async function readPhotos(): Promise<Photo[]> {
  const content = await fs.readFile(photosFile, 'utf8')
  return JSON.parse(content) as Photo[]
}

async function writePhotos(photos: Photo[]) {
  await fs.writeFile(photosFile, `${JSON.stringify(photos, null, 2)}\n`)
}

async function searchPhotos(query: string) {
  const normalizedQuery = normalizeText(query)
  const searchTerms = parseSearchTerms(query)

  if (!normalizedQuery) {
    return []
  }

  const photos = await readPhotos()
  const matches: PhotoSearchResult[] = photos
    .map((photo) => ({
      ...photo,
      score: scorePhoto(photo.keywords, normalizedQuery, searchTerms),
    }))
    .filter((photo) => photo.score > 0)
    .sort((left, right) => right.score - left.score)

  return matches
}

async function searchPhotosWithAgent(prompt: string) {
  const fallbackKeywords = extractPromptKeywordsLocally(prompt)
  const fallbackPhotos = await searchPhotos(fallbackKeywords.join(' '))

  if (!aiProvider || !prompt.trim()) {
    return buildSearchResult(fallbackPhotos, [], fallbackKeywords)
  }

  const searches: SearchDebug['searches'] = []
  const candidatesById = new Map<string, PhotoSearchResult>()

  try {
    await generateText({
      model: aiProvider.chat(aiModel),
      system:
        'You are searching a visual reference library. Use the searchImages tool with focused keyword groups that may match the user prompt. Run no more than 2 searches. Do not answer with final images yet; just use the tool to gather candidates.',
      prompt: `User prompt: ${prompt}`,
      tools: {
        searchImages: tool({
          description: 'Search uploaded image references by keywords.',
          inputSchema: z.object({
            keywords: z.array(z.string()).min(1).max(8),
          }),
          execute: async ({ keywords: toolKeywords }) => {
            if (searches.length >= 2) {
              return []
            }

            const results = await searchPhotos(toolKeywords.join(' '))

            for (const photo of results) {
              const existing = candidatesById.get(photo.id)

              if (!existing || photo.score > existing.score) {
                candidatesById.set(photo.id, photo)
              }
            }

            searches.push({
              keywords: toolKeywords,
              results: results.length,
            })

            return results.slice(0, 8).map((photo) => ({
              id: photo.id,
              originalName: photo.originalName,
              keywords: photo.keywords,
              score: photo.score,
            }))
          },
        }),
      },
      stopWhen: [stepCountIs(3), () => searches.length >= 2],
      temperature: 0.2,
    })
  } catch (error) {
    console.warn('AI search tool flow failed before completion', error)
    return buildSearchResult(fallbackPhotos, [], fallbackKeywords)
  }

  const candidatePhotos = Array.from(candidatesById.values()).sort(
    (left, right) => right.score - left.score,
  )

  const keywords =
    searches.length > 0
      ? mergeKeywords(searches.flatMap((search) => search.keywords))
      : fallbackKeywords

  return buildSearchResult(
    candidatePhotos.length > 0 ? candidatePhotos : fallbackPhotos,
    searches,
    keywords,
  )
}

async function selectFinalPhotos(prompt: string, candidates: PhotoSearchResult[]) {
  const limitedCandidates = candidates.slice(0, 4)

  if (!aiProvider || limitedCandidates.length === 0) {
    return buildFallbackSelection(limitedCandidates)
  }

  const selectedPhotos: SelectedPhoto[] = []

  try {
    const content: UserContent = [
      {
        type: 'text',
        text: `Original user prompt: ${prompt}\nAnalyze the following candidate images and select up to 3 that best satisfy the prompt. Consider visual content, style, mood, composition, and usefulness as references.`,
      },
    ]

    for (const candidate of limitedCandidates) {
      const image = await fs.readFile(path.join(uploadsDir, candidate.filename))
      const imageUrl = `data:${getMimeType(candidate.filename)};base64,${image.toString('base64')}`

      content.push({
        type: 'text',
        text: `Candidate ID: ${candidate.id}\nFilename: ${candidate.originalName}\nKeywords: ${candidate.keywords.join(', ')}`,
      })
      content.push({
        type: 'image',
        image: new URL(imageUrl),
      })
    }

    await generateText({
      model: aiProvider.chat(aiModel),
      system:
        'You select the best visual references from provided candidate images. You must call selectImages exactly once with up to 3 valid candidate IDs and a short, user-friendly reason for each selection.',
      messages: [{ role: 'user', content }],
      tools: {
        selectImages: tool({
          description: 'Select the final images to return to the user.',
          inputSchema: z.object({
            selections: z
              .array(
                z.object({
                  id: z.string(),
                  reason: z.string().min(1).max(240),
                }),
              )
              .min(1)
              .max(3),
          }),
          execute: async ({ selections }) => {
            for (const selection of selections) {
              const photo = limitedCandidates.find((item) => item.id === selection.id)

              if (photo && !selectedPhotos.some((item) => item.id === photo.id)) {
                selectedPhotos.push({
                  ...photo,
                  selectionReason: selection.reason,
                })
              }
            }

            return {
              selectedIds: selectedPhotos.map((photo) => photo.id),
            }
          },
        }),
      },
      toolChoice: { type: 'tool', toolName: 'selectImages' },
      stopWhen: stepCountIs(1),
      timeout: 90_000,
      temperature: 0.2,
    })

    if (selectedPhotos.length === 0) {
      console.warn('AI image selection returned no valid photo IDs')
      return buildFallbackSelection(limitedCandidates)
    }

    return {
      photos: selectedPhotos,
      method: 'ai' as const,
    }
  } catch (error) {
    console.warn('AI image selection failed before completion', error)
    return buildFallbackSelection(limitedCandidates)
  }
}

function buildFallbackSelection(candidates: PhotoSearchResult[]) {
  return {
    photos: candidates.slice(0, 3).map((photo) => ({
      ...photo,
      selectionReason: 'Selected from the strongest keyword matches.',
    })),
    method: 'score-fallback' as const,
  }
}

function buildSearchResult(
  photos: PhotoSearchResult[],
  searches: SearchDebug['searches'],
  keywords: string[],
) {
  return {
    keywords,
    photos,
    candidatePhotos: photos,
    debug: {
      searches,
      candidatePhotoCount: photos.length,
      selectedPhotoCount: 0,
      selectionMethod: 'score-fallback' as const,
      timingsMs: {
        search: 0,
        selection: 0,
        total: 0,
      },
    },
  }
}

function parseKeywords(value: unknown) {
  if (typeof value !== 'string') {
    return []
  }

  return value
    .split(',')
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean)
}

function mergeKeywords(...keywordGroups: string[][]) {
  return Array.from(new Set(keywordGroups.flat().map((keyword) => keyword.trim()))).filter(
    Boolean,
  )
}

async function suggestKeywords(input: KeywordSuggestionInput) {
  if (!aiProvider) {
    return suggestKeywordsFallback(input)
  }

  try {
    const image = await fs.readFile(input.imagePath)
    const imageUrl = `data:${input.mimeType};base64,${image.toString('base64')}`
    const result = await generateText({
      model: aiProvider.chat(aiModel),
      system:
        'Analyze the image and extract concise searchable keywords for a visual reference library. Include visible subject matter, style, mood, colors, medium, layout, and use case when clear. Return only a JSON array of 8 to 15 lowercase strings. Do not include explanations.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Existing manual keywords: ${input.existingKeywords.join(', ') || 'none'}`,
            },
            {
              type: 'image',
              image: new URL(imageUrl),
            },
          ],
        },
      ],
      temperature: 0.2,
    })
    const keywords = parseAiKeywords(result.text)

    if (keywords.length === 0) {
      console.warn('AI image keyword request returned no parseable keywords')
    }

    return keywords.length > 0 ? keywords : suggestKeywordsFallback(input)
  } catch (error) {
    console.warn('AI image keyword request failed before completion', error)
    return suggestKeywordsFallback(input)
  }
}

function suggestKeywordsFallback({
  originalName,
  existingKeywords,
}: KeywordSuggestionInput) {
  const text = `${originalName} ${existingKeywords.join(' ')}`.toLowerCase()
  const suggestions = ['visual reference', 'composition', 'color palette']

  if (text.includes('portfolio') || text.includes('website') || text.includes('web')) {
    suggestions.push('web design', 'layout', 'digital design')
  }

  if (text.includes('minimal') || text.includes('clean')) {
    suggestions.push('minimal', 'clean')
  }

  if (text.includes('modern')) {
    suggestions.push('modern')
  }

  if (text.includes('photo') || text.includes('photographer')) {
    suggestions.push('photography', 'editorial')
  }

  if (text.includes('color') || text.includes('colour')) {
    suggestions.push('colorful')
  }

  return mergeKeywords(suggestions)
}

function getMimeType(filename: string) {
  const extension = path.extname(filename).toLowerCase()

  if (extension === '.png') {
    return 'image/png'
  }

  if (extension === '.webp') {
    return 'image/webp'
  }

  if (extension === '.gif') {
    return 'image/gif'
  }

  return 'image/jpeg'
}

function extractPromptKeywordsLocally(prompt: string) {
  const terms = parseSearchTerms(prompt)
  const stopWords = new Set([
    'a',
    'an',
    'and',
    'for',
    'from',
    'i',
    'in',
    'need',
    'of',
    'on',
    'the',
    'to',
    'with',
  ])

  const keywords = terms.filter((term) => !stopWords.has(term) && term.length > 2)

  return mergeKeywords(keywords)
}

function parseAiKeywords(content: string | undefined) {
  if (!content) {
    return []
  }

  const jsonContent = content
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()

  try {
    const parsed = JSON.parse(jsonContent) as unknown

    if (Array.isArray(parsed)) {
      return mergeKeywords(
        parsed.filter((keyword): keyword is string => typeof keyword === 'string'),
      )
    }

    if (
      parsed &&
      typeof parsed === 'object' &&
      'keywords' in parsed &&
      Array.isArray(parsed.keywords)
    ) {
      return mergeKeywords(
        parsed.keywords.filter(
          (keyword): keyword is string => typeof keyword === 'string',
        ),
      )
    }

    return []
  } catch {
    return parseKeywords(content)
  }
}

function parseSearchTerms(value: string) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .map((term) => term.trim())
    .filter(Boolean)
}

function normalizeText(value: string) {
  return value.toLowerCase().trim()
}

function scorePhoto(
  keywords: string[],
  normalizedQuery: string,
  searchTerms: string[],
) {
  return keywords.reduce((score, keyword) => {
    const normalizedKeyword = normalizeText(keyword)

    if (normalizedKeyword === normalizedQuery) {
      return score + 10
    }

    if (normalizedQuery.includes(normalizedKeyword)) {
      return score + 6
    }

    if (normalizedKeyword.includes(normalizedQuery)) {
      return score + 5
    }

    const matchingTerms = searchTerms.filter(
      (term) => normalizedKeyword.includes(term) || term.includes(normalizedKeyword),
    )

    return score + matchingTerms.length
  }, 0)
}

await ensureStorage()

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`)
})
