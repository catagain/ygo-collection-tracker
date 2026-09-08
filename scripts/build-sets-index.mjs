/**
 * Builds the complete card-set index by downloading every OCG and TCG card
 * pack from YGOPRODECK and parsing each pack page for its card set codes.
 *
 * Output: public/sets-index.json
 *   {
 *     "generatedAt": <ISO timestamp>,
 *     "sets": {                       // set code -> card
 *       "SD33-JP038": { "name": "Reckless Greed", "passcode": "37576645", "setName": "Structure Deck: Powercode Link" },
 *       ...
 *     },
 *     "packSets": {                   // pack name -> list of set codes
 *       "Structure Deck: Powercode Link": ["SD33-JP001", ...],
 *       ...
 *     }
 *   }
 *
 * Usage: node scripts/build-sets-index.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = join(__dirname, '..', 'public', 'sets-index.json')
const CARD_DB_URL = 'https://ygoprodeck.com/card-database/'
const PACK_SEARCH_URL = (name, region) =>
  `https://ygoprodeck.com/pack/?search=${encodeURIComponent(name)}&region=${region}`

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchText(url, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } })
      if (resp.ok) return await resp.text()
      if (resp.status === 404) return ''
    } catch {
      // transient network error; retry below
    }
    await sleep(1500 * attempt)
  }
  return ''
}

function parseSetList(html, selectId) {
  const selectMatch = html.match(new RegExp(`<select[^>]*id="${selectId}"[^>]*>[\\s\\S]*?<\\/select>`, 'i'))
  if (!selectMatch) return []
  return Array.from(selectMatch[0].matchAll(/<option>([^<]*)<\/option>/gi), (m) => m[1].trim()).filter(Boolean)
}

function parsePackPage(html) {
  const cards = []
  // Split the page by rarity group headings. Each group is:
  // <h2 class="card-grid-header">...<span class="card-grid-header-content">RARITY • N Cards</span>...</h2>
  // followed by <div id="..."><figure>...</figure>...</div>
  const sectionRegex = /<h2[^>]*class="card-grid-header"[^>]*>[\s\S]*?<\/h2>([\s\S]*?)(?=<h2[^>]*class="card-grid-header"|$)/gi
  let match
  while ((match = sectionRegex.exec(html)) !== null) {
    const header = match[0]
    const body = match[1]
    const rarityMatch = header.match(/card-grid-header-content">([^<]+)</)
    const rarity = rarityMatch ? rarityMatch[1].replace(/\s*•.*$/, '').trim() : ''
    const figureRegex = /<figure[^>]*>[\s\S]*?<\/figure>/gi
    const figures = body.match(figureRegex) ?? []
    for (const figure of figures) {
      const codeMatch = figure.match(/class="fig-code">([A-Z0-9]+-[A-Z0-9]{2,6})\s*-\s*\$[^<]*</i)
      const dataNameMatch = figure.match(/data-name="(\d{5,10})"/)
      const nameMatch = figure.match(/class="fig-name">([^<]+)</)
      if (codeMatch && dataNameMatch) {
        cards.push({
          setCode: codeMatch[1].toUpperCase(),
          passcode: dataNameMatch[1],
          name: nameMatch ? nameMatch[1].trim() : '',
          rarity,
        })
      }
    }
  }
  // Fallback: if no group headings were parsed (unusual structure), parse figures directly.
  if (cards.length === 0) {
    const figureRegex = /<figure[^>]*>[\s\S]*?<\/figure>/gi
    const figures = html.match(figureRegex) ?? []
    for (const figure of figures) {
      const codeMatch = figure.match(/class="fig-code">([A-Z0-9]+-[A-Z0-9]{2,6})\s*-\s*\$[^<]*</i)
      const dataNameMatch = figure.match(/data-name="(\d{5,10})"/)
      const nameMatch = figure.match(/class="fig-name">([^<]+)</)
      if (codeMatch && dataNameMatch) {
        cards.push({
          setCode: codeMatch[1].toUpperCase(),
          passcode: dataNameMatch[1],
          name: nameMatch ? nameMatch[1].trim() : '',
          rarity: '',
        })
      }
    }
  }
  return cards
}

async function build() {
  console.log('Fetching card database page for OCG + TCG set lists...')
  const dbHtml = await fetchText(CARD_DB_URL)
  if (!dbHtml) {
    console.error('Failed to fetch card database page.')
    process.exit(1)
  }

  const ocgSets = parseSetList(dbHtml, 'filter-ocgset')
  const tcgSets = parseSetList(dbHtml, 'filter-tcgset')
  console.log(`OCG sets: ${ocgSets.length}, TCG sets: ${tcgSets.length}`)

  // Deduplicate pack names that exist in both regions (prefer OCG).
  const allPacks = [...ocgSets, ...tcgSets.filter((name) => !ocgSets.includes(name))]
  console.log(`Total packs to process: ${allPacks.length}`)

  const sets = {} // setCode -> { name, passcode, setName }
  const packSets = {} // packName -> [setCodes]
  let processed = 0
  let skipped = 0
  let empty = 0

  // Process packs concurrently (bounded) to keep the download fast while
  // staying polite to YGOPRODECK.
  const CONCURRENCY = 8

  async function processPack(packName) {
    const region = ocgSets.includes(packName) ? 'OCG' : 'TCG'
    const html = await fetchText(PACK_SEARCH_URL(packName, region))

    if (!html || html.includes('not-found') || !html.includes('fig-code')) {
      // Some packs have no dedicated pack page (e.g. events/promos). Skip.
      return { skipped: true, cards: [] }
    }

    const cards = parsePackPage(html)
    return { skipped: cards.length === 0, cards }
  }

  const queue = [...allPacks]
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const packName = queue.shift()
      const { skipped: wasSkipped, cards } = await processPack(packName)
      processed++
      if (wasSkipped) {
        empty++
        skipped++
      } else if (cards.length > 0) {
        packSets[packName] = cards.map((c) => c.setCode)
        for (const card of cards) {
          if (!sets[card.setCode]) {
            sets[card.setCode] = {
              name: card.name,
              passcode: card.passcode,
              setName: packName,
              rarity: card.rarity || undefined,
            }
          }
        }
      }
      if (processed % 100 === 0) {
        console.log(`  progress: ${processed}/${allPacks.length} (cards so far: ${Object.keys(sets).length})`)
      }
      await sleep(150)
    }
  })

  await Promise.all(workers)

  const output = {
    generatedAt: new Date().toISOString(),
    stats: {
      packs: Object.keys(packSets).length,
      cards: Object.keys(sets).length,
      skippedEmptyPacks: empty,
    },
    sets,
    packSets,
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true })
  writeFileSync(OUT_PATH, JSON.stringify(output))
  console.log(`\nDone. Wrote ${OUT_PATH}`)
  console.log(`  packs: ${output.stats.packs}, cards: ${output.stats.cards}, skipped: ${output.stats.skippedEmptyPacks}`)
}

build().catch((err) => {
  console.error('Build failed:', err)
  process.exit(1)
})