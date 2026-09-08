import type { RarityCode } from '../types/index.ts'

export const RARITY_KEYWORDS: Partial<Record<RarityCode, string>> = {
  C: '普',
  NR: '隱普',
  NPR: '普鑽',
  R: '銀字',
  SR: '亮面',
  UR: '金亮',
  ScR: '半鑽',
  UtR: '浮雕',
  HR: '雷射',
  CR: '雕鑽',
  StR: '星光鑽',
  '20thSER': '紅鑽',
  PSER: '白鑽',
  QCSR: '金鑽',
  GR: '黃金',
  PGR: '尊爵黃金',
  'UR-OR': '金亮',
  'ScR-OR': '半鑽',
  'PSER-OR': '白鑽',
}

export function rarityKeyword(rarity: string): string {
  const code = normalizeRarityCode(rarity)
  if (!code) return ''
  return RARITY_KEYWORDS[code] ?? ''
}

export function rarityOverFrameKeyword(rarity: string): string | undefined {
  const code = normalizeRarityCode(rarity)
  if (!code) return undefined
  if (code === 'UR-OR' || code === 'ScR-OR' || code === 'PSER-OR') {
    return '超框'
  }
  return undefined
}

function normalizeRarityCode(rarity: string): RarityCode | undefined {
  const trimmed = rarity.trim()
  const upper = trimmed.toUpperCase()
  if (upper === 'UR-OR' || /ULTRA RARE OVER FRAME/.test(upper)) return 'UR-OR'
  if (upper === 'SCR-OR' || /SECRET RARE OVER FRAME/.test(upper)) return 'ScR-OR'
  if (upper === 'PSER-OR' || /PRISMATIC SECRET RARE OVER FRAME/.test(upper)) return 'PSER-OR'
  if (upper === 'QCSR' || /QUARTER CENTURY/.test(upper)) return 'QCSR'
  if (upper === '20THSER' || /20TH SECRET/.test(upper)) return '20thSER'
  if (upper === 'PSER' || /PRISMATIC SECRET/.test(upper)) return 'PSER'
  if (upper === 'PGR' || /PREMIUM GOLD/.test(upper)) return 'PGR'
  if (upper === 'SCR' || /SECRET RARE/.test(upper)) return 'ScR'
  if (upper === 'UTR' || /ULTIMATE RARE/.test(upper)) return 'UtR'
  if (upper === 'STR' || /STARLIGHT/.test(upper)) return 'StR'
  if (upper === 'CR' || /COLLECTOR/.test(upper)) return 'CR'
  if (upper === 'GR' || /GOLD RARE/.test(upper)) return 'GR'
  if (upper === 'SR' || /SUPER RARE/.test(upper)) return 'SR'
  if (upper === 'UR' || /ULTRA RARE/.test(upper)) return 'UR'
  if (upper === 'NPR' || /NORMAL PARALLEL/.test(upper)) return 'NPR'
  if (upper === 'NR' || /NORMAL RARE/.test(upper)) return 'NR'
  if (upper === 'HR' || /HOLOGRAPHIC|GHOST/.test(upper)) return 'HR'
  if (upper === 'R' || upper === 'RARE') return 'R'
  if (upper === 'C' || /COMMON/.test(upper)) return 'C'
  return undefined
}

export function lowestPriceWithOutlierFilter(prices: number[]): number | undefined {
  const valid = prices.filter((p) => Number.isFinite(p) && p > 0)
  if (valid.length === 0) return undefined
  if (valid.length === 1) return valid[0]

  const sorted = [...valid].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]

  const threshold = median * 3
  const filtered = sorted.filter((p) => p <= threshold)
  return filtered.length > 0 ? filtered[0] : sorted[0]
}

/**
 * Returns the mode (most frequently occurring price) among valid prices.
 * When multiple prices tie for the highest frequency, returns the lowest one.
 * Prices are rounded to the nearest integer (TWD) before counting so that
 * near-identical listings (e.g. 5, 5, 5, 7, 9) cluster into the same bucket.
 */
export function mostFrequentPrice(prices: number[]): number | undefined {
  const valid = prices.filter((p) => Number.isFinite(p) && p > 0)
  if (valid.length === 0) return undefined
  if (valid.length === 1) return valid[0]

  const counts = new Map<number, number>()
  for (const p of valid) {
    const rounded = Math.round(p)
    counts.set(rounded, (counts.get(rounded) ?? 0) + 1)
  }

  let maxCount = 0
  let best: number | undefined
  for (const [price, count] of counts) {
    if (count > maxCount || (count === maxCount && (best === undefined || price < best))) {
      maxCount = count
      best = price
    }
  }
  return best
}

/**
 * Groups prices into N relative-width buckets spanning [min, max] and returns
 * the lowest price within the bucket that contains the most listings.
 * This "mainstream range" approach guards against a single rare outlier price
 * being chosen as the representative value.
 */
