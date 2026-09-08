/**
 * Builds the card-relation graph used by the deck builder's "related cards"
 * feature.
 *
 * Downloads the full YGOPRODECK card database and computes, for every card:
 *   - archetype    : the card's series (e.g. "Blue-Eyes", "HERO")
 *   - sameArchetype: other cards sharing the same archetype
 *   - mentions     : cards whose names appear in this card's effect text
 *   - mentionedBy  : cards whose effect text names this card
 *
 * Output: public/card-links.json
 *   {
 *     "generatedAt": "<ISO timestamp>",
 *     "cards": {
 *       "<passcode>": {
 *         "archetype": "Blue-Eyes" | null,
 *         "sameArchetype": [passcode, ...] | [],
 *         "mentions":      [passcode, ...] | [],
 *         "mentionedBy":   [passcode, ...] | []
 *       }
 *     }
 *   }
 *
 * Usage: node scripts/build-card-links.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = join(__dirname, '..', 'public', 'card-links.json')
const CARD_API_URL = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'

async function fetchJSON(url, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
      if (resp.ok) return await resp.json()
    } catch {
      // transient network error; retry below
    }
    await new Promise((r) => setTimeout(r, 2000 * attempt))
  }
  return null
}

/** Trie node: children by char, terminal = passcode when a full name ends here. */
function buildNameTrie(names) {
  const root = { children: new Map(), terminal: null }
  for (const [name, passcode] of names) {
    let node = root
    for (const ch of name.toLowerCase()) {
      if (!node.children.has(ch)) node.children.set(ch, { children: new Map(), terminal: null })
      node = node.children.get(ch)
    }
    node.terminal = passcode
  }
  return root
}

/** Returns the set of passcodes whose full name appears in `text`. */
function scanText(text, trie) {
  const found = new Set()
  const chars = text.toLowerCase().split('')
  for (let i = 0; i < chars.length; i++) {
    let node = trie
    let j = i
    while (j < chars.length && node.children.has(chars[j])) {
      node = node.children.get(chars[j])
      j++
      if (node.terminal) found.add(node.terminal)
    }
  }
  return found
}

async function build() {
  console.log('Fetching full card database...')
  const data = await fetchJSON(CARD_API_URL)
  if (!data?.data) {
    console.error('Failed to fetch card database.')
    process.exit(1)
  }
  const all = data.data
  console.log(`Loaded ${all.length} cards.`)

  const byPasscode = new Map()
  const names = [] // [name, passcode]
  for (const c of all) {
    byPasscode.set(String(c.id), {
      name: c.name ?? '',
      archetype: c.archetype ?? null,
      desc: c.desc ?? '',
    })
    if (c.name) names.push([c.name, String(c.id)])
  }

  // Group by archetype (for "same series").
  const archetypeGroups = new Map()
  for (const [passcode, info] of byPasscode) {
    if (info.archetype) {
      const list = archetypeGroups.get(info.archetype) ?? []
      list.push(passcode)
      archetypeGroups.set(info.archetype, list)
    }
  }

  // Longest names first so the trie prefers full card names over prefixes.
  names.sort((a, b) => b[0].length - a[0].length)
  const trie = buildNameTrie(names)

  const cards = {}
  for (const [passcode, info] of byPasscode) {
    const mentions = [...scanText(info.desc, trie)].filter((p) => p !== passcode)
    cards[passcode] = {
      archetype: info.archetype ?? null,
      sameArchetype: [],
      mentions,
      mentionedBy: [],
    }
  }

  // Fill sameArchetype + mentionedBy.
  for (const [, list] of archetypeGroups) {
    for (const passcode of list) {
      cards[passcode].sameArchetype = list.filter((p) => p !== passcode)
    }
  }
  for (const [passcode, info] of Object.entries(cards)) {
    for (const mentioned of info.mentions) {
      if (cards[mentioned]) cards[mentioned].mentionedBy.push(passcode)
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    stats: {
      cards: Object.keys(cards).length,
      archetypes: archetypeGroups.size,
      cardsWithMentions: Object.values(cards).filter((c) => c.mentions.length > 0).length,
      cardsMentioned: Object.values(cards).filter((c) => c.mentionedBy.length > 0).length,
    },
    cards,
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true })
  writeFileSync(OUT_PATH, JSON.stringify(output))
  const sizeMB = Buffer.byteLength(JSON.stringify(output)) / 1024 / 1024
  console.log(`\nDone. Wrote ${OUT_PATH}`)
  console.log(
    `  cards: ${output.stats.cards}, archetypes: ${output.stats.archetypes}, ` +
      `cards-with-mentions: ${output.stats.cardsWithMentions}, cards-mentioned: ${output.stats.cardsMentioned}`,
  )
  console.log('  file size:', sizeMB.toFixed(2), 'MB')
}

build().catch((err) => {
  console.error('Build failed:', err)
  process.exit(1)
})