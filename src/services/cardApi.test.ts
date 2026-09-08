import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { autoFormatSetCode, displayName, fetchCardByName, fetchCardByPasscode, fetchCardBySetCode, rarityLabelToCode, refreshCardInfo, validateSetCode } from './cardApi.ts'
import { clearCardCache, setCachedCardBySetCode } from './storage.ts'

beforeEach(async () => {
  await clearCardCache()
})

describe('fetchCardBySetCode', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses cardsetsinfo then cardinfo instead of sending an unsupported cardinfo set filter', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 89631146,
        set_name: 'Legend of Blue Eyes White Dragon',
        set_code: 'LOB-EN001',
        set_rarity: 'Ultra Rare',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{
          id: 89631146,
          name: 'Blue-Eyes White Dragon',
          type: 'Normal Monster',
          frameType: 'normal',
          card_sets: [{
            set_code: 'LOB-EN001',
            set_name: 'Legend of Blue Eyes White Dragon',
            set_rarity: 'Ultra Rare',
          }],
          card_images: [{
            image_url: 'https://images.example/89631146.jpg',
            image_url_small: 'https://images.example/89631146-small.jpg',
          }],
        }],
      }), { status: 200 }))

    const result = await fetchCardBySetCode('LOB-EN001')

    expect(result.card?.name).toBe('Blue-Eyes White Dragon')
    expect(result.matchedSet?.rarity).toBe('Ultra Rare')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/cardsetsinfo.php?setcode=LOB-EN001')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/cardinfo.php?id=89631146')
  })

  it('returns no card when the set code is not present', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('invalid set code', { status: 400 }))

    const result = await fetchCardBySetCode('LOB-JP001')

    expect(result.card).toBeNull()
  })

  it('converts JP set code to EN for API query and back to JP for display', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 89631146,
        set_name: 'Legend of Blue Eyes White Dragon',
        set_code: 'LOB-EN001',
        set_rarity: 'Ultra Rare',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{
          id: 89631146,
          name: 'Blue-Eyes White Dragon',
          type: 'Normal Monster',
          frameType: 'normal',
          card_sets: [{
            set_code: 'LOB-EN001',
            set_name: 'Legend of Blue Eyes White Dragon',
            set_rarity: 'Ultra Rare',
          }],
          card_images: [{
            image_url: 'https://images.example/89631146.jpg',
            image_url_small: 'https://images.example/89631146-small.jpg',
          }],
        }],
      }), { status: 200 }))

    const result = await fetchCardBySetCode('LOB-JP001')

    expect(result.card?.name).toBe('Blue-Eyes White Dragon')
    expect(result.matchedSet?.setCode).toBe('LOB-JP001')
    expect(result.language).toBe('JP')
    expect(result.originalSetCode).toBe('LOB-JP001')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/cardsetsinfo.php?setcode=LOB-EN001')
  })

  it('queries the EN variant for TCG language-prefixed codes (e.g. BLMR-FR104)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 81497285,
        set_name: 'Battles of Legend: Monstrous Revenge',
        set_code: 'BLMR-EN104',
        set_rarity: 'Ultra Rare',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{
          id: 81497285,
          name: 'Lady Labrynth of the Silver Castle',
          type: 'Effect Monster',
          frameType: 'effect',
          card_sets: [{ set_code: 'BLMR-EN104', set_name: 'Battles of Legend: Monstrous Revenge', set_rarity: 'Ultra Rare' }],
          card_images: [{ image_url: 'https://images.example/81497285.jpg' }],
        }],
      }), { status: 200 }))

    const result = await fetchCardBySetCode('BLMR-FR104')

    expect(result.card?.name).toBe('Lady Labrynth of the Silver Castle')
    expect(result.language).toBe('OTHER')
    expect(result.originalSetCode).toBe('BLMR-FR104')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/cardsetsinfo.php?setcode=BLMR-EN104')
  })

  it('rejects EN Structure Deck results for JP codes (SR13-JP023 is not SR13-EN023)', async () => {
    // YGOPRODECK resolves SR13-EN023 to Fabled Raven, but SR13-JP023 is a
    // different card in the OCG structure deck — the EN result must be rejected
    // so the caller falls back to the OCG database.
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 47217354,
        set_name: 'Structure Deck: Dark World',
        set_code: 'SR13-EN023',
        set_rarity: 'Common',
      }), { status: 200 }))

    const result = await fetchCardBySetCode('SR13-JP023')

    expect(result.card).toBeNull()
    expect(result.language).toBe('JP')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/cardsetsinfo.php?setcode=SR13-EN023')
  })

  it('rejects a stale cache entry holding an EN Structure Deck card for a JP code', async () => {
    // Simulate a stale IndexedDB cache from before the guard existed: the cache
    // holds the EN card (Fabled Raven) for SR13-JP023. The guard must reject it
    // and re-resolve through cardsetsinfo (which then also rejects it).
    await setCachedCardBySetCode('SR13-JP023', {
      passcode: '47217354',
      name: 'Fabled Raven',
      type: 'Effect Monster',
      frameType: 'effect',
      imageUrl: null,
      imageUrlSmall: null,
      sets: [{ setCode: 'SR13-EN023', setName: 'Structure Deck: Dark World', rarity: 'Common' }],
      prices: undefined,
    })

    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 47217354,
        set_name: 'Structure Deck: Dark World',
        set_code: 'SR13-EN023',
        set_rarity: 'Common',
      }), { status: 200 }))

    const result = await fetchCardBySetCode('SR13-JP023')

    expect(result.card).toBeNull()
    expect(String(fetchMock.mock.calls[0][0])).toContain('/cardsetsinfo.php?setcode=SR13-EN023')
  })

  it('converts letter-suffix JP set code (BETB-JPS05) to EN for query and back to JP', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 12345678,
        set_name: 'BETB',
        set_code: 'BETB-ENS05',
        set_rarity: 'Common',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{
          id: 12345678,
          name: 'Test Card',
          type: 'Effect Monster',
          frameType: 'effect',
          card_sets: [{
            set_code: 'BETB-ENS05',
            set_name: 'BETB',
            set_rarity: 'Common',
          }],
          card_images: [{
            image_url: 'https://images.example/12345678.jpg',
            image_url_small: 'https://images.example/12345678-small.jpg',
          }],
        }],
      }), { status: 200 }))

    const result = await fetchCardBySetCode('BETB-JPS05')

    expect(result.language).toBe('JP')
    expect(result.matchedSet?.setCode).toBe('BETB-JPS05')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/cardsetsinfo.php?setcode=BETB-ENS05')
  })

  it('uses EN set price for JP cards with the same rarity', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 12345678,
        set_name: 'Infinite Forbidden',
        set_code: 'INFO-EN017',
        set_rarity: 'Secret Rare',
        set_price: '12.34',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{
          id: 12345678,
          name: 'Test Card',
          type: 'Effect Monster',
          frameType: 'effect',
          card_sets: [{
            set_code: 'INFO-EN017',
            set_name: 'Infinite Forbidden',
            set_rarity: 'Secret Rare',
          }],
          card_images: [{
            image_url: 'https://images.example/12345678.jpg',
            image_url_small: 'https://images.example/12345678-small.jpg',
          }],
          card_prices: [{
            tcgplayer_price: '1.00',
          }],
        }],
      }), { status: 200 }))

    const result = await fetchCardBySetCode('INFO-JP017')

    expect(result.card?.prices?.tcgplayer_price).toBe(12.34)
    expect(result.matchedSet?.setCode).toBe('INFO-JP017')
  })
})

