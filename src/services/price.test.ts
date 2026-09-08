import { describe, expect, it } from 'vitest'
import { buildRutenSearchUrl, formatPrice, lowestPriceWithOutlierFilter, mostFrequentPrice, rarityKeyword, rarityOverFrameKeyword, relativeBucketMode, rutenRepresentativePrice, setPriceByRarity, USD_TO_TWD } from './price.ts'

describe('rarityKeyword', () => {
  it('maps common rarity codes to Chinese keywords', () => {
    expect(rarityKeyword('UR')).toBe('金亮')
    expect(rarityKeyword('ScR')).toBe('半鑽')
    expect(rarityKeyword('PSER')).toBe('白鑽')
    expect(rarityKeyword('C')).toBe('普')
    expect(rarityKeyword('NPR')).toBe('普鑽')
    expect(rarityKeyword('Normal Parallel Rare')).toBe('普鑽')
  })

  it('maps over-frame rarities to base rarity keyword', () => {
    expect(rarityKeyword('UR-OR')).toBe('金亮')
    expect(rarityKeyword('ScR-OR')).toBe('半鑽')
    expect(rarityKeyword('PSER-OR')).toBe('白鑽')
  })

  it('detects over-frame rarity with extra 超框 keyword', () => {
    expect(rarityOverFrameKeyword('UR-OR')).toBe('超框')
    expect(rarityOverFrameKeyword('ScR-OR')).toBe('超框')
    expect(rarityOverFrameKeyword('PSER-OR')).toBe('超框')
    expect(rarityOverFrameKeyword('UR')).toBeUndefined()
  })

  it('maps full English names too', () => {
    expect(rarityKeyword('Ultra Rare')).toBe('金亮')
    expect(rarityKeyword('Quarter Century Secret Rare')).toBe('金鑽')
  })

  it('returns empty string for unknown rarity', () => {
    expect(rarityKeyword('')).toBe('')
    expect(rarityKeyword('Foo Bar')).toBe('')
  })
})

describe('lowestPriceWithOutlierFilter', () => {
  it('returns the lowest price when no outliers', () => {
    expect(lowestPriceWithOutlierFilter([10, 12, 15, 11, 9])).toBe(9)
  })

  it('filters out extremely high outliers', () => {
    expect(lowestPriceWithOutlierFilter([10, 12, 11, 99999])).toBe(10)
  })

  it('returns undefined for empty or all-zero input', () => {
    expect(lowestPriceWithOutlierFilter([])).toBeUndefined()
    expect(lowestPriceWithOutlierFilter([0, 0])).toBeUndefined()
  })

  it('returns the single value when only one price exists', () => {
    expect(lowestPriceWithOutlierFilter([42])).toBe(42)
  })
})

describe('formatPrice', () => {
  it('formats TWD with NT$ prefix', () => {
    expect(formatPrice(100, 'TWD', 'TWD')).toBe('NT$100.00')
  })

  it('formats USD with $ prefix', () => {
    expect(formatPrice(10, 'USD', 'USD')).toBe('$10.00')
  })

  it('converts USD to TWD', () => {
    expect(formatPrice(10, 'TWD', 'USD')).toBe(`NT$${(10 * USD_TO_TWD).toFixed(2)}`)
  })

  it('converts TWD to USD', () => {
    const twd = 315
    expect(formatPrice(twd, 'USD', 'TWD')).toBe(`$${(twd / USD_TO_TWD).toFixed(2)}`)
  })

  it('returns N/A for undefined value', () => {
    expect(formatPrice(undefined, 'TWD')).toBe('N/A')
  })
})

describe('buildRutenSearchUrl', () => {
  it('builds a URL with set code and rarity keyword', () => {
    expect(buildRutenSearchUrl('AGOV-JP001', 'UR')).toBe(
      'https://www.ruten.com.tw/find/?q=AGOV-JP001%20%E9%87%91%E4%BA%AE',
    )
  })

  it('builds a URL with set code only when rarity is unknown', () => {
    expect(buildRutenSearchUrl('AGOV-JP001', '')).toBe(
      'https://www.ruten.com.tw/find/?q=AGOV-JP001',
    )
  })

  it('appends extra 超框 keyword for over-frame rarities', () => {
    expect(buildRutenSearchUrl('INFO-JP017', 'PSER-OR')).toContain(
      encodeURIComponent('INFO-JP017 白鑽 超框'),
    )
  })
})

describe('setPriceByRarity', () => {
  const sets = [
    { setCode: 'CT13-EN008', rarity: 'Ultra Rare', setPrice: 74.49 },
    { setCode: 'CT14-EN002', rarity: 'Secret Rare', setPrice: 27.92 },
    { setCode: 'LOB-EN001', rarity: 'Ultra Rare', setPrice: 253.34 },
    { setCode: 'LOB-EN001', rarity: 'Common', setPrice: 0 },
  ]

  it('returns exact set code + rarity match', () => {
    expect(setPriceByRarity(sets, 'CT13-EN008', 'Ultra Rare')).toBe(74.49)
  })

  it('falls back to lowest price with same rarity when set code differs', () => {
    expect(setPriceByRarity(sets, 'LOB-EN002', 'Ultra Rare')).toBe(74.49)
  })

  it('returns undefined when no matching rarity has a price', () => {
    expect(setPriceByRarity(sets, 'LOB-EN001', 'Common')).toBeUndefined()
  })
})

describe('mostFrequentPrice', () => {
  it('returns the most frequent price', () => {
    expect(mostFrequentPrice([5, 5, 5, 7, 9])).toBe(5)
  })

  it('breaks ties toward the lower price', () => {
    expect(mostFrequentPrice([5, 5, 7, 7, 9])).toBe(5)
  })

  it('returns undefined for empty or all-zero input', () => {
    expect(mostFrequentPrice([])).toBeUndefined()
    expect(mostFrequentPrice([0, 0])).toBeUndefined()
  })

  it('returns the single value when only one price exists', () => {
    expect(mostFrequentPrice([42])).toBe(42)
  })
})

describe('relativeBucketMode', () => {
  it('returns the lowest price in the most-populated bucket', () => {
    // Most listings cluster low (5-9); a couple higher (40, 60).
    expect(relativeBucketMode([5, 6, 7, 8, 9, 40, 60])).toBe(5)
  })

  it('returns undefined for empty input', () => {
    expect(relativeBucketMode([])).toBeUndefined()
  })

  it('returns the single value when only one price exists', () => {
    expect(relativeBucketMode([10])).toBe(10)
  })
})

describe('rutenRepresentativePrice', () => {
  it('prefers the consensus price over a single outlier low price', () => {
    // One unusually cheap 5, but most sellers list around 15-25.
    const prices = [5, 15, 18, 20, 22, 25, 24, 19, 21, 23]
    const result = rutenRepresentativePrice(prices)
    expect(result).toBeDefined()
    expect(result!).toBeGreaterThan(10)
  })

  it('returns undefined for empty input', () => {
    expect(rutenRepresentativePrice([])).toBeUndefined()
  })

  it('returns the single value when only one price exists', () => {
    expect(rutenRepresentativePrice([9])).toBe(9)
  })

  it('strips high outliers before picking the mainstream price', () => {
    const prices = [5, 5, 6, 5, 7, 99999]
    expect(rutenRepresentativePrice(prices)).toBe(5)
  })
})
