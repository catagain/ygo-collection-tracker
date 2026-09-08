import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Fetches the full list of OCG card set names from YGOPRODECK's card database
 * page. The page's `filter-ocgset` <select> contains the authoritative pack
 * names (e.g. "Rarity Collection Quarter Century Edition", "Quarter Century
 * Chronicle side:Unity") which can be used verbatim in /pack/?search= — no
 * symbol sanitization or case guessing needed.
 */
const CARD_DB_URL = 'https://ygoprodeck.com/card-database/'

export async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  try {
    const resp = await fetch(CARD_DB_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!resp.ok) {
      res.status(502).json({ error: `Card database failed: ${resp.status}` })
      return
    }
    const html = await resp.text()

    // Extract the OCG set select. Options are plain-text names in <option> tags.
    const selectMatch = html.match(/<select[^>]*id="filter-ocgset"[^>]*>[\s\S]*?<\/select>/i)
    if (!selectMatch) {
      res.status(502).json({ error: 'Could not find OCG set list in page' })
      return
    }
    const names = Array.from(selectMatch[0].matchAll(/<option>([^<]*)<\/option>/gi), (m) => m[1].trim()).filter(Boolean)

    res.json({ sets: names, count: names.length })
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'ygosets proxy error' })
  }
}

export default handler