export interface YugiohCnCard {
  cardId?: string
  cardName?: string
  cardText?: string
  attributeName?: string
  speciesName?: string
  otherItemNameList?: string[]
  atk?: number
  def?: number | null
  starchip?: number | null
  linkMarkerCount?: number | null
  packName?: string
  cardNo?: string
  rarity?: string
  rarityKey?: string
  rarityKeys?: string[]
  /** Token used to build the official JP card artwork URL. */
  imageKey?: string
}

/**
 * Builds the official OCG (Japanese) card artwork URL from the db.yugioh-card-cn
 * detail response. This image shows the card as printed in Japan.
 */
export function jpCardImageUrl(card: Pick<YugiohCnCard, 'cardId' | 'imageKey'>): string | null {
  if (!card.cardId || !card.imageKey) return null
  return (
    'https://www.db.yugioh-card.com/yugiohdb/get_image.action' +
    `?type=1&ciid=1&cid=${encodeURIComponent(card.cardId)}&enc=${encodeURIComponent(card.imageKey)}&lang=ja`
  )
}

export async function fetchYugiohCnCard(setCode: string): Promise<YugiohCnCard | null> {
  const apiBase = import.meta.env.VITE_API_BASE ?? ''
  const url = `${apiBase}/api/yugiohcn?setcode=${encodeURIComponent(setCode)}`

  let response: Response
  try {
    response = await fetch(url)
  } catch {
    return null
  }
  if (!response.ok) return null

  const json = (await response.json()) as { card?: YugiohCnCard | null }
  return json.card ?? null
}

export interface YugopackCard {
  setCode: string
  name: string
  passcode: string | null
}

export async function fetchYugopackPasscode(packName: string, setCode: string, exact = false): Promise<YugopackCard | null> {
  const apiBase = import.meta.env.VITE_API_BASE ?? ''
  const exactParam = exact ? '&exact=1' : ''
  const url = `${apiBase}/api/yugopack?pack=${encodeURIComponent(packName)}&setcode=${encodeURIComponent(setCode)}${exactParam}`

  let response: Response
  try {
    response = await fetch(url)
  } catch {
    return null
  }
  if (!response.ok) return null

  const json = (await response.json()) as { card?: YugopackCard | null }
  return json.card ?? null
}

/**
 * Fetches the authoritative OCG card set name list from YGOPRODECK's card
 * database page (via the /api/ygosets proxy). Results are cached in
 * IndexedDB so the page is only fetched once per browser.
 */
export async function fetchOcgSetList(): Promise<string[]> {
  const { getOcgSetList, setOcgSetList } = await import('./storage.ts')

  const cached = await getOcgSetList()
  if (cached && cached.length > 0) return cached

  const apiBase = import.meta.env.VITE_API_BASE ?? ''
  try {
    const response = await fetch(`${apiBase}/api/ygosets`)
    if (!response.ok) return cached ?? []
    const json = (await response.json()) as { sets?: string[] }
    const sets = json.sets ?? []
    if (sets.length > 0) {
      await setOcgSetList(sets)
    }
    return sets
  } catch {
    return cached ?? []
  }
}

/**
 * Matches a raw pack name from the OCG database (e.g. all-caps with
 * full-width symbols: "QUARTER CENTURY CHRONICLE side：UNITY") against the
 * authoritative YGOPRODECK set list, returning the exact name to use in
 * /pack/?search= (e.g. "Quarter Century Chronicle side:Unity").
 *
 * Matching normalizes both sides: strips special symbols, maps full-width
 * punctuation to half-width, lowercases, collapses whitespace. Returns null
 * when no set in the list matches.
 */
export async function matchExactSetName(rawPackName: string): Promise<string | null> {
  if (!rawPackName) return null
  const sets = await fetchOcgSetList()
  if (sets.length === 0) return null

  const normalize = (s: string): string =>
    s
      .replace(/：/g, ':')
      .replace(/[^\p{L}\p{N}\s\-:]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()

  const target = normalize(rawPackName)
  if (!target) return null
  const exact = sets.find((s) => normalize(s) === target)
  if (exact) return exact

  // Fall back to a prefix match (e.g. "RARITY COLLECTION" -> "Rarity Collection 5").
  const prefixMatch = sets.find((s) => normalize(s).startsWith(target))
  return prefixMatch ?? null
}