describe('fetchCardByPasscode', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches card by passcode', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{
          id: 89631146,
          name: 'Blue-Eyes White Dragon',
          type: 'Normal Monster',
          frameType: 'normal',
          card_sets: [],
          card_images: [],
        }],
      }), { status: 200 }))

    const result = await fetchCardByPasscode('89631146')

    expect(result?.name).toBe('Blue-Eyes White Dragon')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/cardinfo.php?id=89631146')
  })

  it('returns null for invalid passcode format', async () => {
    const result = await fetchCardByPasscode('invalid')
    expect(result).toBeNull()
  })

  it('pads leading zeros so a 7-digit passcode queries and returns 8 digits', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{
          id: 9205573, // YGOPRODECK drops the leading zero: real passcode is 09205573
          name: 'Evil★Twin Ki-sikil',
          type: 'Link Monster',
          frameType: 'link',
          card_sets: [],
          card_images: [],
        }],
      }), { status: 200 }))

    const result = await fetchCardByPasscode('9205573')

    expect(result?.passcode).toBe('09205573')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/cardinfo.php?id=09205573')
  })
})

describe('fetchCardByName', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches card by name', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{
          id: 89631146,
          name: 'Blue-Eyes White Dragon',
          type: 'Normal Monster',
          frameType: 'normal',
          card_sets: [],
          card_images: [],
        }],
      }), { status: 200 }))

    const result = await fetchCardByName('Blue-Eyes White Dragon')

    expect(result?.name).toBe('Blue-Eyes White Dragon')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/cardinfo.php?name=Blue-Eyes+White+Dragon')
  })
})

