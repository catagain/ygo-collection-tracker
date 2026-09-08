import crypto from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const API_SEARCH = 'https://yugiohcarddbapi.windoent.com/konami/card/search'
const API_DETAIL = 'https://yugiohcarddbapi.windoent.com/konami/card/detail'

// 3DES signature parameters extracted from the site's configAjax.js
const DES_KEY = 'H2bsdDdfEEKpldjubTevcYCS'
const DES_IV = '53152607'

function buildSignature(): string {
  const ts = Math.floor(Date.now() / 1000).toString()
  const cipher = crypto.createCipheriv('des-ede3-cbc', Buffer.from(DES_KEY, 'utf8'), Buffer.from(DES_IV, 'utf8'))
  const encrypted = Buffer.concat([cipher.update(ts, 'utf8'), cipher.final()])
  return encrypted.toString('base64')
}

interface SearchCard {
  cardId?: number | string
  cardName?: string
  cardText?: string
  attributeName?: string
  speciesName?: string
  otherItemNameList?: string[]
  atk?: number
  def?: number | null
  starchip?: number | null
  linkMarkerCount?: number | null
}

interface DetailCard extends SearchCard {
  packList?: { packName?: string; cardNo?: string; rarity?: string; rarityKey?: string }[]
}

function buildParams(keyword: string): Record<string, unknown> {
  return {
    titleId: '1',
    keyword,
    searchType: '4',
    keywordLang: '0',
    cardType: '',
    starList: [],
    penScaleList: [],
    linkMarkerList: [],
    linkCondition: '1',
    atkFrom: '',
    atkTo: '',
    defFrom: '',
    defTo: '',
    attributeList: [],
    effectList: [],
    speciesList: [],
    otherItemList: [],
    otherCondition: '1',
    exclusionList: [],
    linkBtn: [],
    sort: '1',
    ullist: 0,
    pageSize: '10',
    page: '1',
  }
}

export async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  const setCode = typeof req.query.setcode === 'string' ? req.query.setcode.trim().toUpperCase() : ''
  if (!setCode) {
    res.status(400).json({ error: 'Missing setcode parameter' })
    return
  }

  const signature = buildSignature()
  const baseHeaders: Record<string, string> = {
    signature,
    token: '',
    referer: 'https://db.yugioh-card-cn.com/',
    origin: 'https://db.yugioh-card-cn.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  }

  try {
    // Step 1: search by set code via the JSON API
    const searchResp = await fetch(API_SEARCH, {
      method: 'POST',
      headers: { ...baseHeaders, 'Content-Type': 'application/json;charset=utf-8' },
      body: JSON.stringify({ params: buildParams(setCode) }),
    })
    if (!searchResp.ok) {
      res.status(502).json({ error: `Search failed: ${searchResp.status}` })
      return
    }
    const searchText = await searchResp.text()
    let searchJson: { response?: { cardList?: SearchCard[] } }
    try {
      searchJson = JSON.parse(searchText)
    } catch {
      res.status(502).json({ error: 'Invalid search response' })
      return
    }
    const card = searchJson.response?.cardList?.[0]
    if (!card?.cardName) {
      res.json({ card: null })
      return
    }

    // Step 2: fetch detail to recover pack name (used for passcode lookup)
    let packName: string | undefined
    let cardNo: string | undefined
    let rarity: string | undefined
    let rarityKey: string | undefined
    let rarityKeys: string[] = []
    let imageKey: string | undefined
    if (card.cardId) {
      const detailResp = await fetch(`${API_DETAIL}?titleId=1&cardId=${card.cardId}&lang=ja`, {
        headers: baseHeaders,
      })
      if (detailResp.ok) {
        try {
          const detailJson = JSON.parse(await detailResp.text()) as { response?: DetailCard & { imageKey?: string } }
          const detail = detailJson.response
          imageKey = detail?.imageKey
          const packs = detail?.packList ?? []
          const matchedPack = packs.find((p) => p.cardNo?.toUpperCase() === setCode) ?? packs[0]
          packName = matchedPack?.packName
          cardNo = matchedPack?.cardNo
          rarity = matchedPack?.rarity
          rarityKey = matchedPack?.rarityKey
          // All rarities that appear in the same pack (same packName).
          rarityKeys = Array.from(
            new Set(
              packs
                .filter((p) => p.packName === packName && p.rarityKey)
                .map((p) => p.rarityKey as string),
            ),
          )
        } catch {
          // detail is optional; ignore failures
        }
      }
    }

    res.json({
      card: {
        cardId: String(card.cardId ?? ''),
        cardName: card.cardName,
        cardText: card.cardText,
        attributeName: card.attributeName,
        speciesName: card.speciesName,
        otherItemNameList: card.otherItemNameList ?? [],
        atk: card.atk,
        def: card.def,
        starchip: card.starchip,
        linkMarkerCount: card.linkMarkerCount,
        packName,
        cardNo,
        rarity,
        rarityKey,
        rarityKeys,
        imageKey,
      },
    })
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'yugiohcn proxy error' })
  }
}

export default handler