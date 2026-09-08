import type { DeckCard, DeckSection } from '../../../types/index.ts'

type ParseResult = {
  cards: DeckCard[]
  unknownLines: string[]
}

function parseQuantityLine(line: string): { quantity: number; value: string } | null {
  const match = line.match(/^(\d+)\s+(.+)$/)
  if (match) {
    return { quantity: Number(match[1]), value: match[2].trim() }
  }
  return null
}

export function parseYdk(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  const quantities = new Map<string, number>()
  const sectionMap = new Map<string, DeckSection>()
  const unknownLines: string[] = []
  let currentSection: DeckSection = 'MAIN'

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#') || line.startsWith('!')) {
      if (line.toLowerCase() === '#main') currentSection = 'MAIN'
      else if (line.toLowerCase() === '#extra') currentSection = 'EXTRA'
      else if (line.toLowerCase() === '!side') currentSection = 'SIDE'
      continue
    }

    const quantityLine = parseQuantityLine(line)
    if (quantityLine) {
      const value = quantityLine.value
      if (/^\d{5,10}$/.test(value)) {
        addEntry(value, quantityLine.quantity)
        continue
      } else {
        unknownLines.push(line)
        continue
      }
    }

    if (/^\d{5,10}$/.test(line)) {
      addEntry(line, 1)
      continue
    }

    unknownLines.push(line)
  }

  function addEntry(passcode: string, quantity: number) {
    const existing = quantities.get(passcode) ?? 0
    quantities.set(passcode, existing + quantity)
    if (!sectionMap.has(passcode)) {
      sectionMap.set(passcode, currentSection)
    }
  }

  const cards: DeckCard[] = []
  for (const [passcode, quantity] of quantities) {
    cards.push({
      passcode,
      name: passcode,
      quantity,
      section: sectionMap.get(passcode) ?? 'MAIN',
      imageUrl: null,
    })
  }

  return { cards, unknownLines }
}
