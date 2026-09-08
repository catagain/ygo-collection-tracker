import type { Card, CardSet, CollectionItem } from '../types/index.ts'

const API_BASE = 'https://db.ygoprodeck.com/api/v7'

/**
 * Returns the card name to display for a collection item.
 * Japanese cards show their Japanese name when one is available;
 * all other languages use the English/primary name.
 */
export function displayName(item: Pick<CollectionItem, 'name' | 'nameJa' | 'language'>): string {
  if (item.language === 'JP' && item.nameJa) {
    return item.nameJa
  }
  return item.name
}

export interface CardApiError {
  type: 'NOT_FOUND' | 'NETWORK_ERROR' | 'UNKNOWN'
  message: string
}

function isApiError(err: unknown): CardApiError {
  if (err instanceof Error) {
    return {
      type: err.message.includes('fetch') || err.message.includes('network') ? 'NETWORK_ERROR' : 'UNKNOWN',
      message: err.message,
    }
  }
  return { type: 'UNKNOWN', message: String(err) }
}

/**
 * Normalizes a passcode to its canonical 8-digit form. Yu-Gi-Oh! passcodes are
 * always 8 digits; YGOPRODECK stores them as JSON numbers, which drops leading
 * zeros (e.g. "09205573" arrives as "9205573"). Padding back to 8 digits keeps
 * the stored value correct everywhere. YGOPRODECK's id lookup ignores leading
 * zeros, so both forms query fine.
 */
function normalizePasscode(input: string): string {
  const trimmed = input.trim()
  if (/^\d+$/.test(trimmed) && trimmed.length < 8) {
    return trimmed.padStart(8, '0')
  }
  return trimmed
}

function detectLanguageFromSetCode(setCode: string): 'JP' | 'AE' | 'EN' | 'OTHER' {
  // Language code is the letter run right after the dash (2-3 letters),
  // e.g. LOB-EN001 -> "EN", BETB-JPS05 -> "JP", TT01-JPC06 -> "JPC".
  const match = setCode.match(/-([A-Z]{2,3})(?:\d|$)/i)
  if (!match) return 'OTHER'
  const lang = match[1].toUpperCase()
  if (lang.startsWith('JP') || lang === 'JA') return 'JP'
  if (lang.startsWith('AE')) return 'AE'
  if (lang.startsWith('EN') || lang.startsWith('NA') || lang.startsWith('EU')) return 'EN'
  return 'OTHER'
}

/**
 * Converts a language-prefixed set code to the English variant used by
 * YGOPRODECK. TCG cards ship in multiple languages (EN/FR/DE/IT/PT/SP) and the
 * database only indexes the English printing, so e.g. "BLMR-FR104" must be
 * queried as "BLMR-EN104". JP is converted too, BUT structure-deck results are
 * rejected in fetchCardBySetCode because OCG/TCG structure decks don't map 1:1
 * (see isStructureDeckResult).
 */
function convertLangToEn(setCode: string): string {
  return setCode.replace(/-(JP|FR|DE|IT|PT|SP|ES|SC|CT|KR|TH)[A-Z0-9]*$/i, (match, lang: string) =>
    match.replace(new RegExp(lang, 'i'), 'EN'),
  )
}

/** True when a YGOPRODECK set result is a Structure Deck (whose JP/EN numbering does not align). */
function isStructureDeckResult(setData: Record<string, unknown>): boolean {
  const name = String(setData.set_name ?? '')
  return /structure deck/i.test(name)
}

function convertEnToJp(setCode: string): string {
  return setCode.replace(/-(EN[A-Z0-9]*)$/i, (_, suffix: string) => `-JP${suffix.slice(2)}`)
}

interface SetsIndexEntry {
  name?: string
  passcode?: string
  setName?: string
  rarity?: string
}

/**
 * Lazy-loaded card-set index (public/sets-index.json) mapping set codes to
 * passcodes. Built by scripts/build-sets-index.mjs from YGOPRODECK pack pages,
 * so any code that has a pack page resolves without a network round-trip.
 */
