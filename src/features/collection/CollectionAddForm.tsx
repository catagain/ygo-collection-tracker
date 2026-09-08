import { useEffect, useMemo, useRef, useState } from 'react'
import { autoFormatSetCode, fetchCardBySetCode, fetchCardBySetCodeWithFallback, fetchCardByPasscode, fetchCardByName, fetchOcgEnrichment, getCachedCard, isSetCodeInIndex, setCachedCard, validateSetCode } from '../../services/cardApi.ts'
import { addCollectionItem, getAllCollectionItems } from '../../services/storage.ts'
import { fetchCurrentUser, loginWithGoogle, suggestSetCode, type AuthUser } from '../../services/auth.ts'
import { useAppStore } from '../../stores/appStore.ts'
import { RARITIES, type CardLanguage, type CardPrices, type CardSet, type RarityCode } from '../../types/index.ts'

const LANGUAGES: { value: CardLanguage; label: string }[] = [
  { value: 'JP', label: 'Japanese (JP)' },
  { value: 'AE', label: 'Asian-English (AE)' },
  { value: 'EN', label: 'English (EN)' },
  { value: 'OTHER', label: 'Other' },
]

type SearchType = 'code' | 'cardName'

const SEARCH_TYPES: { value: SearchType; label: string; placeholder: string }[] = [
  { value: 'code', label: 'Set Code / Passcode', placeholder: 'e.g. AGOV-JP001 or 14558127' },
  { value: 'cardName', label: 'Card Name', placeholder: 'e.g. Ash Blossom' },
]

/**
 * Pads a purely-numeric input to the canonical 8-digit passcode (Yu-Gi-Oh!
 * passcodes are always 8 digits; leading zeros may have been dropped).
 * Non-numeric input is returned unchanged.
 */
function normalizeSearchPasscode(input: string): string {
  const trimmed = input.trim()
  if (/^\d{1,10}$/.test(trimmed) && trimmed.length < 8) {
    return trimmed.padStart(8, '0')
  }
  return trimmed
}

function detectInputType(raw: string): 'passcode' | 'setCode' | 'cardName' {
  const trimmed = raw.trim()
  // Any purely-numeric input is treated as a passcode: Yu-Gi-Oh! passcodes are
  // 8 digits, but users may type fewer (leading zeros get stripped by JSON
  // sources). The search normalizes to 8 digits later.
  if (/^\d{1,10}$/.test(trimmed)) return 'passcode'
  // Prefix-LANGsuffix where LANG is 2-3 letters (e.g. LOB-EN001, BETB-JPS05,
  // TT01-JPC06) or Prefix-Number (e.g. JCY-001).
  if (/^[A-Z0-9]+-(?:[A-Z]{2,3}[A-Z0-9]{1,3}|\d{2,4})$/i.test(trimmed)) return 'setCode'
  return 'cardName'
}

// Maps OCG rarity keys (from db.yugioh-card-cn.com) to our rarity codes.
// Keys can be composite (e.g. "P+SR" = Parallel Super Rare, "M+UR" = Millennium
// Ultra Rare); we map the base rarity and the "P" (Parallel) prefix maps to NPR.
const OCG_RARITY_KEY_MAP: Record<string, RarityCode> = {
  C: 'C',
  N: 'C', // Normal (OCG uses "N"; TCG uses "C")
  P: 'NPR', // Parallel (Normal Parallel Rare)
  R: 'R',
  SR: 'SR',
  UR: 'UR',
  SE: 'ScR', // Secret Rare
  SER: 'ScR',
  UL: 'UtR', // Ultimate Rare (OCG uses "UL")
  UTR: 'UtR',
  EXSE: 'ScR', // Extra Secret Rare
  PSE: 'PSER', // Prismatic Secret Rare
  QCSER: 'QCSR', // Quarter Century Secret Rare
  QCSE: 'QCSR',
  HGR: 'HR', // Holographic Rare
  CR: 'CR',
  GR: 'GR',
  GSE: 'GR', // Gold Secret Rare
  NPR: 'NPR',
  '20SER': '20thSER',
  '20th SE': '20thSER',
  '10000 SE': '20thSER', // 10000th Secret Rare (promo)
  PLR: 'PGR',
}

