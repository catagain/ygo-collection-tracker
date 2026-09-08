import { rutenRepresentativePrice } from './price.ts'

export interface RutenSearchItem {
  name: string
  price?: number
  currency: string
}

export async function fetchRutenLowestPrice(keyword: string): Promise<{ price: number; currency: string } | undefined> {
  const apiBase = import.meta.env.VITE_API_BASE ?? ''
  const url = `${apiBase}/api/ruten?q=${encodeURIComponent(keyword)}`

  let response: Response
  try {
    response = await fetch(url)
  } catch {
    return undefined
  }

  if (!response.ok) return undefined

  const json = (await response.json()) as { items?: RutenSearchItem[] }
  const prices = (json.items ?? [])
    .map((i) => i.price)
    .filter((p): p is number => p != null && Number.isFinite(p) && p > 0)

  const representative = rutenRepresentativePrice(prices)
  if (representative == null) return undefined

  const currency = json.items?.find((i) => i.currency)?.currency ?? 'TWD'
  return { price: representative, currency }
}