let setsIndexPromise: Promise<Record<string, SetsIndexEntry> | null> | null = null

async function loadSetsIndex(): Promise<Record<string, SetsIndexEntry> | null> {
  // Skip the (3MB) index fetch in unit tests; existing tests mock the
  // cardsetsinfo/cardinfo flow directly.
  if (import.meta.env.MODE === 'test') return null
  if (!setsIndexPromise) {
    setsIndexPromise = (async () => {
      try {
        const resp = await fetch('/sets-index.json')
        if (!resp.ok) return null
        const json = (await resp.json()) as { sets?: Record<string, SetsIndexEntry> }
        return json.sets ?? null
      } catch {
        return null
      }
    })()
  }
  return setsIndexPromise
}

/**
 * Maps the pack-page rarity label (e.g. "C print New", "Duel Terminal Super
 * Parallel Rare", "Common") to a stable rarity code we use in the UI.
 * Modifier words (print New/Reprint/qty/Release/debut/columns/artwork etc.)
 * are stripped first; then the base rarity is matched.
 */
export function rarityLabelToCode(label: string | undefined): string | null {
  if (!label) return null
  let l = label.trim().toLowerCase()
  // Strip packaging/print qualifiers that carry no rarity meaning.
  l = l
    .replace(/\b(print|reprint|new|qty\s*\d*|release|debut|oceanian|european|columns|artwork|special|limited)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // Labels that are purely promotional/regional (nothing left after stripping)
  // are treated as Common — these cards have no special rarity.
  if (!l) return 'C'
  const rules: [RegExp, string][] = [
    [/^10000 secret/, '20thSER'],
    [/^20(th)?\s*(secret|scr)/, '20thSER'],
    [/^gold secret/, 'GR'],
    [/^ultra secret/, 'UR'],
    [/^millennium gold/, 'GR'],
    [/^millennium\b/, 'ScR'],
    [/^extra secret/, 'ScR'],
    [/^platinum secret/, 'ScR'],
    [/^quarter century secret/, 'QCSR'],
    [/^prismatic secret/, 'PSER'],
    [/^grand master/, 'StR'],
    [/^shatterfoil/, 'C'],
    [/^starfoil/, 'C'],
    [/^super short print/, 'C'],
    [/^short print/, 'C'],
    [/^duel terminal .*parallel/, 'NPR'],
    [/^duel terminal /, 'R'],
    [/^kaiba corporation (ultra|u)/, 'UR'],
    [/^kaiba corporation (rare|r)/, 'R'],
    [/^kaiba corporation (common|c)/, 'C'],
    [/^kc\+(ur|ultra)/, 'UR'],
    [/^kc\+(r|rare)/, 'R'],
    [/^kc\+(c|common)/, 'C'],
    [/^p\+(sr|super)/, 'SR'],
    [/^p\+(ur|ultra)/, 'UR'],
    [/^p\+(se|secret)/, 'ScR'],
    [/^p\+(hr|holographic)/, 'HR'],
    [/^p\+(exse|extra secret)/, 'ScR'],
    [/^m\+(se|secret)/, 'ScR'],
    [/^m\+(sr|super)/, 'SR'],
    [/^m\+(ur|ultra)/, 'UR'],
    [/^m\+(gr|gold)/, 'GR'],
    [/^starlight/, 'StR'],
    [/^holographic/, 'HR'],
    [/^ultimate/, 'UtR'],
    [/^collector/, 'CR'],
    [/^premium gold/, 'PGR'],
    [/^gold rare/, 'GR'],
    [/^secret (parallel )?rare|^secret\b/, 'ScR'],
    [/^super (parallel )?rare/, 'SR'],
    [/^ultra (parallel )?rare/, 'UR'],
    [/^normal parallel|^npr|^dnrpr/, 'NPR'],
    [/^normal rare|^nr$/, 'NR'],
    [/^rare$/, 'R'],
    [/^common|^normal$|^c$/, 'C'],
    [/^n$/, 'C'],
    [/^escr$/, 'ScR'],
    [/^exse$/, 'ScR'],
    [/^scpr$/, 'ScR'], // Secret Parallel Rare
    [/^scr$/, 'ScR'],
    [/^sr$/, 'SR'],
    [/^ur$/, 'UR'],
    [/^ul$/, 'UtR'],
    [/^utr$/, 'UtR'],
    [/^hr$/, 'HR'],
    [/^cr$/, 'CR'],
    [/^gr$/, 'GR'],
    [/^plr$/, 'PGR'],
    [/^gse$/, 'GR'],
    [/^pse$/, 'PSER'],
    [/^qcse$/, 'QCSR'],
    [/^qcsr$/, 'QCSR'],
    // Fallbacks for promo/regional labels that carry no rarity meaning:
    // these cards are typically Common. "MR" is Millennium Rare (closest ScR).
    [/^mr\b/, 'ScR'],
    [/^super short$/, 'C'],
    [/^short$/, 'C'],
    [/^(july|august|september|october|november|december|january|february|march|april|may|june)\b/, 'C'],
    [/^force smw$/, 'C'],
    [/^(new|debut|release|\d+)$/, 'C'],
  ]
  for (const [re, code] of rules) {
    if (re.test(l)) return code
  }
  return null
}

/**
 * Looks up a set code in the prebuilt index. Returns the passcode when the
 * code is known, otherwise null.
 */
/**
 * Loads the admin-approved additions (stored in Vercel KV) that are merged
 * into the index lookup. Cached briefly (TTL) so searches stay fast, but the
 * cache must not live forever: an admin who just approved a submission should
 * see it reflected in the next search without a full page reload.
 */
let approvedSetsPromise: Promise<Record<string, { passcode?: string; name?: string; rarity?: string; language?: string }> | null> | null = null
let approvedSetsFetchedAt = 0
const APPROVED_SETS_TTL_MS = 30_000

/** Clears the in-memory approved-sets cache (e.g. after an admin approves/deletes). */
export function invalidateApprovedSets(): void {
  approvedSetsPromise = null
  approvedSetsFetchedAt = 0
}

async function loadApprovedSets(): Promise<Record<string, { passcode?: string; name?: string; rarity?: string; language?: string }> | null> {
  if (import.meta.env.MODE === 'test') return null
  const now = Date.now()
  if (!approvedSetsPromise || now - approvedSetsFetchedAt > APPROVED_SETS_TTL_MS) {
    approvedSetsFetchedAt = now
    approvedSetsPromise = (async () => {
      try {
        const resp = await fetch('/api/sets/approved', { credentials: 'same-origin' })
        if (!resp.ok) return null
        const json = (await resp.json()) as {
          sets?: Record<string, { passcode?: string; name?: string; rarity?: string; language?: string }>
        }
        return json.sets ?? null
      } catch {
        return null
      }
    })()
  }
  return approvedSetsPromise
}

export async function lookupSetCodeInIndex(setCode: string): Promise<{ passcode: string; rarity?: string } | null> {
  const clean = setCode.trim().toUpperCase()
  const sets = await loadSetsIndex()
  if (!sets) return null
  const entry = sets[clean]
  if (entry?.passcode && /^\d{5,10}$/.test(entry.passcode)) {
    const rarityCode = rarityLabelToCode(entry.rarity)
    return { passcode: normalizePasscode(entry.passcode), rarity: rarityCode ?? entry.rarity }
  }
  // Also try the EN variant for language-specific codes (e.g. index has
  // SD33-EN038 but the query is SD33-JP038 or BLMR-EN104 for BLMR-FR104).
  if (/-(JP|FR|DE|IT|PT|SP|ES|SC|CT|KR|TH)[A-Z0-9]*$/i.test(clean)) {
    const enVariant = convertLangToEn(clean)
    const enEntry = sets[enVariant]
    if (enEntry?.passcode && /^\d{5,10}$/.test(enEntry.passcode)) {
      const rarityCode = rarityLabelToCode(enEntry.rarity)
      return { passcode: normalizePasscode(enEntry.passcode), rarity: rarityCode ?? enEntry.rarity }
    }
  }
  // Fall back to admin-approved additions.
  const approved = await loadApprovedSets()
  const approvedEntry = approved?.[clean]
  if (approvedEntry?.passcode && /^\d{5,10}$/.test(approvedEntry.passcode)) {
    return {
      passcode: normalizePasscode(approvedEntry.passcode),
      rarity: approvedEntry.rarity
        ? (rarityLabelToCode(approvedEntry.rarity) ?? approvedEntry.rarity)
        : undefined,
    }
  }
  return null
}

/**
 * Returns true when the given set code is present in the prebuilt index
 * (regardless of whether it resolves to a passcode). Used to decide whether
 * to offer "submit new mapping" for codes the app doesn't know yet.
 */
export async function isSetCodeInIndex(setCode: string): Promise<boolean> {
  const clean = setCode.trim().toUpperCase()
  const sets = await loadSetsIndex()
  if (!sets) return false
  if (sets[clean]) return true
  if (/-(JP|FR|DE|IT|PT|SP|ES|SC|CT|KR|TH)[A-Z0-9]*$/i.test(clean)) {
    if (sets[convertLangToEn(clean)]) return true
  }
  const approved = await loadApprovedSets()
  return Boolean(approved?.[clean])
}

function mapSet(cardSet: Record<string, unknown>): CardSet {
  return {
    setCode: String(cardSet.set_code ?? ''),
    setName: String(cardSet.set_name ?? ''),
    rarity: String(cardSet.set_rarity ?? ''),
    rarityCode: cardSet.set_rarity_code ? String(cardSet.set_rarity_code) : null,
  }
}

function mapCard(raw: Record<string, unknown>): Card {
  const cardImages = Array.isArray(raw.card_images) ? raw.card_images as Record<string, unknown>[] : []
  const imageUrl = cardImages[0]?.image_url
  const imageUrlSmall = cardImages[0]?.image_url_small

  const cardPrices = Array.isArray(raw.card_prices) ? raw.card_prices[0] as Record<string, unknown> | undefined : undefined
  const prices = cardPrices ? {
    tcgplayer_price: cardPrices.tcgplayer_price ? Number(cardPrices.tcgplayer_price) : undefined,
    cardmarket_price: cardPrices.cardmarket_price ? Number(cardPrices.cardmarket_price) : undefined,
    ebay_price: cardPrices.ebay_price ? Number(cardPrices.ebay_price) : undefined,
    amazon_price: cardPrices.amazon_price ? Number(cardPrices.amazon_price) : undefined,
    coolstuffinc_price: cardPrices.coolstuffinc_price ? Number(cardPrices.coolstuffinc_price) : undefined,
  } : undefined

  return {
    passcode: normalizePasscode(String(raw.id ?? raw.passcode ?? '')),
    name: String(raw.name ?? ''),
    type: String(raw.type ?? ''),
    frameType: String(raw.frameType ?? ''),
    imageUrl: imageUrl ? String(imageUrl) : null,
    imageUrlSmall: imageUrlSmall ? String(imageUrlSmall) : null,
    sets: Array.isArray(raw.card_sets) ? raw.card_sets.map(mapSet) : [],
    prices,
  }
}

export async function fetchCardByPasscode(passcode: string): Promise<Card | null> {
  const clean = normalizePasscode(passcode)
  if (!/^\d{5,10}$/.test(clean)) {
    return null
  }

  // Check persistent IndexedDB cache first.
  const { getCachedCard, setCachedCard } = await import('./storage.ts')
  const cached = await getCachedCard(clean)
  if (cached !== undefined) {
    return cached
  }

  const url = new URL(`${API_BASE}/cardinfo.php`)
  url.searchParams.set('id', clean)

  const response = await fetch(url.toString())
  if (!response.ok) {
    if (response.status === 400 || response.status === 404) {
      await setCachedCard(clean, null)
      return null
    }
    throw new Error(`API error: ${response.status}`)
  }

  const json = (await response.json()) as { data?: Record<string, unknown>[] }
  const raw = json.data?.[0]
  if (!raw) {
    await setCachedCard(clean, null)
    return null
  }

  const card = mapCard(raw)
  await setCachedCard(clean, card)
  return card
}

export async function fetchCardBySetCode(setCode: string): Promise<{ card: Card | null; matchedSet?: CardSet; language: 'JP' | 'AE' | 'EN' | 'OTHER'; originalSetCode?: string }> {
  const clean = setCode.trim().toUpperCase()
  const language = detectLanguageFromSetCode(clean)
  const originalSetCode = clean

  let querySetCode = clean
  // Convert language-specific codes (JP/FR/DE/IT/PT/SP...) to the EN variant
  // YGOPRODECK indexes, so e.g. BLMR-FR104 resolves to BLMR-EN104.
  if (language !== 'EN') {
    querySetCode = convertLangToEn(clean)
  }

  // Check persistent IndexedDB cache first.
  const { getCachedCardBySetCode, setCachedCardBySetCode } = await import('./storage.ts')
  const cachedCard = await getCachedCardBySetCode(clean)
  if (cachedCard) {
    const cachedMatch = cachedCard.sets.find((s) => s.setCode.toUpperCase() === querySetCode)
    // A stale cache entry may hold an EN Structure Deck result for a JP code
    // (OCG/TCG structure decks don't map 1:1). Reject it the same way the
    // cardsetsinfo path does so the caller falls back to the OCG database.
    if (language === 'JP' && cachedMatch && /structure deck/i.test(cachedMatch.setName)) {
      // fall through to a fresh lookup below
    } else {
      return {
        card: cachedCard,
        matchedSet: cachedMatch,
        language,
        originalSetCode,
      }
    }
  }

  // Prebuilt index lookup: resolves codes that live in a YGOPRODECK pack page
  // (including JP-only packs like SD33-JP038) without a cardsetsinfo round-trip.
  const indexed = await lookupSetCodeInIndex(clean)
  if (indexed) {
    const indexedCard = await fetchCardByPasscode(indexed.passcode)
    if (indexedCard) {
      await setCachedCardBySetCode(clean, indexedCard)
      const matchedSet = indexedCard.sets.find((s) => s.setCode.toUpperCase() === querySetCode) ?? {
        setCode: clean,
        setName: '',
        rarity: 'Unknown',
        rarityCode: null,
      }
      // The pack-page rarity is authoritative for JP cards (TCG cardinfo data
      // can be wrong, e.g. AGOV-JP008 is Common but cardinfo says Super Rare).
      const rarity = indexed.rarity ?? matchedSet.rarity
      const displaySetCode = language === 'JP' ? convertEnToJp(matchedSet.setCode) : matchedSet.setCode
      return {
        card: indexedCard,
        matchedSet: { ...matchedSet, setCode: displaySetCode, rarity },
        language,
        originalSetCode,
      }
    }
  }

  const setUrl = new URL(`${API_BASE}/cardsetsinfo.php`)
  setUrl.searchParams.set('setcode', querySetCode)

  const setResponse = await fetch(setUrl.toString())
  if (!setResponse.ok) {
    if (setResponse.status === 400 || setResponse.status === 404) {
      await setCachedCardBySetCode(clean, null)
      return { card: null, language, originalSetCode }
    }
    throw new Error(`API error: ${setResponse.status}`)
  }

  const setData = (await setResponse.json()) as Record<string, unknown>

  // OCG and TCG structure decks do not map 1:1 by card number (e.g.
  // SR13-JP023 vs SR13-EN023 are different cards). When the user searched a
  // JP code that resolved to an EN Structure Deck result, reject it so the
  // caller falls back to the OCG database for the correct Japanese card.
  if (language === 'JP' && isStructureDeckResult(setData)) {
    await setCachedCardBySetCode(clean, null)
    return { card: null, language, originalSetCode }
  }

  const passcode = normalizePasscode(String(setData.id ?? ''))
  if (!/^\d{5,10}$/.test(passcode)) {
    await setCachedCardBySetCode(clean, null)
    return { card: null, language, originalSetCode }
  }

  const card = await fetchCardByPasscode(passcode)
  if (!card) {
    await setCachedCardBySetCode(clean, null)
    return { card: null, language, originalSetCode }
  }

  await setCachedCardBySetCode(clean, card)

  const matchedSet = card.sets.find((s) => s.setCode.toUpperCase() === querySetCode) ?? {
    setCode: String(setData.set_code ?? querySetCode),
    setName: String(setData.set_name ?? ''),
    rarity: String(setData.set_rarity ?? 'Unknown'),
    rarityCode: null,
  }

  const displaySetCode = language === 'JP' ? convertEnToJp(matchedSet.setCode) : matchedSet.setCode

  const setPriceRaw = setData.set_price
  const setPrice = setPriceRaw != null && setPriceRaw !== '' ? Number(setPriceRaw) : undefined
  const hasValidSetPrice = setPrice != null && Number.isFinite(setPrice) && setPrice > 0
  if (hasValidSetPrice) {
    const rarityMatches = matchedSet.rarity && String(setData.set_rarity ?? '').toLowerCase() === matchedSet.rarity.toLowerCase()
    if (rarityMatches || !card.prices?.tcgplayer_price) {
      card.prices = {
        ...card.prices,
        tcgplayer_price: setPrice,
      }
    }
  }

  return { card, matchedSet: { ...matchedSet, setCode: displaySetCode }, language, originalSetCode }
}

export async function fetchCardByName(name: string): Promise<Card | null> {
  const clean = name.trim()
  if (!clean) return null

  const url = new URL(`${API_BASE}/cardinfo.php`)
  url.searchParams.set('name', clean)

  const response = await fetch(url.toString())
  if (!response.ok) {
    if (response.status === 400 || response.status === 404) return null
    throw new Error(`API error: ${response.status}`)
  }

  const json = (await response.json()) as { data?: Record<string, unknown>[] }
  const raw = json.data?.[0]
  if (!raw) return null

  return mapCard(raw)
}

export async function resolveCard(input: { passcode?: string; setCode?: string; name?: string }): Promise<{ card: Card | null; matchedSet?: CardSet; language: 'JP' | 'AE' | 'EN' | 'OTHER' }> {
  if (input.passcode) {
    const card = await fetchCardByPasscode(input.passcode)
    return { card, language: 'OTHER' as const }
  }
  if (input.setCode) {
    return fetchCardBySetCode(input.setCode)
  }
  if (input.name) {
    const card = await fetchCardByName(input.name)
    return { card, language: 'OTHER' as const }
  }
  return { card: null, language: 'OTHER' as const }
}

export function validateSetCode(setCode: string): boolean {
  if (!setCode) return false
  // Two supported shapes:
  // 1. Prefix-LANGsuffix   (e.g. LOB-EN001, BETB-JPS05, 20AP-JP077, TT01-JPC06)
  // 2. Prefix-Number       (e.g. JCY-001 — no language code)
  // The prefix may start with a digit (e.g. "20AP") but must contain at
  // least one letter (a purely numeric prefix like "123" is not a set code).
  // The language code is 2-3 letters starting with a known language prefix
  // (JP/EN/AE/NA/EU plus TCG regional codes FR/DE/IT/PT/SP/ES/SC/CT/KR/TH),
  // e.g. "JPC", "EN", "FR104" — followed by at least 2 chars.
  const pattern = /^(?=[A-Z0-9]*[A-Z])[A-Z0-9]+-(?:(?:JP|EN|AE|NA|EU|FR|DE|IT|PT|SP|ES|SC|CT|KR|TH)[A-Z0-9]{2,3}|\d{2,4})$/i
  return pattern.test(setCode.trim())
}

/**
 * Formats a user-typed set code:
 * 1. Uppercases the input.
 * 2. Converts spaces to dashes, so typing "UT01 JP011" becomes "UT01-JP011".
 * It does NOT auto-insert a dash, because prefixes can contain digits
 * (e.g. "UT01") and guessing where the dash belongs would corrupt valid codes.
 */
export function autoFormatSetCode(value: string): string {
  return value.toUpperCase().replace(/ +/g, '-')
}

export function handleApiError(err: unknown): CardApiError {
  return isApiError(err)
}

export async function fetchPriceForItem(item: { passcode: string; setCode: string; priceSource?: string }): Promise<number | undefined> {
  const source = (item.priceSource ?? 'tcgplayer') as keyof NonNullable<import('../types/index.ts').Card['prices']>
  if (validateSetCode(item.setCode)) {
    try {
      const result = await fetchCardBySetCode(item.setCode)
      if (result.card?.prices) {
        const price = result.card.prices[source] ?? result.card.prices.tcgplayer_price
        if (price != null && Number.isFinite(price)) return price
      }
    } catch {
      // fall through to passcode
    }
  }
  try {
    const card = await fetchCardByPasscode(item.passcode)
    const price = card?.prices?.[source] ?? card?.prices?.tcgplayer_price
    if (price != null && Number.isFinite(price)) return price
  } catch {
    return undefined
  }
  return undefined
}

export function setPriceByRarity(cardSets: { setCode: string; rarity: string; setPrice?: number }[], setCode: string, rarity: string): number | undefined {
  const normalizedSetCode = setCode.trim().toUpperCase()
  const normalizedRarity = rarity.trim().toLowerCase()

  const exactMatch = cardSets.find(
    (s) => s.setCode.toUpperCase() === normalizedSetCode && s.rarity.toLowerCase() === normalizedRarity && (s.setPrice ?? 0) > 0,
  )
  if (exactMatch?.setPrice != null && exactMatch.setPrice > 0) return exactMatch.setPrice

  const rarityOnlyMatch = cardSets
    .filter((s) => s.rarity.toLowerCase() === normalizedRarity && (s.setPrice ?? 0) > 0)
    .sort((a, b) => (a.setPrice ?? 0) - (b.setPrice ?? 0))[0]
  if (rarityOnlyMatch?.setPrice != null && rarityOnlyMatch.setPrice > 0) return rarityOnlyMatch.setPrice

  return undefined
}

const cache = new Map<string, Card | null>()

export async function getCachedCard(passcode: string): Promise<Card | null | undefined> {
  return cache.get(passcode)
}

export async function setCachedCard(passcode: string, card: Card | null): Promise<void> {
  cache.set(passcode, card)
}

export interface FallbackCardResult {
  name: string
  nameJa?: string
  passcode?: string
  setCode: string
  cardText?: string
  packName?: string
  imageUrl?: string
  /** Official JP (OCG) artwork URL — preferred for JP-language cards. */
  imageUrlJa?: string | null
  rarityKeys?: string[]
}

/**
 * Refreshes a collection item's card info by re-searching its set code.
 * Uses YGOPRODECK first, then falls back to the OCG database for JP-only cards.
 */
/**
 * Refreshes a collection item's card info by re-searching its set code.
 * When the set code resolves to a passcode (via index, approved sets, or the
 * caller's stored passcode), the card image is also recovered so the stored
 * item always gets its artwork after a re-search.
 */
export async function refreshCardInfo(setCode: string, knownPasscode?: string): Promise<FallbackCardResult | null> {
  const result = await fetchCardBySetCode(setCode)
  if (result.card) {
    const base: FallbackCardResult = {
      name: result.card.name,
      passcode: result.card.passcode,
      setCode,
      imageUrl: result.card.imageUrl ?? undefined,
    }
    // JP cards: YGOPRODECK data is from the TCG pack (English name).
    // Capture the Japanese name + official OCG artwork for display.
    if (result.language === 'JP') {
      const ocg = await fetchOcgEnrichment(setCode)
      if (ocg?.nameJa) base.nameJa = ocg.nameJa
      if (ocg?.imageUrlJa) base.imageUrlJa = ocg.imageUrlJa
    }
    return base
  }
  const fallback = await fetchCardBySetCodeWithFallback(setCode)
  // Prefer a passcode from the fallback resolution, then fall back to the one
  // already stored on the collection item (the user may have submitted it).
  const passcode = fallback?.passcode || (knownPasscode && /^\d{5,10}$/.test(knownPasscode) ? knownPasscode : '')
  if (passcode) {
    const ygo = await fetchCardByPasscode(passcode)
    if (ygo) {
      return {
        name: ygo.name,
        nameJa: fallback?.name,
        passcode,
        setCode,
        imageUrl: ygo.imageUrl ?? undefined,
        imageUrlJa: fallback?.imageUrlJa,
        rarityKeys: fallback?.rarityKeys,
      }
    }
  }
  if (!fallback) return null
  // The fallback name is Japanese; expose it as nameJa.
  return { ...fallback, nameJa: fallback.name }
}

/**
 * Resolves a JP set code that YGOPRODECK does not know by:
 * 1. Looking up db.yugioh-card-cn.com (official OCG DB) for the Japanese card name.
 * 2. Looking up the YGOPRODECK pack page to recover the card's passcode.
 */
export async function fetchCardBySetCodeWithFallback(setCode: string): Promise<FallbackCardResult | null> {
  const { fetchYugiohCnCard, fetchYugopackPasscode, jpCardImageUrl, matchExactSetName } = await import('./yugiohCn.ts')

  const cnCard = await fetchYugiohCnCard(setCode)
  if (!cnCard?.cardName) return null

  // Official JP artwork (available whenever the OCG DB knows the card).
  const imageUrlJa = jpCardImageUrl(cnCard)

  // Try to recover the passcode from the YGOPRODECK pack page.
  let passcode: string | undefined
  if (cnCard.packName) {
    // Prefer the authoritative YGOPRODECK set name (B plan): match the raw
    // OCG pack name against the preloaded set list and search verbatim.
    const exactSetName = await matchExactSetName(cnCard.packName)
    const packCard = await fetchYugopackPasscode(exactSetName ?? cnCard.packName, setCode, Boolean(exactSetName))
    if (packCard?.passcode) {
      passcode = normalizePasscode(packCard.passcode)
    }
  }

  // If a passcode is known, fetch the YGOPRODECK card image as a fallback for
  // non-JP displays.
  let imageUrl: string | undefined
  if (passcode) {
    const ygoCard = await fetchCardByPasscode(passcode)
    imageUrl = ygoCard?.imageUrl ?? undefined
  }

  return {
    name: cnCard.cardName,
    passcode,
    setCode,
    cardText: cnCard.cardText,
    packName: cnCard.packName,
    imageUrl,
    imageUrlJa,
    rarityKeys: cnCard.rarityKeys,
  }
}

/**
 * Fetches OCG enrichment data (rarity keys + Japanese name) for a set code
 * from db.yugioh-card-cn.com. Used for JP cards whose YGOPRODECK (TCG) data
 * uses a different rarity distribution and a different (English) name.
 */
export async function fetchOcgEnrichment(setCode: string): Promise<{ rarityKeys?: string[]; nameJa?: string; imageUrlJa?: string | null } | null> {
  const { fetchYugiohCnCard, jpCardImageUrl } = await import('./yugiohCn.ts')
  const cnCard = await fetchYugiohCnCard(setCode)
  if (!cnCard) return null
  return {
    rarityKeys: cnCard.rarityKeys?.length ? cnCard.rarityKeys : undefined,
    nameJa: cnCard.cardName || undefined,
    imageUrlJa: jpCardImageUrl(cnCard),
  }
}

/**
 * Preloads card data for a list of collection items into the local cache.
 * Runs in the background; resolves without throwing so it never blocks UI.
 */
export async function preloadCollectionCards(items: { passcode?: string; setCode?: string }[]): Promise<void> {
  const { getCachedCard } = await import('./storage.ts')
  for (const item of items) {
    try {
      if (item.passcode && /^\d{5,10}$/.test(item.passcode)) {
        const cached = await getCachedCard(item.passcode)
        if (cached === undefined) {
          await fetchCardByPasscode(item.passcode)
        }
      } else if (item.setCode) {
        await fetchCardBySetCode(item.setCode)
      }
    } catch {
      // Background preload must never throw; skip failed entries.
    }
  }
}