export function relativeBucketMode(prices: number[], bucketCount = 5): number | undefined {
  const valid = prices.filter((p) => Number.isFinite(p) && p > 0)
  if (valid.length === 0) return undefined
  if (valid.length === 1) return valid[0]

  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const span = max - min
  if (span <= 0) return valid[0]

  const width = span / bucketCount
  const bucketIndex = (p: number) => Math.min(bucketCount - 1, Math.floor((p - min) / width))

  const counts = new Map<number, number>()
  const buckets = new Map<number, number[]>()
  for (const p of valid) {
    const idx = bucketIndex(p)
    counts.set(idx, (counts.get(idx) ?? 0) + 1)
    const list = buckets.get(idx) ?? []
    list.push(p)
    buckets.set(idx, list)
  }

  let maxCount = 0
  let bestIdx = 0
  for (const [idx, count] of counts) {
    if (count > maxCount) {
      maxCount = count
      bestIdx = idx
    }
  }

  const bestBucket = buckets.get(bestIdx) ?? []
  return Math.min(...bestBucket)
}

/**
 * Representative Ruten price: filters outliers, finds the mainstream
 * relative-percentage bucket (the one with the most listings), then within
 * that bucket picks the most frequent price (mode), breaking ties toward the
 * lower value. This balances "the price most sellers agree on" against
 * "prefer the cheaper side of that consensus".
 */
export function rutenRepresentativePrice(prices: number[]): number | undefined {
  // 1. Strip obvious high outliers first (median * 3 threshold).
  const filtered = prices.filter((p) => {
    if (!Number.isFinite(p) || p <= 0) return false
    return true
  })
  if (filtered.length === 0) return undefined
  if (filtered.length === 1) return filtered[0]

  const sorted = [...filtered].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
  const threshold = median * 3
  const cleaned = sorted.filter((p) => p <= threshold)

  // 2. Find the mainstream relative bucket.
  const min = Math.min(...cleaned)
  const max = Math.max(...cleaned)
  const span = max - min
  if (span <= 0) return mostFrequentPrice(cleaned)

  const bucketCount = 5
  const width = span / bucketCount
  const bucketIndex = (p: number) => Math.min(bucketCount - 1, Math.floor((p - min) / width))

  const buckets = new Map<number, number[]>()
  for (const p of cleaned) {
    const idx = bucketIndex(p)
    const list = buckets.get(idx) ?? []
    list.push(p)
    buckets.set(idx, list)
  }

  let maxCount = 0
  let bestIdx = 0
  for (const [idx, list] of buckets) {
    if (list.length > maxCount) {
      maxCount = list.length
      bestIdx = idx
    }
  }

  // 3. Within the mainstream bucket, pick the mode (tie-break toward lower).
  const mainstream = buckets.get(bestIdx) ?? []
  const mode = mostFrequentPrice(mainstream)
  return mode ?? Math.min(...mainstream)
}

export const USD_TO_TWD = 31.5

export function formatPrice(
  value: number | undefined,
  currency: 'TWD' | 'USD',
  sourceCurrency: 'TWD' | 'USD' = 'USD',
): string {
  if (value == null || !Number.isFinite(value)) return 'N/A'
  const inCurrency = sourceCurrency === currency ? value : sourceCurrency === 'USD' ? value * USD_TO_TWD : value / USD_TO_TWD
  const symbol = currency === 'TWD' ? 'NT$' : '$'
  return `${symbol}${inCurrency.toFixed(2)}`
}

export function buildRutenSearchUrl(setCode: string, rarity: string): string {
  const code = setCode.trim()
  const kw = rarityKeyword(rarity)
  const overFrameKw = rarityOverFrameKeyword(rarity)
  const parts = [code]
  if (kw) parts.push(kw)
  if (overFrameKw) parts.push(overFrameKw)
  const query = parts.join(' ')
  return `https://www.ruten.com.tw/find/?q=${encodeURIComponent(query)}`
}

export function setPriceByRarity(cardSets: { setCode: string; rarity: string; setPrice?: number }[], setCode: string, rarity: string): number | undefined {
  const normalizedSetCode = setCode.trim().toUpperCase()
  const normalizedRarity = rarity.trim().toLowerCase()

  const exactMatch = cardSets.find(
    (s) => s.setCode.toUpperCase() === normalizedSetCode && s.rarity.toLowerCase() === normalizedRarity && (s.setPrice ?? 0) > 0,
  )
  if (exactMatch?.setPrice != null && exactMatch.setPrice > 0) return exactMatch.setPrice

  const rarityOnlyMatch = cardSets
    .filter((s) => s.rarity.toLowerCase() === normalizedRarity && (s.setPrice ?? 0) > 0)
    .sort((a, b) => (a.setPrice ?? 0) - (b.setPrice ?? 0))[0]
  if (rarityOnlyMatch?.setPrice != null && rarityOnlyMatch.setPrice > 0) return rarityOnlyMatch.setPrice

  return undefined
}
