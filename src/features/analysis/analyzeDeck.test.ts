import { describe, expect, it } from 'vitest'
import type { CollectionItem, Deck } from '../../types/index.ts'
import { analyzeDeck, exportMissingList } from './analyzeDeck.ts'

function makeDeck(): Deck {
  return {
    id: 'deck-1',
    name: 'Test Deck',
    cards: [
      { passcode: '14558127', name: 'Ash Blossom', quantity: 3, section: 'MAIN', imageUrl: null },
      { passcode: '89631139', name: 'Blue-Eyes White Dragon', quantity: 3, section: 'MAIN', imageUrl: null },
      { passcode: '44508094', name: 'Accesscode Talker', quantity: 1, section: 'EXTRA', imageUrl: null },
      { passcode: '23434538', name: 'Ghost Ogre', quantity: 2, section: 'SIDE', imageUrl: null },
    ],
    createdAt: 0,
    updatedAt: 0,
  }
}

function makeCollection(partial: Partial<CollectionItem> = {}): CollectionItem {
  return {
    id: 'item-1',
    passcode: '14558127',
    name: 'Ash Blossom',
    setCode: 'RC03-JP010',
    language: 'JP',
    rarity: 'Super Rare',
    quantity: 2,
    imageUrl: null,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  }
}

describe('analyzeDeck', () => {
  it('counts owned cards regardless of edition', () => {
    const deck = makeDeck()
    const collection: CollectionItem[] = [
      makeCollection({ passcode: '14558127', quantity: 2, language: 'JP', setCode: 'RC03-JP010' }),
      makeCollection({ passcode: '14558127', quantity: 1, language: 'AE', setCode: 'PAC1-AE016' }),
    ]

    const result = analyzeDeck(deck, collection)
    const ash = result.missingCards.find((c) => c.passcode === '14558127')

    expect(result.overallOwned).toBe(3)
    expect(result.overallRequired).toBe(9)
    expect(ash).toBeUndefined()
  })

  it('reports missing quantity correctly', () => {
    const deck = makeDeck()
    const collection: CollectionItem[] = [
      makeCollection({ passcode: '89631139', quantity: 1, language: 'JP', setCode: 'LOB-JP001' }),
    ]

    const result = analyzeDeck(deck, collection)
    const blueEyes = result.missingCards.find((c) => c.passcode === '89631139')

    expect(blueEyes).toBeDefined()
    expect(blueEyes?.missingQuantity).toBe(2)
    expect(blueEyes?.ownedQuantity).toBe(1)
  })

  it('exports missing list as text and csv', () => {
    const deck = makeDeck()
    const collection: CollectionItem[] = []

    const result = analyzeDeck(deck, collection)
    const text = exportMissingList(result, 'text')
    const csv = exportMissingList(result, 'csv')

    expect(text).toContain('Ash Blossom (14558127) [MAIN] x 3')
    expect(csv).toContain('Passcode,Name,Section,Missing')
    expect(csv).toContain('14558127,Ash Blossom,MAIN,3')
  })
})