function ocgKeyToRarityCode(key: string | undefined): RarityCode | undefined {
  if (!key) return undefined
  const normalized = key.toUpperCase().trim()
  // Composite keys like "P+SR" or "M+UR": map the base rarity after the "+".
  if (normalized.includes('+')) {
    const parts = normalized.split('+')
    // "P+..." -> the Parallel treatment adds nothing to the base rarity for
    // display purposes except when the base is nothing (bare "P" -> NPR).
    for (let i = parts.length - 1; i >= 0; i--) {
      const mapped = OCG_RARITY_KEY_MAP[parts[i]]
      if (mapped) return mapped
    }
  }
  return OCG_RARITY_KEY_MAP[normalized]
}

interface Props {
  onAdded?: () => void
}

export function CollectionAddForm({ onAdded }: Props) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [searchType, setSearchType] = useState<SearchType>('code')
  const [quantity, setQuantity] = useState(1)
  const [language, setLanguage] = useState<CardLanguage>('JP')
  const [rarity, setRarity] = useState('')
  const [memo, setMemo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cardName, setCardName] = useState<string | null>(null)
  const [cardNameJa, setCardNameJa] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [passcode, setPasscode] = useState<string>('')
  const passcodeRef = useRef('')
  useEffect(() => {
    passcodeRef.current = passcode
  }, [passcode])
  const [, setAvailableSets] = useState<CardSet[]>([])
  const [packRarityKeys, setPackRarityKeys] = useState<string[] | null>(null)
  const [manualMode, setManualMode] = useState(false)
  const [manualName, setManualName] = useState('')
  const [editableSetCode, setEditableSetCode] = useState('')
  const [setCodeError, setSetCodeError] = useState<string | null>(null)
  const [cardPrices, setCardPrices] = useState<CardPrices | null>(null)
  const [selectedPriceSource, setSelectedPriceSource] = useState<'tcgplayer' | 'cardmarket' | 'ebay' | 'amazon' | 'coolstuffinc'>('tcgplayer')
  const [authUser, setAuthUser] = useState<AuthUser | null | undefined>(undefined)
  const [suggestable, setSuggestable] = useState(false)
  const [suggestMsg, setSuggestMsg] = useState<string | null>(null)
  const [suggestLoading, setSuggestLoading] = useState(false)

  const { setCollection } = useAppStore()

  const currentSearchType = SEARCH_TYPES.find((t) => t.value === searchType)

  const filteredRarityOptions = useMemo(() => {
    if (!packRarityKeys || packRarityKeys.length === 0) {
      return RARITIES
    }
    // packRarityKeys may be OCG keys (UR, SE, PSE...) or full rarity strings.
    const codes = new Set<RarityCode>()
    for (const key of packRarityKeys) {
      const mapped = ocgKeyToRarityCode(key)
      if (mapped) {
        codes.add(mapped)
      } else {
        // Fall back to matching full rarity strings (e.g. "Ultra Rare").
        const match = RARITIES.find((r) => r.enName.toLowerCase() === key.toLowerCase() || r.twName === key)
        if (match) codes.add(match.code)
      }
    }
    if (codes.size === 0) return RARITIES
    return RARITIES.filter((r) => codes.has(r.code))
  }, [packRarityKeys])

  useEffect(() => {
    inputRef.current?.focus()
    void fetchCurrentUser().then(setAuthUser)
  }, [])

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)
    setCardName(null)
    setCardNameJa(null)
    setImageUrl(null)
    setAvailableSets([])
    setPackRarityKeys(null)
    setPasscode('')
    setManualMode(false)
    setSetCodeError(null)
    setSuggestable(false)
    setSuggestMsg(null)

    const trimmed = input.trim()
    if (!trimmed) return

    setLoading(true)
    try {
      const cached = await getCachedCard(trimmed)
      if (cached) {
        setCardName(cached.name)
        setImageUrl(cached.imageUrl)
        setPasscode(cached.passcode)
        setAvailableSets(cached.sets)
        setEditableSetCode(cached.sets[0]?.setCode || '')
        setSetCodeError(null)
        setCardPrices(cached.prices || null)
        const matched = cached.sets.find((s) => s.setCode.toUpperCase() === trimmed.toUpperCase())
        if (matched) {
          setRarity(matched.rarity)
        }
        setSuggestable(false)
        setLoading(false)
        return
      }

      const inputType = searchType === 'cardName' ? 'cardName' : detectInputType(trimmed)

      if (inputType === 'passcode') {
        // Normalize to the canonical 8-digit passcode before searching so
        // short inputs (e.g. "9205573" for "09205573") are handled correctly.
        const normalizedPasscode = normalizeSearchPasscode(trimmed)
        const card = await fetchCardByPasscode(normalizedPasscode)
        if (card) {
          await setCachedCard(card.passcode, card)
          setCardName(card.name)
          setImageUrl(card.imageUrl)
          setPasscode(card.passcode)
          setAvailableSets(card.sets)
          setEditableSetCode(card.sets[0]?.setCode || '')
          setSetCodeError(null)
          setCardPrices(card.prices || null)
          setSuggestable(false)
        } else {
          setError(`No card found for passcode ${normalizedPasscode}. You may still add it manually.`)
          setPasscode(normalizedPasscode)
          setManualMode(true)
        }
      } else if (inputType === 'cardName') {
        const card = await fetchCardByName(trimmed)
        if (card) {
          await setCachedCard(card.passcode, card)
          setCardName(card.name)
          setImageUrl(card.imageUrl)
          setPasscode(card.passcode)
          setAvailableSets(card.sets)
          setEditableSetCode(card.sets[0]?.setCode || '')
          setSetCodeError(null)
          setCardPrices(card.prices || null)
          setSuggestable(false)
        } else {
          setError(`No card found for name ${trimmed}. You may still add it manually.`)
          setPasscode('')
          setManualMode(true)
        }
      } else {
        const result = await fetchCardBySetCode(trimmed)
        if (result.card) {
          await setCachedCard(result.card.passcode, result.card)
          setCardName(result.card.name)
          setImageUrl(result.card.imageUrl)
          setPasscode(result.card.passcode)
          setAvailableSets(result.card.sets)
          setEditableSetCode(result.originalSetCode || result.matchedSet?.setCode || trimmed)
          setSetCodeError(null)
          setCardPrices(result.card.prices || null)
          // Derive the pack's available rarities from the matched set code prefix.
          const prefix = (result.matchedSet?.setCode ?? trimmed).split('-')[0].toUpperCase()
          const packRarities = Array.from(
            new Set(
              result.card.sets
                .filter((s) => s.setCode.toUpperCase().startsWith(prefix))
                .map((s) => s.rarity),
            ),
          )
          // The matched set's rarity (from the prebuilt index, when available)
          // is authoritative for the specific card — prefer it over the
          // TCG-wide rarity list when it is a known code.
          if (result.matchedSet?.rarity && result.matchedSet.rarity !== 'Unknown') {
            const matchedCode = ocgKeyToRarityCode(result.matchedSet.rarity) ?? result.matchedSet.rarity
            packRarities.push(matchedCode)
          }
          // JP cards: YGOPRODECK data is from the TCG pack, whose rarity
          // distribution differs from the OCG pack. Merge in the OCG rarity
          // keys (union) and capture the Japanese name for display.
          if (result.language === 'JP') {
            const ocg = await fetchOcgEnrichment(trimmed)
            if (ocg?.rarityKeys && ocg.rarityKeys.length > 0) {
              packRarities.push(...ocg.rarityKeys)
            }
            if (ocg?.nameJa) {
              setCardNameJa(ocg.nameJa)
            }
            // JP cards: prefer the official OCG artwork (card as printed in
            // Japan) over the YGOPRODECK (TCG) image.
            if (ocg?.imageUrlJa) {
              setImageUrl(ocg.imageUrlJa)
            }
          }
          setPackRarityKeys(packRarities.length > 0 ? packRarities : null)
          if (result.matchedSet) {
            setRarity(result.matchedSet.rarity)
          }
          setSuggestable(false)
        } else {
          // YGOPRODECK does not know this set code (e.g. OCG-only JP packs).
          // Fall back to the official OCG database for Japanese card data.
          const fallback = await fetchCardBySetCodeWithFallback(trimmed)
          if (fallback) {
            setCardName(fallback.name)
            setCardNameJa(fallback.name)
            // JP cards: prefer the official OCG artwork (card as printed in
            // Japan), falling back to the YGOPRODECK image when unavailable.
            setImageUrl(fallback.imageUrlJa ?? fallback.imageUrl ?? null)
            setPasscode(fallback.passcode ?? '')
            setAvailableSets([])
            setEditableSetCode(fallback.setCode || trimmed)
            setSetCodeError(null)
            setCardPrices(null)
            setPackRarityKeys(fallback.rarityKeys?.length ? fallback.rarityKeys : null)
            setManualMode(false)
            if (fallback.passcode) {
              setError(null)
              setSuggestable(false)
            } else {
              // Found the Japanese card but no passcode: offer to submit the
              // set code → passcode mapping so it can be added to the database.
              setError(
                `Found Japanese card "${fallback.name}" but could not determine its passcode. You can still save it.`,
              )
              setSuggestable(true)
            }
          } else {
            setError(`No card found for set code ${trimmed}. You may still add it manually.`)
            setPasscode('')
            setManualMode(true)
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch card data.')
      setManualMode(true)
    } finally {
      setLoading(false)
    }
  }

  function handleSetCodeChange(value: string) {
    const formatted = autoFormatSetCode(value)
    setEditableSetCode(formatted)
    if (formatted && !validateSetCode(formatted)) {
      setSetCodeError('Invalid set code format. Expected: XXX-XX000')
    } else {
      setSetCodeError(null)
    }
    // Re-evaluate the "submit for review" offer whenever the user edits the
    // set code (e.g. they found a card by passcode, then typed a new set code).
    void checkSuggestable(formatted || undefined)
  }

  /**
   * Decides whether to offer "submit this mapping" — when the searched card's
   * set code isn't in the prebuilt index. A passcode is optional: some OCG-only
   * packs (e.g. TACTICAL-TRY DECK) don't resolve a passcode, but the user can
   * still submit the set code → name mapping for an admin to review.
   */
  async function checkSuggestable(codeOverride?: string) {
    // The set code may not be committed to state yet (async setState), so the
    // caller can pass it explicitly.
    const code = (codeOverride ?? editableSetCode).trim().toUpperCase()
    if (!code) {
      setSuggestable(false)
      return
    }
    const known = await isSetCodeInIndex(code)
    setSuggestable(!known)
  }

  async function handleSuggest() {
    if (!authUser) {
      loginWithGoogle()
      return
    }
    const code = editableSetCode.trim().toUpperCase()
    if (!code) return
    setSuggestLoading(true)
    setSuggestMsg(null)
    const result = await suggestSetCode({
      setCode: code,
      passcode: passcode || undefined,
      cardName: cardNameJa ?? cardName ?? '',
      rarity: rarity || undefined,
      language: language || undefined,
    })
    setSuggestLoading(false)
    if (result.ok) {
      setSuggestMsg('Submitted for review. Thank you!')
      setSuggestable(false)
    } else {
      setSuggestMsg(result.error ?? 'Failed to submit')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() && !manualMode) return

    const finalName = manualMode ? manualName : cardName
    if (!finalName && !manualMode) {
      setError('Please search for a valid card first or switch to manual mode.')
      return
    }

    const finalSetCode = editableSetCode.trim()
    if (finalSetCode && !validateSetCode(finalSetCode)) {
      setSetCodeError('Invalid set code format. Expected: XXX-XX000')
      return
    }

    const finalPasscode = passcode
    const finalPrice = cardPrices ? cardPrices[`${selectedPriceSource}_price` as keyof CardPrices] : undefined
    await addCollectionItem({
      passcode: finalPasscode,
      name: finalName || finalPasscode,
      nameJa: cardNameJa ?? undefined,
      setCode: finalSetCode || input.trim(),
      language,
      rarity: rarity || 'Unknown',
      quantity,
      memo,
      imageUrl,
      price: finalPrice,
      priceSource: finalPrice ? selectedPriceSource : undefined,
      priceCurrency: finalPrice ? 'USD' : undefined,
    })

    const items = await getAllCollectionItems()
    setCollection(items)

    setInput('')
    setQuantity(1)
    setLanguage('JP')
    setRarity('')
    setMemo('')
    setCardName(null)
    setCardNameJa(null)
    setImageUrl(null)
    setPasscode('')
    setAvailableSets([])
    setPackRarityKeys(null)
    setManualMode(false)
    setManualName('')
    setEditableSetCode('')
    setSetCodeError(null)
    setCardPrices(null)
    onAdded?.()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Search by</label>
            <div className="flex gap-2">
              {SEARCH_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setSearchType(type.value)}
                  className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                    searchType === type.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => {
                const raw = e.target.value
                setInput(searchType === 'code' ? autoFormatSetCode(raw) : raw)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleSearch()
                }
              }}
              placeholder={currentSearchType?.placeholder}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => void handleSearch()}
              disabled={loading || !input.trim()}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {searchType === 'code' && 'Auto-detects set code (e.g. LOB-EN001) or passcode (8 digits).'}
            {searchType === 'cardName' && 'Enter the exact card name.'}
          </p>
        </div>

        {error && (
          <div className="md:col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            {error}
            {!manualMode && (
              <button
                type="button"
                onClick={() => setManualMode(true)}
                className="ml-2 underline hover:text-red-800"
              >
                Add manually
              </button>
            )}
          </div>
        )}

        {manualMode && (
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Card Name (Manual)</label>
            <input
              type="text"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="Enter card name"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {cardName && (
          <div className="md:col-span-2 flex items-center gap-4 bg-blue-50 border border-blue-100 rounded-lg p-3">
            {imageUrl && <img src={imageUrl} alt={cardName} className="w-16 h-24 object-contain rounded" />}
            <div>
              <p className="font-semibold text-gray-900">
                {language === 'JP' && cardNameJa ? cardNameJa : cardName}
              </p>
              <p className="text-xs text-gray-500">Passcode: {passcode || '—'}</p>
            </div>
          </div>
        )}

        {suggestable && (
          <div className="md:col-span-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm text-amber-900 font-medium">
              This set code ({editableSetCode.toUpperCase()}) is not in our database yet.
            </p>
            <p className="text-xs text-amber-700 mt-1">
              {authUser
                ? 'Submit this mapping for review by an administrator.'
                : 'Log in with Google to submit this mapping for review.'}
            </p>
            <div className="mt-2">
              <label className="block text-xs font-medium text-amber-800 mb-1">
                Passcode of the card printed with this set code
              </label>
              <input
                type="text"
                value={passcode}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
                  setPasscode(digits)
                  // Whenever the user enters a valid passcode, look the card up
                  // so the preview (name, artwork, rarity) reflects the mapping
                  // they are about to submit. Guard against out-of-order
                  // responses when the user keeps typing.
                  if (/^\d{5,10}$/.test(digits)) {
                    const requested = digits
                    void fetchCardByPasscode(requested).then((card) => {
                      if (card && passcodeRef.current === requested) {
                        setCardName(card.name)
                        setImageUrl(card.imageUrl)
                        setCardPrices(card.prices || null)
                        const matched = card.sets.find((s) => s.setCode.toUpperCase() === editableSetCode.toUpperCase())
                        if (matched) setRarity(matched.rarity)
                      }
                    })
                  }
                }}
                onKeyDown={(e) => {
                  // Enter inside the review passcode field submits the review
                  // (and must not fall through to "Add to Collection").
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleSuggest()
                  }
                }}
                placeholder="e.g. 49238328"
                className="w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={handleSuggest}
                disabled={suggestLoading}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {suggestLoading ? 'Submitting…' : authUser ? 'Submit for review' : 'Log in to submit'}
              </button>
              {suggestMsg && <span className="text-xs text-amber-800">{suggestMsg}</span>}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Card Set Code (Editable)</label>
          <input
            type="text"
            value={editableSetCode}
            onChange={(e) => handleSetCodeChange(e.target.value)}
            placeholder="e.g. AGOV-JP001"
            className={`w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              setCodeError ? 'border-red-300 bg-red-50' : 'border-gray-300'
            }`}
          />
          {setCodeError && <p className="text-xs text-red-600 mt-1">{setCodeError}</p>}
          <p className="text-xs text-gray-500 mt-1">You can edit the set code before saving.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Language / Version</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as CardLanguage)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Rarity</label>
          <select
            value={rarity}
            onChange={(e) => setRarity(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select rarity</option>
            {filteredRarityOptions.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {cardPrices && (
          <div className="md:col-span-2 bg-green-50 border border-green-200 rounded-lg p-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Card Price</label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Source:</span>
                <select
                  value={selectedPriceSource}
                  onChange={(e) => setSelectedPriceSource(e.target.value as 'tcgplayer' | 'cardmarket' | 'ebay' | 'amazon' | 'coolstuffinc')}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="tcgplayer">TCGPlayer</option>
                  <option value="cardmarket">CardMarket</option>
                  <option value="ebay">eBay</option>
                  <option value="amazon">Amazon</option>
                  <option value="coolstuffinc">CoolStuffInc</option>
                </select>
              </div>
              <p className="text-lg font-bold text-green-700">
                ${cardPrices[`${selectedPriceSource}_price` as keyof CardPrices]?.toFixed(2) || 'N/A'}
              </p>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Memo</label>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Optional note"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={(!manualMode && !cardName && !input.trim()) || (manualMode && !manualName) || !!setCodeError}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          Add to Collection
        </button>
      </div>
    </form>
  )
}