describe('validateSetCode', () => {
  it('validates correct set code formats', () => {
    expect(validateSetCode('LOB-EN001')).toBe(true)
    expect(validateSetCode('AGOV-JP001')).toBe(true)
    expect(validateSetCode('RC03-JP010')).toBe(true)
    expect(validateSetCode('PAC1-AE016')).toBe(true)
    expect(validateSetCode('BETB-JPS05')).toBe(true)
    expect(validateSetCode('JCY-001')).toBe(true)
    expect(validateSetCode('20AP-JP077')).toBe(true)
    expect(validateSetCode('TT01-JPC06')).toBe(true)
    expect(validateSetCode('TT01-ENC06')).toBe(true)
    expect(validateSetCode('BLMR-FR104')).toBe(true)
    expect(validateSetCode('BLMR-DE104')).toBe(true)
    expect(validateSetCode('BLMR-IT104')).toBe(true)
    expect(validateSetCode('BLMR-PT104')).toBe(true)
    expect(validateSetCode('BLMR-SP104')).toBe(true)
    expect(validateSetCode('BLMR-KR104')).toBe(true)
  })

  it('rejects invalid set code formats', () => {
    expect(validateSetCode('')).toBe(false)
    expect(validateSetCode('LOB')).toBe(false)
    expect(validateSetCode('LOB-EN1')).toBe(false)
    expect(validateSetCode('LOB-EN0011')).toBe(false)
    expect(validateSetCode('123-EN001')).toBe(false)
    expect(validateSetCode('LOB-XX001')).toBe(false)
    expect(validateSetCode('JCY-1')).toBe(false)
  })
})

describe('autoFormatSetCode', () => {
  it('uppercases the input and keeps existing dashes', () => {
    expect(autoFormatSetCode('LOB-EN001')).toBe('LOB-EN001')
    expect(autoFormatSetCode('agov-jp001')).toBe('AGOV-JP001')
    expect(autoFormatSetCode('betb-jps05')).toBe('BETB-JPS05')
  })

  it('converts spaces to dashes', () => {
    expect(autoFormatSetCode('UT01 JP011')).toBe('UT01-JP011')
    expect(autoFormatSetCode('UT01  JP011')).toBe('UT01-JP011')
  })

  it('does not auto-insert a dash into prefixes containing digits', () => {
    expect(autoFormatSetCode('UT01')).toBe('UT01')
    expect(autoFormatSetCode('UT01JP011')).toBe('UT01JP011')
  })

  it('returns empty string for empty input', () => {
    expect(autoFormatSetCode('')).toBe('')
  })

  it('returns uppercased value when no dash is present', () => {
    expect(autoFormatSetCode('lob')).toBe('LOB')
    expect(autoFormatSetCode('jcy001')).toBe('JCY001')
  })
})

describe('card prices', () => {
  it('maps card_prices from API response to Card.prices', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      data: [{
        id: 89631146,
        name: 'Blue-Eyes White Dragon',
        type: 'Normal Monster',
        frameType: 'normal',
        card_sets: [],
        card_images: [],
        card_prices: [{
          tcgplayer_price: '253.34',
          cardmarket_price: '100.50',
          ebay_price: '200.00',
          amazon_price: '300.00',
          coolstuffinc_price: '150.00',
        }],
      }],
    }), { status: 200 }))

    const result = await fetchCardByPasscode('89631146')

    expect(result?.prices?.tcgplayer_price).toBe(253.34)
    expect(result?.prices?.cardmarket_price).toBe(100.50)
    expect(result?.prices?.ebay_price).toBe(200.00)
    expect(result?.prices?.amazon_price).toBe(300.00)
    expect(result?.prices?.coolstuffinc_price).toBe(150.00)
  })

  it('returns undefined prices when card_prices is missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      data: [{
        id: 89631146,
        name: 'Blue-Eyes White Dragon',
        type: 'Normal Monster',
        frameType: 'normal',
        card_sets: [],
        card_images: [],
      }],
    }), { status: 200 }))

    const result = await fetchCardByPasscode('89631146')

    expect(result?.prices).toBeUndefined()
  })
})

