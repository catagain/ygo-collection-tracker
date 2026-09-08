import type { CardLanguage, CollectionItem, Deck, DeckCard, DeckSection } from '../../types/index.ts'

export interface AnalyzedCard extends DeckCard {
  ownedQuantity: number
  missingQuantity: number
  ownedVersions: { setCode: string; language: CardLanguage; rarity: string; quantity: number }[]
}

export interface SectionAnalysis {
  section: DeckSection
  label: string
  totalRequired: number
  totalOwned: number
  cards: AnalyzedCard[]
}

export interface DeckAnalysis {
  deckId: string
  deckName: string
  sections: SectionAnalysis[]
  overallOwned: number
  overallRequired: number
  missingCards: AnalyzedCard[]
}

const SECTION_ORDER: DeckSection[] = ['MAIN', 'EXTRA', 'SIDE']
const SECTION_LABELS: Record<DeckSection, string> = {
  MAIN: 'Main Deck',
  EXTRA: 'Extra Deck',
  SIDE: 'Side Deck',
}

export function analyzeDeck(deck: Deck, collection: CollectionItem[]): DeckAnalysis {
  const ownership = new Map<string, number>()
  const versions = new Map<string, CollectionItem[]>()

  for (const item of collection) {
    const current = ownership.get(item.passcode) ?? 0
    ownership.set(item.passcode, current + item.quantity)

    const list = versions.get(item.passcode) ?? []
    list.push(item)
    versions.set(item.passcode, list)
  }

  const sectionAnalyses: SectionAnalysis[] = []
  let overallOwned = 0
  let overallRequired = 0
  const allAnalyzed: AnalyzedCard[] = []

  for (const section of SECTION_ORDER) {
    const cards = deck.cards.filter((c) => c.section === section)
    const analyzedCards: AnalyzedCard[] = []
    let sectionOwned = 0
    let sectionRequired = 0

    for (const card of cards) {
      const ownedTotal = ownership.get(card.passcode) ?? 0
      const ownedVersionsList = versions.get(card.passcode) ?? []
      const ownedForCard = Math.min(ownedTotal, card.quantity)
      const missing = Math.max(0, card.quantity - ownedTotal)

      sectionOwned += ownedForCard
      sectionRequired += card.quantity
      overallOwned += ownedForCard
      overallRequired += card.quantity

      const analyzed: AnalyzedCard = {
        ...card,
        ownedQuantity: ownedForCard,
        missingQuantity: missing,
        ownedVersions: ownedVersionsList.map((v) => ({
          setCode: v.setCode,
          language: v.language,
          rarity: v.rarity,
          quantity: v.quantity,
        })),
      }
      analyzedCards.push(analyzed)
      allAnalyzed.push(analyzed)
    }

    sectionAnalyses.push({
      section,
      label: SECTION_LABELS[section],
      totalRequired: sectionRequired,
      totalOwned: sectionOwned,
      cards: analyzedCards,
    })
  }

  const missingCards = allAnalyzed.filter((c) => c.missingQuantity > 0)

  return {
    deckId: deck.id,
    deckName: deck.name,
    sections: sectionAnalyses,
    overallOwned,
    overallRequired,
    missingCards,
  }
}

export function exportMissingList(analysis: DeckAnalysis, format: 'text' | 'csv'): string {
  if (format === 'csv') {
    const rows = analysis.missingCards.map((c) => `${c.passcode},${c.name},${c.section},${c.missingQuantity}`)
    return ['Passcode,Name,Section,Missing', ...rows].join('\n')
  }

  const lines = analysis.missingCards.map((c) => `${c.name} (${c.passcode}) [${c.section}] x ${c.missingQuantity}`)
  return lines.join('\n')
}
