import type { VercelRequest, VercelResponse } from '@vercel/node'

interface RutenProd {
  ProdId?: string
  ProdName?: string
  PriceRange?: number[]
  Currency?: string
}

/**
 * Product-name keywords that identify counterfeit / fan-made ("doujin")
 * cards. Ruten listings like these (e.g. 韓紙, 高仿, 同人) sell for a tiny
 * fraction of the real card's price and would drag the representative price
 * down, so they are filtered out of search results entirely.
 */
const COUNTERFEIT_PATTERNS = [
  '高仿',
  '仿卡',
  '盜版',
  '同人',
  '打印',
  '代印',
  '印刷卡',
  'DIY卡',
  '複刻',
  '復刻',
  '代工',
  '自印',
  '山寨',
  '廉價卡',
]

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  const q = typeof req.query.q === 'string' ? req.query.q : ''
  if (!q) {
    res.status(400).json({ error: 'Missing q parameter' })
    return
  }

  const headers: Record<string, string> = {
    Referer: 'https://www.ruten.com.tw/search/',
    Origin: 'https://www.ruten.com.tw',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
  }

  try {
    const searchUrl = `https://rtapi.ruten.com.tw/api/search/v4/index.php/core/prod?q=${encodeURIComponent(q)}&type=direct&sort=rnk%2Fdc&limit=20&offset=1`
    const searchResp = await fetch(searchUrl, { headers })
    if (!searchResp.ok) {
      res.status(502).json({ error: `Ruten search failed: ${searchResp.status}` })
      return
    }
    const searchJson = (await searchResp.json()) as { Rows?: { Id: string }[] }
    const ids = (searchJson.Rows ?? []).map((r) => r.Id)
    if (ids.length === 0) {
      res.json({ items: [] })
      return
    }

    const prodUrl = `https://rtapi.ruten.com.tw/api/prod/v3/index.php/prod?id=${ids.join(',')}`
    const prodResp = await fetch(prodUrl, { headers })
    if (!prodResp.ok) {
      res.status(502).json({ error: `Ruten prod failed: ${prodResp.status}` })
      return
    }
    const prods = (await prodResp.json()) as RutenProd[]

    const items = prods
      .filter((p) => !COUNTERFEIT_PATTERNS.some((kw) => (p.ProdName ?? '').includes(kw)))
      .map((p) => ({
        name: p.ProdName ?? '',
        price: Array.isArray(p.PriceRange) && p.PriceRange.length > 0 ? p.PriceRange[0] : undefined,
        currency: p.Currency ?? 'TWD',
      }))

    res.json({ items })
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Ruten proxy error' })
  }
}
