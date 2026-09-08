import { describe, expect, it } from 'vitest'
import type { CollectionItem } from '../types/index.ts'
import { extractSetPrefix, sortCollection } from './sort.ts'

function makeItem(partial: Partial<CollectionItem>): CollectionItem {
  return {
    id: 'test-id',
    passcode: '00000000',
    name: 'Test Card',
    setCode: 'LOB-EN001',
    language: 'EN',
    rarity: 'UR',
    quantity: 1,
    imageUrl: null,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  }
}

describe('sortCollection', () => {
  it('sorts by passcode numerically', () => {
    const items: CollectionItem[] = [
      makeItem({ passcode: '89631139', setCode: 'LOB-EN001' }),
      makeItem({ passcode: '14558127', setCode: 'RC03-JP010' }),
      makeItem({ passcode: '44508094', setCode: 'LVAL-EN067' }),
    ]

    const sorted = sortCollection(items, 'passcode')
    expect(sorted.map((i) => i.passcode)).toEqual(['14558127', '44508094', '89631139'])
  })

  it('sorts by set prefix alphabetically', () => {
    const items: CollectionItem[] = [
      makeItem({ setCode: 'RC03-JP010', passcode: '14558127' }),
      makeItem({ setCode: 'LOB-EN001', passcode: '89631139' }),
      makeItem({ setCode: 'AGOV-JP001', passcode: '00000001' }),
    ]

    const sorted = sortCollection(items, 'set')
    expect(sorted.map((i) => i.setCode)).toEqual(['AGOV-JP001', 'LOB-EN001', 'RC03-JP010'])
  })

  it('sorts by set prefix then by set code then by rarity', () => {
    const items: CollectionItem[] = [
      makeItem({ setCode: 'LOB-EN002', rarity: 'SR', passcode: '2' }),
      makeItem({ setCode: 'LOB-EN001', rarity: 'UR', passcode: '1' }),
      makeItem({ setCode: 'LOB-EN001', rarity: 'C', passcode: '3' }),
    ]

    const sorted = sortCollection(items, 'set')
    expect(sorted.map((i) => `${i.setCode}-${i.rarity}`)).toEqual([
      'LOB-EN001-C',
      'LOB-EN001-UR',
      'LOB-EN002-SR',
    ])
  })

  it('default sort returns newest first', () => {
    const items: CollectionItem[] = [
      makeItem({ createdAt: 1000, id: '1' }),
      makeItem({ createdAt: 3000, id: '3' }),
      makeItem({ createdAt: 2000, id: '2' }),
    ]

    const sorted = sortCollection(items, 'default')
    expect(sorted.map((i) => i.id)).toEqual(['3', '2', '1'])
  })

  it('does not mutate the original array', () => {
    const items: CollectionItem[] = [
      makeItem({ passcode: '89631139' }),
      makeItem({ passcode: '14558127' }),
    ]
    const original = [...items]
    sortCollection(items, 'passcode')
    expect(items).toEqual(original)
  })

  it('sorts by price descending', () => {
    const items: CollectionItem[] = [
      makeItem({ id: '1', name: 'A', price: 100, priceCurrency: 'USD' }),
      makeItem({ id: '2', name: 'B', price: 3150, priceCurrency: 'TWD' }),
      makeItem({ id: '3', name: 'C', price: 50, priceCurrency: 'USD' }),
    ]

    const sorted = sortCollection(items, 'price')
    // 3150 TWD = 100 USD (tie with A), tie-break by name: A < B.
    expect(sorted.map((i) => i.id)).toEqual(['1', '2', '3'])
  })

  it('puts items without a price at the bottom', () => {
    const items: CollectionItem[] = [
      makeItem({ id: '1', name: 'A', price: 10, priceCurrency: 'USD' }),
      makeItem({ id: '2', name: 'B', price: undefined }),
      makeItem({ id: '3', name: 'C', price: 20, priceCurrency: 'USD' }),
    ]

    const sorted = sortCollection(items, 'price')
    expect(sorted.map((i) => i.id)).toEqual(['3', '1', '2'])
  })

  it('normalizes TWD and USD before comparing prices', () => {
    const items: CollectionItem[] = [
      makeItem({ id: '1', name: 'A', price: 300, priceCurrency: 'TWD' }),
      makeItem({ id: '2', name: 'B', price: 10, priceCurrency: 'USD' }),
    ]

    const sorted = sortCollection(items, 'price')
    // 300 TWD ≈ 9.52 USD < 10 USD, so B is higher and comes first.
    expect(sorted.map((i) => i.id)).toEqual(['2', '1'])
  })
})

describe('extractSetPrefix', () => {
  it('extracts prefix before the dash', () => {
    expect(extractSetPrefix('LOB-EN001')).toBe('LOB')
    expect(extractSetPrefix('AGOV-JP001')).toBe('AGOV')
    expect(extractSetPrefix('RC03-JP010')).toBe('RC03')
  })

  it('handles set codes without dash', () => {
    expect(extractSetPrefix('LOB')).toBe('LOB')
    expect(extractSetPrefix('lob')).toBe('LOB')
  })
})
