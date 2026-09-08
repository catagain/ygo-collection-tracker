/**
 * Lightweight card catalog for the deck builder's card pool.
 *
 * Data sources (both prebuilt, served from /public):
 *  - cards-index.json : { cards: { passcode: { name, type, frameType, race, level, attribute, imageUrl } } }
 *                       (~14.5k cards, built by scripts/build-card-index.mjs)
 *  - sets-index.json  : { sets: { setCode: { name, passcode, setName, rarity } } }
 *                       (used as a fallback for passcodes missing from the card index)
 */

export interface CatalogCard {
  passcode: string
  name: string
  type: string
  frameType: string
  race: string
  level: number | null
  attribute: string
  imageUrl: string | null
  /** Small thumbnail URL (images/cards_small/...) derived from imageUrl. */
  imageUrlSmall: string | null
}

/** Derives the small thumbnail URL from a full card image URL. */
export function smallImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null
  return imageUrl.replace('/images/cards/', '/images/cards_small/')
}

interface CardIndexShape {
  cards?: Record<string, CatalogCard>
}

interface SetsIndexShape {
  sets?: Record<string, { name?: string; passcode?: string; rarity?: string }>
}

let cardsIndexPromise: Promise<Record<string, CatalogCard> | null> | null = null

/** Lazy-loads the prebuilt card index (cached per load). */
export function loadCardIndex(): Promise<Record<string, CatalogCard> | null> {
  if (!cardsIndexPromise) {
    cardsIndexPromise = (async () => {
      try {
        const resp = await fetch('/cards-index.json')
        if (!resp.ok) return null
        const json = (await resp.json()) as CardIndexShape
        return json.cards ?? null
      } catch {
        return null
      }
    })()
  }
  return cardsIndexPromise
}

let setsIndexPromise: Promise<Record<string, { name?: string; passcode?: string }> | null> | null = null

/** Lazy-loads the prebuilt set index (cached per load). */
export function loadSetsIndexCatalog(): Promise<Record<string, { name?: string; passcode?: string }> | null> {
  if (!setsIndexPromise) {
    setsIndexPromise = (async () => {
      try {
        const resp = await fetch('/sets-index.json')
        if (!resp.ok) return null
        const json = (await resp.json()) as SetsIndexShape
        return json.sets ?? null
      } catch {
        return null
      }
    })()
  }
  return setsIndexPromise
}

/**
 * Builds a deduplicated catalog of every card the app knows about, keyed by
 * passcode. Card-index data wins; set-index entries fill in the gaps (used
 * only for cards the YGOPRODECK database doesn't list).
 */
export async function buildCardCatalog(): Promise<Map<string, CatalogCard>> {
  const [cardIndex, setsIndex] = await Promise.all([loadCardIndex(), loadSetsIndexCatalog()])
  const catalog = new Map<string, CatalogCard>()

  if (cardIndex) {
    for (const [passcode, card] of Object.entries(cardIndex)) {
      const imageUrl = card.imageUrl ?? null
      catalog.set(passcode, {
        passcode,
        name: card.name ?? '',
        type: card.type ?? '',
        frameType: card.frameType ?? '',
        race: card.race ?? '',
        level: typeof card.level === 'number' ? card.level : null,
        attribute: card.attribute ?? '',
        imageUrl,
        imageUrlSmall: smallImageUrl(imageUrl),
      })
    }
  }

  // Fallback: passcodes that only appear in the set index (no card-index entry).
  if (setsIndex) {
    for (const entry of Object.values(setsIndex)) {
      const passcode = entry?.passcode
      if (!passcode || catalog.has(passcode)) continue
      catalog.set(passcode, {
        passcode,
        name: entry.name ?? '',
        type: '',
        frameType: '',
        race: '',
        level: null,
        attribute: '',
        imageUrl: null,
        imageUrlSmall: null,
      })
    }
  }

  return catalog
}

/**
 * True when a card belongs in the Extra Deck: Fusion/Synchro/Xyz/Link monsters,
 * plus Pendulum monsters that aren't plain Normal/Non-Effect (they go to Extra).
 */
export function isExtraDeckCard(card: Pick<CatalogCard, 'type' | 'frameType'>): boolean {
  const type = card.type ?? ''
  const frameType = card.frameType ?? ''
  if (/(Fusion|Synchro|Xyz|Link)/i.test(type)) return true
  // Pendulum monsters: non-normal pendulums live in the Extra Deck.
  if (/Pendulum/i.test(type) && !/Normal/i.test(frameType)) return true
  return false
}