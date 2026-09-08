/**
 * Card-relation data for the deck builder's "related cards" feature.
 * Data source: public/card-links.json (built by scripts/build-card-links.mjs).
 */

export interface CardLinksEntry {
  archetype: string | null
  sameArchetype: string[]
  mentions: string[]
  mentionedBy: string[]
}

interface CardLinksShape {
  cards?: Record<string, CardLinksEntry>
}

let linksPromise: Promise<Record<string, CardLinksEntry> | null> | null = null

/** Lazy-loads the prebuilt card-relation graph (cached per load). */
export function loadCardLinks(): Promise<Record<string, CardLinksEntry> | null> {
  if (!linksPromise) {
    linksPromise = (async () => {
      try {
        const resp = await fetch('/card-links.json')
        if (!resp.ok) return null
        const json = (await resp.json()) as CardLinksShape
        return json.cards ?? null
      } catch {
        return null
      }
    })()
  }
  return linksPromise
}

/**
 * Returns the related-card passcodes for a card:
 *  - sameArchetype: cards in the same series (e.g. all "Blue-Eyes" cards)
 *  - mentionedBy  : cards whose effect text names this card (support/combo cards)
 *  - mentions     : cards named by this card's effect text
 * Returns null when the graph isn't available (or the card is unknown).
 */
export async function getRelatedCards(passcode: string): Promise<CardLinksEntry | null> {
  const cards = await loadCardLinks()
  if (!cards) return null
  return cards[passcode] ?? null
}