describe('fetchPriceForItem', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('refreshes price via JP→EN set price with same rarity', async () => {
    const { fetchPriceForItem } = await import('./cardApi.ts')
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 12345678,
        set_name: 'Infinite Forbidden',
        set_code: 'INFO-EN017',
        set_rarity: 'Secret Rare',
        set_price: '12.34',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{
          id: 12345678,
          name: 'Test Card',
          type: 'Effect Monster',
          frameType: 'effect',
          card_sets: [{
            set_code: 'INFO-EN017',
            set_name: 'Infinite Forbidden',
            set_rarity: 'Secret Rare',
          }],
          card_images: [{
            image_url: 'https://images.example/12345678.jpg',
            image_url_small: 'https://images.example/12345678-small.jpg',
          }],
          card_prices: [{ tcgplayer_price: '1.00' }],
        }],
      }), { status: 200 }))

    const price = await fetchPriceForItem({ passcode: '12345678', setCode: 'INFO-JP017', priceSource: 'tcgplayer' })
    expect(price).toBe(12.34)
  })

  it('falls back to passcode price when set code lookup fails', async () => {
    const { fetchPriceForItem } = await import('./cardApi.ts')
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('invalid', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{
          id: 89631146,
          name: 'Blue-Eyes White Dragon',
          type: 'Normal Monster',
          frameType: 'normal',
          card_sets: [],
          card_images: [],
          card_prices: [{ tcgplayer_price: '9.99' }],
        }],
      }), { status: 200 }))

    const price = await fetchPriceForItem({ passcode: '89631146', setCode: 'LOB-EN999' })
    expect(price).toBe(9.99)
  })
})

describe('displayName', () => {
  it('uses the Japanese name for JP cards when available', () => {
    expect(displayName({ name: 'Crowley, the Gifted Magistus', nameJa: '天賦の魔導士クロウリー', language: 'JP' }))
      .toBe('天賦の魔導士クロウリー')
  })

  it('falls back to the English name for JP cards without a Japanese name', () => {
    expect(displayName({ name: 'Crowley, the Gifted Magistus', nameJa: undefined, language: 'JP' }))
      .toBe('Crowley, the Gifted Magistus')
  })

  it('uses the English name for non-JP languages even when nameJa exists', () => {
    expect(displayName({ name: 'Crowley, the Gifted Magistus', nameJa: '天賦の魔導士クロウリー', language: 'EN' }))
      .toBe('Crowley, the Gifted Magistus')
  })

  it('uses the English name for AE and OTHER', () => {
    expect(displayName({ name: 'Blue-Eyes White Dragon', nameJa: '青眼の白龍', language: 'AE' }))
      .toBe('Blue-Eyes White Dragon')
    expect(displayName({ name: 'Blue-Eyes White Dragon', nameJa: '青眼の白龍', language: 'OTHER' }))
      .toBe('Blue-Eyes White Dragon')
  })
})

describe('fetchOcgEnrichment', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the OCG rarity keys and Japanese name from db.yugioh-card-cn.com', async () => {
    const { fetchOcgEnrichment } = await import('./cardApi.ts')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      card: {
        cardName: '六世壊＝パライゾス',
        cardNo: 'PHHY-JP059',
        rarity: 'レア仕様',
        rarityKey: 'R',
        rarityKeys: ['R'],
      },
    }), { status: 200 }))

    const ocg = await fetchOcgEnrichment('PHHY-JP059')
    expect(ocg?.rarityKeys).toEqual(['R'])
    expect(ocg?.nameJa).toBe('六世壊＝パライゾス')
  })

  it('omits rarity keys when the OCG database has none, but still returns the name', async () => {
    const { fetchOcgEnrichment } = await import('./cardApi.ts')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      card: {
        cardName: 'Some Card',
        cardNo: 'ABC-JP001',
        rarity: 'ノーマル',
      },
    }), { status: 200 }))

    const ocg = await fetchOcgEnrichment('ABC-JP001')
    expect(ocg?.rarityKeys).toBeUndefined()
    expect(ocg?.nameJa).toBe('Some Card')
  })

  it('returns null when the OCG lookup fails', async () => {
    const { fetchOcgEnrichment } = await import('./cardApi.ts')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not found', { status: 404 }))

    const ocg = await fetchOcgEnrichment('XYZ-JP999')
    expect(ocg).toBeNull()
  })
})

