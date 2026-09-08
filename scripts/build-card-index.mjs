/**
 * Builds the complete card index by downloading the full card database from YGOPRODECK.
 *
 * Output: public/cards-index.json
 *   {
 *     "generatedAt": <ISO timestamp>,
 *     "cards": {                          // passcode (id) -> card metadata
 *       "89631139": { "name": "Blue-Eyes White Dragon", "type": "...", "frameType": "...", "race": "...", "level": 8, "attribute": "LIGHT", "imageUrl": "..." },
 *       ...
 *     }
 *   }
 *
 * Usage: node scripts/build-card-index.mjs
 */
import { writeFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = join(__dirname, '..', 'public', 'cards-index.json')
const CARD_API_URL = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchJSON(url, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
      if (resp.ok) return await resp.json()
      if (resp.status === 404) return null
    } catch {
      // transient network error; retry below
    }
    if (attempt < retries) await sleep(2000 * attempt)
  }
  return null
}

async function build() {
  console.log('Fetching card database from YGOPRODECK API...')
  const data = await fetchJSON(CARD_API_URL)
  if (!data || !Array.isArray(data.data)) {
    console.error('Failed to fetch card database or invalid response format.')
    process.exit(1)
  }

  console.log(`Downloaded ${data.data.length} cards, building index...`)

  const cards = {}
  let skipped = 0

  for (const card of data.data) {
    // Map API fields to our compact format
    const passcode = String(card.id)
    const imageUrl = card.card_images && card.card_images[0] ? card.card_images[0].image_url : ''

    // Only include cards with essential data
    if (!card.name || !passcode) {
      skipped++
      continue
    }

    cards[passcode] = {
      name: card.name,
      type: card.type || '',
      frameType: card.frameType || '',
      race: card.race || '',
      level: card.level ?? null,
      attribute: card.attribute || '',
      imageUrl,
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    cards,
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true })
  writeFileSync(OUT_PATH, JSON.stringify(output))

  const fileSize = Math.round(statSync(OUT_PATH).size / 1024)
  console.log(`\nDone. Wrote ${OUT_PATH}`)
  console.log(`  cards: ${Object.keys(cards).length}, file size: ${fileSize}KB, skipped: ${skipped}`)
}

build().catch((err) => {
  console.error('Build failed:', err)
  process.exit(1)
})
