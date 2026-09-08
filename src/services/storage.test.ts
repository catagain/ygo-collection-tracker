import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  addCollectionItem,
  addDeck,
  clearAllData,
  deleteCollectionItem,
  deleteDeck,
  getAllCollectionItems,
  getAllDecks,
  getCachedCard,
  getSettings,
  importAllData,
  saveSettings,
  setCachedCard,
  updateCollectionItem,
  updateDeck,
} from './storage.ts'

describe('storage', () => {
  beforeEach(async () => {
    await clearAllData()
  })

  it('adds and retrieves collection items', async () => {
    await addCollectionItem({
      passcode: '14558127',
      name: 'Ash Blossom',
      setCode: 'RC03-JP010',
      language: 'JP',
      rarity: 'Super Rare',
      quantity: 3,
      imageUrl: null,
    })

    const items = await getAllCollectionItems()
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('Ash Blossom')
    expect(items[0].quantity).toBe(3)
  })

  it('repairs stored passcodes that lost leading zeros on read', async () => {
    // Simulate legacy data: a passcode stored without its leading zero.
    await addCollectionItem({
      passcode: '9205573', // real passcode is 09205573
      name: 'Evil★Twin Ki-sikil',
      setCode: 'TT01-JPB27',
      language: 'JP',
      rarity: 'Common',
      quantity: 1,
      imageUrl: null,
    })

    const items = await getAllCollectionItems()
    expect(items[0].passcode).toBe('09205573')
  })

  it('merges identical cards instead of creating a duplicate', async () => {
    const first = await addCollectionItem({
      passcode: '14558127',
      name: 'Ash Blossom',
      setCode: 'RC03-JP010',
      language: 'JP',
      rarity: 'Super Rare',
      quantity: 1,
      imageUrl: null,
    })
    const merged = await addCollectionItem({
      passcode: '14558127',
      name: 'Ash Blossom',
      setCode: 'RC03-JP010',
      language: 'JP',
      rarity: 'Super Rare',
      quantity: 2,
      imageUrl: null,
    })

    const items = await getAllCollectionItems()
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe(merged.id)
    expect(items[0].quantity).toBe(3)
    expect(merged.createdAt).toBeGreaterThanOrEqual(first.createdAt)
  })

  it('does not merge cards that differ in setCode, language, or rarity', async () => {
    await addCollectionItem({
      passcode: '14558127',
      name: 'Ash Blossom',
      setCode: 'RC03-JP010',
      language: 'JP',
      rarity: 'Super Rare',
      quantity: 1,
      imageUrl: null,
    })
    await addCollectionItem({
      passcode: '14558127',
      name: 'Ash Blossom',
      setCode: 'PAC1-AE016',
      language: 'AE',
      rarity: 'Super Rare',
      quantity: 1,
      imageUrl: null,
    })
    await addCollectionItem({
      passcode: '14558127',
      name: 'Ash Blossom',
      setCode: 'RC03-JP010',
      language: 'JP',
      rarity: 'Secret Rare',
      quantity: 1,
      imageUrl: null,
    })

    const items = await getAllCollectionItems()
    expect(items).toHaveLength(3)
  })

  it('merges pre-existing duplicates when listing the collection', async () => {
    await importAllData({
      collection: [
        {
          id: 'dup-1',
          passcode: '89631139',
          name: 'Blue-Eyes White Dragon',
          setCode: 'LOB-EN001',
          language: 'EN',
          rarity: 'Ultra Rare',
          quantity: 1,
          imageUrl: null,
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'dup-2',
          passcode: '89631139',
          name: 'Blue-Eyes White Dragon',
          setCode: 'LOB-EN001',
          language: 'EN',
          rarity: 'Ultra Rare',
          quantity: 2,
          imageUrl: null,
          createdAt: 2000,
          updatedAt: 2000,
        },
      ],
      decks: [],
    })

    const items = await getAllCollectionItems()
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe(3)
  })

  it('updates collection item quantity', async () => {
    const item = await addCollectionItem({
      passcode: '14558127',
      name: 'Ash Blossom',
      setCode: 'RC03-JP010',
      language: 'JP',
      rarity: 'Super Rare',
      quantity: 1,
      imageUrl: null,
    })

    await updateCollectionItem(item.id, { quantity: 5 })
    const items = await getAllCollectionItems()
    expect(items[0].quantity).toBe(5)
  })

  it('deletes collection items', async () => {
    const item = await addCollectionItem({
      passcode: '14558127',
      name: 'Ash Blossom',
      setCode: 'RC03-JP010',
      language: 'JP',
      rarity: 'Super Rare',
      quantity: 1,
      imageUrl: null,
    })

    await deleteCollectionItem(item.id)
    const items = await getAllCollectionItems()
    expect(items).toHaveLength(0)
  })

  it('creates and deletes decks', async () => {
    await addDeck('Test Deck')
    let decks = await getAllDecks()
    expect(decks).toHaveLength(1)

    await deleteDeck(decks[0].id)
    decks = await getAllDecks()
    expect(decks).toHaveLength(0)
  })

  it('updates deck cards', async () => {
    const deck = await addDeck('Test Deck')
    await updateDeck(deck.id, {
      cards: [{ passcode: '14558127', name: 'Ash Blossom', quantity: 3, section: 'MAIN', imageUrl: null }],
    })

    const decks = await getAllDecks()
    expect(decks[0].cards).toHaveLength(1)
    expect(decks[0].cards[0].passcode).toBe('14558127')
  })

  it('imports and exports data', async () => {
    const item = await addCollectionItem({
      passcode: '14558127',
      name: 'Ash Blossom',
      setCode: 'RC03-JP010',
      language: 'JP',
      rarity: 'Super Rare',
      quantity: 1,
      imageUrl: null,
    })
    const deck = await addDeck('Test Deck')

    const data = { collection: [item], decks: [deck] }
    await importAllData(data)

    const items = await getAllCollectionItems()
    const decks = await getAllDecks()
    expect(items).toHaveLength(1)
    expect(decks).toHaveLength(1)
  })

  it('caches card data', async () => {
    const card = {
      passcode: '14558127',
      name: 'Ash Blossom',
      type: 'Effect Monster',
      frameType: 'effect',
      imageUrl: 'https://example.com/image.png',
      imageUrlSmall: null,
      sets: [],
    }

    await setCachedCard('14558127', card)
    const cached = await getCachedCard('14558127')
    expect(cached?.name).toBe('Ash Blossom')
  })

  it('returns default price priority when settings are not saved yet', async () => {
    const settings = await getSettings()
    expect(settings.currency).toBe('TWD')
    expect(settings.pricePriority).toBe('ruten')
  })

  it('saves and reloads price priority setting', async () => {
    await saveSettings({ currency: 'USD', pricePriority: 'ygo' })
    const settings = await getSettings()
    expect(settings.currency).toBe('USD')
    expect(settings.pricePriority).toBe('ygo')
  })
})
