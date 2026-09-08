import { USD_TO_TWD } from './price.ts'
import type { CollectionItem } from '../types/index.ts'

export type SortOption = 'default' | 'passcode' | 'set' | 'price'

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'default', label: 'Default (Recently Added)' },
  { value: 'passcode', label: 'Passcode' },
  { value: 'set', label: 'Set (Card Pack)' },
  { value: 'price', label: 'Price' },
]

export function extractSetPrefix(setCode: string): string {
  const dashIndex = setCode.indexOf('-')
  if (dashIndex === -1) return setCode.toUpperCase()
  return setCode.slice(0, dashIndex).toUpperCase()
}

export function normalizePrice(item: Pick<CollectionItem, 'price' | 'priceCurrency'>): number {
  if (item.price == null || !Number.isFinite(item.price)) return Number.NEGATIVE_INFINITY
  const currency = item.priceCurrency ?? 'USD'
  return currency === 'TWD' ? item.price / USD_TO_TWD : item.price
}

export function sortCollection(items: CollectionItem[], sortBy: SortOption): CollectionItem[] {
  if (sortBy === 'default') {
    return [...items].sort((a, b) => b.createdAt - a.createdAt)
  }

  if (sortBy === 'passcode') {
    return [...items].sort((a, b) => {
      const numA = Number(a.passcode)
      const numB = Number(b.passcode)
      if (numA !== numB) return numA - numB
      return a.setCode.localeCompare(b.setCode)
    })
  }

  if (sortBy === 'set') {
    return [...items].sort((a, b) => {
      const setA = extractSetPrefix(a.setCode)
      const setB = extractSetPrefix(b.setCode)
      if (setA !== setB) return setA.localeCompare(setB)
      const codeA = a.setCode.toUpperCase()
      const codeB = b.setCode.toUpperCase()
      if (codeA !== codeB) return codeA.localeCompare(codeB)
      return a.rarity.localeCompare(b.rarity)
    })
  }

  if (sortBy === 'price') {
    return [...items].sort((a, b) => {
      const priceA = normalizePrice(a)
      const priceB = normalizePrice(b)
      if (priceA !== priceB) return priceB - priceA
      return a.name.localeCompare(b.name)
    })
  }

  return items
}
