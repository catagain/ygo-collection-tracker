import type { VercelRequest, VercelResponse } from '@vercel/node'

interface PackCard {
  setCode: string
  name: string
  passcode: string | null
}

// Removes special symbols from a pack name and converts it to Title Case
// before searching YGOPRODECK. The OCG database uses all-caps names with
// symbols (★☆※○▲ etc.); YGOPRODECK's /pack/?search= is case-sensitive and
// requires Title Case (e.g. "Rarity Collection Quarter Century Edition").
// A full-width colon (：) is normalized to a half-width colon (:) and kept,
// because some pack names need it (e.g. "Quarter Century Chronicle side:Unity").
function sanitizePackName(name: string): string {
  const normalized = name.replace(/：/g, ':')
  const cleaned = normalized
    .replace(/[^\p{L}\p{N}\s\-:]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // Title-case each word; keep Roman numerals (II, III...) and short acronyms
  // like "OCG"/"TCG" intact. Words starting with a digit keep their original
  // casing (e.g. "25th", "20th").
  return cleaned.replace(/[\p{L}\p{N}]+/gu, (word) => {
    if (/^(?:I{1,3}|IV|V|VI{0,3}|X{1,3}|OCG|TCG)$/i.test(word)) return word.toUpperCase()
    // Words starting with a digit: keep digits, lowercase the letter part
    // (e.g. "25TH" -> "25th", "20th" -> "20th").
    if (/\d/.test(word.charAt(0))) {
      const digits = word.match(/^\d+/)?.[0] ?? ''
      return digits + word.slice(digits.length).toLowerCase()
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  })
}

function parsePackPage(html: string, targetSetCode: string): PackCard | null {
  // The pack page renders each card as:
  // <figure class="position-relative">
  //   <a href="/card/<slug>"><div class="position-relative">
  //     <img src="https://images.ygoprodeck.com/images/cards_small/875572.jpg" ... data-name="875572">
  //   </div></a>
  //   <figcaption><span class="fig-code">UT01-JP017 - $0.00</span>
  //   <span class="fig-name">Crowley, the Gifted Magistus</span></figcaption>
  // </figure>
  const figureRegex = /<figure[^>]*>[\s\S]*?<\/figure>/gi
  const figures = html.match(figureRegex)
  if (!figures) return null

  for (const figure of figures) {
    const codeMatch = figure.match(/class="fig-code">([A-Z0-9]+-[A-Z]{2}[A-Z0-9]{2,3})\s*-\s*\$[^<]*</i)
    if (!codeMatch) continue
    const setCode = codeMatch[1].toUpperCase()
    if (setCode !== targetSetCode.toUpperCase()) continue

    const dataNameMatch = figure.match(/data-name="(\d{5,10})"/)
    const nameMatch = figure.match(/class="fig-name">([^<]+)</)
    const rawPasscode = dataNameMatch ? dataNameMatch[1] : null
    return {
      setCode,
      name: nameMatch ? nameMatch[1].trim() : '',
      // Passcodes are always 8 digits; YGOPRODECK's HTML omits leading zeros
      // (e.g. "09205573" appears as "9205573"), so pad back to 8 digits.
      passcode: rawPasscode && /^\d{5,10}$/.test(rawPasscode) ? rawPasscode.padStart(8, '0') : rawPasscode,
    }
  }
  return null
}

export async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  const packName = typeof req.query.pack === 'string' ? req.query.pack.trim() : ''
  const setCode = typeof req.query.setcode === 'string' ? req.query.setcode.trim().toUpperCase() : ''
  const exact = req.query.exact === '1'
  if (!packName || !setCode) {
    res.status(400).json({ error: 'Missing pack or setcode parameter' })
    return
  }

  try {
    // When `exact=1` the caller already resolved the authoritative YGOPRODECK
    // set name; use it verbatim. Otherwise sanitize/Title-case the raw OCG name.
    const cleanPack = exact ? packName : sanitizePackName(packName)
    const url = `https://ygoprodeck.com/pack/?search=${encodeURIComponent(cleanPack)}&region=OCG`
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
      },
    })
    if (!resp.ok) {
      res.status(502).json({ error: `Pack page failed: ${resp.status}` })
      return
    }
    const html = await resp.text()
    const card = parsePackPage(html, setCode)
    res.json({ card })
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'yugopack proxy error' })
  }
}

export default handler