describe('rarityLabelToCode', () => {
  it('maps common pack-page labels to stable codes', () => {
    expect(rarityLabelToCode('Common')).toBe('C')
    expect(rarityLabelToCode('C print New')).toBe('C')
    expect(rarityLabelToCode('C print Reprint')).toBe('C')
    expect(rarityLabelToCode('Rare')).toBe('R')
    expect(rarityLabelToCode('Super Rare')).toBe('SR')
    expect(rarityLabelToCode('Ultra Rare')).toBe('UR')
    expect(rarityLabelToCode('Secret Rare')).toBe('ScR')
    expect(rarityLabelToCode('Ultimate Rare')).toBe('UtR')
    expect(rarityLabelToCode('Holographic Rare')).toBe('HR')
    expect(rarityLabelToCode("Collector's Rare")).toBe('CR')
    expect(rarityLabelToCode('Starlight Rare')).toBe('StR')
    expect(rarityLabelToCode('20th Secret Rare')).toBe('20thSER')
    expect(rarityLabelToCode('Prismatic Secret Rare')).toBe('PSER')
    expect(rarityLabelToCode('Quarter Century Secret Rare')).toBe('QCSR')
    expect(rarityLabelToCode('Gold Rare')).toBe('GR')
    expect(rarityLabelToCode('Premium Gold Rare')).toBe('PGR')
  })

  it('maps parallel and special labels', () => {
    expect(rarityLabelToCode('Normal Parallel Rare')).toBe('NPR')
    expect(rarityLabelToCode('NPR')).toBe('NPR')
    expect(rarityLabelToCode('Super Parallel Rare')).toBe('SR')
    expect(rarityLabelToCode('Ultra Parallel Rare')).toBe('UR')
    expect(rarityLabelToCode('Secret Parallel Rare')).toBe('ScR')
    expect(rarityLabelToCode('Duel Terminal Super Parallel Rare')).toBe('NPR')
    expect(rarityLabelToCode('Extra Secret Rare')).toBe('ScR')
    expect(rarityLabelToCode('Gold Secret Rare')).toBe('GR')
    expect(rarityLabelToCode('Platinum Secret Rare')).toBe('ScR')
    expect(rarityLabelToCode('Grand Master Rare')).toBe('StR')
  })

  it('handles OCG short keys and composite keys', () => {
    expect(rarityLabelToCode('N')).toBe('C')
    expect(rarityLabelToCode('NR')).toBe('NR')
    expect(rarityLabelToCode('ScPR')).toBe('ScR')
    expect(rarityLabelToCode('SR')).toBe('SR')
    expect(rarityLabelToCode('UR')).toBe('UR')
    expect(rarityLabelToCode('UL')).toBe('UtR')
    expect(rarityLabelToCode('QCSE')).toBe('QCSR')
    expect(rarityLabelToCode('10000 Secret Rare')).toBe('20thSER')
  })

  it('treats promo/regional-only labels as Common', () => {
    expect(rarityLabelToCode('New')).toBe('C')
    expect(rarityLabelToCode('New artwork')).toBe('C')
    expect(rarityLabelToCode('Reprint')).toBe('C')
    expect(rarityLabelToCode('European debut')).toBe('C')
    expect(rarityLabelToCode('Short Print')).toBe('C')
    expect(rarityLabelToCode('force SMW')).toBe('C')
    expect(rarityLabelToCode('2')).toBe('C')
  })

  it('returns null for empty input', () => {
    expect(rarityLabelToCode('')).toBeNull()
    expect(rarityLabelToCode(undefined)).toBeNull()
  })
})

describe('refreshCardInfo', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('recovers the card image from a stored passcode when the set code is unknown', async () => {
    // cardsetsinfo returns 404 for the unknown JP-only set code...
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('invalid set code', { status: 404 }))
      // ...the OCG fallback proxy is unavailable (returns null)...
      .mockResolvedValueOnce(new Response(JSON.stringify({ card: null }), { status: 200 }))
      // ...and cardinfo resolves the passcode to the full card with artwork.
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{
          id: 49238328,
          name: 'Pot of Extravagance',
          type: 'Normal Spell',
          frameType: 'spell',
          card_sets: [{ set_code: 'MP20-EN030', set_name: 'Mega Pack', set_rarity: 'Prismatic Secret Rare' }],
          card_images: [{ image_url: 'https://images.example/49238328.jpg' }],
        }],
      }), { status: 200 }))

    const result = await refreshCardInfo('TT01-JPC09', '49238328')

    expect(result).not.toBeNull()
    expect(result?.imageUrl).toBe('https://images.example/49238328.jpg')
    expect(result?.passcode).toBe('49238328')
    expect(result?.name).toBe('Pot of Extravagance')
  })
})
