import { PencilIcon, RefreshCw, Search, TrashIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EmptyState } from '../../components/ui/EmptyState.tsx'
import { autoFormatSetCode, displayName, fetchPriceForItem, preloadCollectionCards, refreshCardInfo, validateSetCode } from '../../services/cardApi.ts'
import { USD_TO_TWD, buildRutenSearchUrl, formatPrice, rarityKeyword, rarityOverFrameKeyword } from '../../services/price.ts'
import { fetchRutenLowestPrice } from '../../services/ruten.ts'
import { deleteCollectionItem, getAllCollectionItems, updateCollectionItem } from '../../services/storage.ts'
import { SORT_OPTIONS, sortCollection, type SortOption } from '../../services/sort.ts'
import { useAppStore } from '../../stores/appStore.ts'
import { RARITIES, type CardLanguage, type CollectionItem } from '../../types/index.ts'

const LANGUAGE_LABELS: Record<CardLanguage, string> = {
  JP: 'JP',
  AE: 'AE',
  EN: 'EN',
  OTHER: 'Other',
}

export function CollectionList() {
  const { collection, setCollection, settings } = useAppStore()
  const [search, setSearch] = useState('')
  const [languageFilter, setLanguageFilter] = useState<CardLanguage | 'ALL'>('ALL')
  const [rarityFilter, setRarityFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQuantity, setEditQuantity] = useState(1)
  const [editMemo, setEditMemo] = useState('')
  const [editSetCode, setEditSetCode] = useState('')
  const [editSetCodeError, setEditSetCodeError] = useState<string | null>(null)
  const [editRarity, setEditRarity] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('default')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshProgress, setRefreshProgress] = useState<{ done: number; total: number } | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [researchedId, setResearchedId] = useState<string | null>(null)
  const [isResearching, setIsResearching] = useState(false)
  const [researchProgress, setResearchProgress] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => {
    getAllCollectionItems().then(setCollection)
  }, [setCollection])

  // Background-preload card data for the collection so repeat queries hit cache.
  const preloadedRef = useRef(false)
  useEffect(() => {
    if (!collection.length || preloadedRef.current) return
    preloadedRef.current = true
    const items = collection.map((c) => ({ passcode: c.passcode, setCode: c.setCode }))
    void preloadCollectionCards(items)
  }, [collection])

  // Inventory check: when admin-approved set code mappings exist, compare them
  // against the collection to surface cards whose passcode looks wrong.
  const [inventoryWarnings, setInventoryWarnings] = useState<string[]>([])
  const warningsCheckedRef = useRef(false)
  useEffect(() => {
    if (!collection.length || warningsCheckedRef.current) return
    warningsCheckedRef.current = true
    let cancelled = false
    void (async () => {
      try {
        const resp = await fetch('/api/sets/approved', { credentials: 'same-origin' })
        if (!resp.ok) return
        const json = (await resp.json()) as { sets?: Record<string, { passcode?: string; name?: string }> }
        const approved = json.sets ?? {}
        if (cancelled || Object.keys(approved).length === 0) return
        const warnings: string[] = []
        for (const item of collection) {
          const match = approved[item.setCode.toUpperCase()]
          if (match?.passcode && match.passcode !== item.passcode) {
            warnings.push(
              `${item.setCode}: stored passcode ${item.passcode} but database says ${match.passcode} (${match.name ?? ''}). Use "Re-search card info" to fix.`,
            )
          }
        }
        setInventoryWarnings(warnings)
      } catch {
        // non-fatal
      }
    })()
    return () => {
      cancelled = true
    }
  }, [collection])

  const filtered = useMemo(() => {
    return collection.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.setCode.toLowerCase().includes(search.toLowerCase()) ||
        item.passcode.includes(search)
      const matchesLang = languageFilter === 'ALL' || item.language === languageFilter
      const matchesRarity = !rarityFilter || item.rarity.toLowerCase().includes(rarityFilter.toLowerCase())
      return matchesSearch && matchesLang && matchesRarity
    })
  }, [collection, search, languageFilter, rarityFilter])

  const sorted = useMemo(() => {
    return sortCollection(filtered, sortBy)
  }, [filtered, sortBy])

  const totalQuantity = useMemo(() => {
    return sorted.reduce((sum, item) => sum + item.quantity, 0)
  }, [sorted])

  const totalValue = useMemo(() => {
    const currency = settings?.currency ?? 'TWD'
    return sorted.reduce((sum, item) => {
      const inCurrency =
        (item.priceCurrency ?? 'USD') === currency
          ? item.price ?? 0
          : (item.priceCurrency ?? 'USD') === 'USD'
            ? (item.price ?? 0) * USD_TO_TWD
            : (item.price ?? 0) / USD_TO_TWD
      return sum + inCurrency * item.quantity
    }, 0)
  }, [sorted, settings?.currency])

  const rarityLabel = (code: string) => {
    const found = RARITIES.find((r) => r.code === code)
    return found ? found.label : code
  }

  async function refreshSingleItem(item: CollectionItem): Promise<boolean> {
    // Manually entered prices are never overwritten by auto-refresh.
    if (item.priceSource === 'manual') return false
    const priority = settings?.pricePriority ?? 'ruten'
    const kw = rarityKeyword(item.rarity)
    const overFrameKw = rarityOverFrameKeyword(item.rarity)
    const parts = [item.setCode]
    if (kw) parts.push(kw)
    if (overFrameKw) parts.push(overFrameKw)
    const keyword = parts.join(' ')

    if (priority === 'ruten') {
      const ruten = await fetchRutenLowestPrice(keyword)
      if (ruten && ruten.price !== item.price) {
        await updateCollectionItem(item.id, { price: ruten.price, priceSource: 'ruten', priceCurrency: 'TWD' })
        return true
      }
      if (!ruten) {
        const latest = await fetchPriceForItem(item)
        if (latest != null && latest !== item.price) {
          await updateCollectionItem(item.id, { price: latest, priceSource: 'tcgplayer', priceCurrency: 'USD' })
          return true
        }
      }
      return false
    } else {
      const latest = await fetchPriceForItem(item)
      if (latest != null && latest !== item.price) {
        await updateCollectionItem(item.id, { price: latest, priceSource: 'tcgplayer', priceCurrency: 'USD' })
        return true
      }
      const ruten = await fetchRutenLowestPrice(keyword)
      if (ruten && ruten.price !== item.price) {
        await updateCollectionItem(item.id, { price: ruten.price, priceSource: 'ruten', priceCurrency: 'TWD' })
        return true
      }
      return false
    }
  }

  async function handleRefreshPrices() {
    if (!collection.length || isRefreshing) return
    setIsRefreshing(true)
    setRefreshProgress({ done: 0, total: collection.length })
    setRefreshError(null)
    let updated = 0
    for (let i = 0; i < collection.length; i++) {
      const item = collection[i]
      try {
        const changed = await refreshSingleItem(item)
        if (changed) updated++
      } catch (err) {
        setRefreshError(err instanceof Error ? err.message : 'Refresh failed')
      }
      setRefreshProgress({ done: i + 1, total: collection.length })
      if (i < collection.length - 1) {
        await new Promise((r) => setTimeout(r, 60))
      }
    }
    const fresh = await getAllCollectionItems()
    setCollection(fresh)
    setIsRefreshing(false)
    setRefreshProgress(null)
    if (updated === 0 && !refreshError) {
      setRefreshError(null)
    }
  }

  async function handleRefreshItem(id: string) {
    if (refreshingId) return
    const item = collection.find((c) => c.id === id)
    if (!item) return
    setRefreshingId(id)
    setRefreshError(null)
    try {
      await refreshSingleItem(item)
      const fresh = await getAllCollectionItems()
      setCollection(fresh)
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : 'Refresh failed')
    } finally {
      setRefreshingId(null)
    }
  }

  async function handleResearchInfo(id: string) {
    if (researchedId) return
    const item = collection.find((c) => c.id === id)
    if (!item) return
    setResearchedId(id)
    setRefreshError(null)
    try {
      const fresh = await refreshCardInfo(item.setCode, item.passcode)
      if (fresh) {
        const changes: Partial<CollectionItem> = { name: fresh.name }
        if (fresh.nameJa) changes.nameJa = fresh.nameJa
        if (fresh.passcode) changes.passcode = fresh.passcode
        // JP cards prefer the official OCG artwork.
        const bestImage = item.language === 'JP' ? fresh.imageUrlJa ?? fresh.imageUrl : fresh.imageUrl
        if (bestImage) changes.imageUrl = bestImage
        await updateCollectionItem(id, changes)
      }
      const updated = await getAllCollectionItems()
      setCollection(updated)
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : 'Re-search failed')
    } finally {
      setResearchedId(null)
    }
  }

  async function handleResearchAll() {
    if (!collection.length || isResearching || isRefreshing) return
    setIsResearching(true)
    setResearchProgress({ done: 0, total: collection.length })
    setRefreshError(null)
    let updated = 0
    for (let i = 0; i < collection.length; i++) {
      const item = collection[i]
      try {
        const fresh = await refreshCardInfo(item.setCode, item.passcode)
        if (fresh) {
          const changes: Partial<CollectionItem> = { name: fresh.name }
          if (fresh.nameJa && fresh.nameJa !== item.nameJa) changes.nameJa = fresh.nameJa
          if (fresh.passcode && fresh.passcode !== item.passcode) changes.passcode = fresh.passcode
          const bestImage = item.language === 'JP' ? fresh.imageUrlJa ?? fresh.imageUrl : fresh.imageUrl
          if (bestImage && bestImage !== item.imageUrl) changes.imageUrl = bestImage
          await updateCollectionItem(item.id, changes)
          updated++
        }
      } catch (err) {
        setRefreshError(err instanceof Error ? err.message : 'Re-search failed')
      }
      setResearchProgress({ done: i + 1, total: collection.length })
    }
    const fresh = await getAllCollectionItems()
    setCollection(fresh)
    setIsResearching(false)
    setResearchProgress(null)
    if (updated === 0 && !refreshError) {
      setRefreshError(null)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this item?')) return
    await deleteCollectionItem(id)
    setCollection(await getAllCollectionItems())
  }

  function startEdit(item: CollectionItem) {
    setEditingId(item.id)
    setEditQuantity(item.quantity)
    setEditMemo(item.memo || '')
    setEditSetCode(item.setCode)
    setEditSetCodeError(null)
    setEditRarity(item.rarity)
    setEditPrice(item.price != null ? String(item.price) : '')
  }

  function handleEditSetCodeChange(value: string) {
    const formatted = autoFormatSetCode(value)
    setEditSetCode(formatted)
    if (formatted && !validateSetCode(formatted)) {
      setEditSetCodeError('Invalid set code format. Expected: XXX-XX000')
    } else {
      setEditSetCodeError(null)
    }
  }

  async function saveEdit(id: string) {
    if (editSetCode && !validateSetCode(editSetCode)) {
      setEditSetCodeError('Invalid set code format. Expected: XXX-XX000')
      return
    }
    const changes: Partial<CollectionItem> = {
      quantity: editQuantity,
      memo: editMemo,
      setCode: editSetCode,
      rarity: editRarity,
    }
    // Manually entered price (empty clears it back to auto). Currency is TWD to
    // match Ruten prices; users can still switch display currency via settings.
    const trimmedPrice = editPrice.trim()
    if (trimmedPrice === '') {
      changes.price = undefined
      changes.priceSource = undefined
      changes.priceCurrency = undefined
    } else {
      const price = Number(trimmedPrice)
      if (Number.isFinite(price) && price > 0) {
        changes.price = price
        changes.priceSource = 'manual'
        changes.priceCurrency = 'TWD'
      }
    }
    await updateCollectionItem(id, changes)
    setCollection(await getAllCollectionItems())
    setEditingId(null)
    setEditSetCode('')
    setEditSetCodeError(null)
    setEditRarity('')
    setEditPrice('')
  }

  if (!collection.length) {
    return (
      <EmptyState
        title="No cards yet"
        description="Add your first card to start tracking your collection."
      />
    )
  }

  return (
    <div className="space-y-4">
      {inventoryWarnings.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-red-800">Inventory data mismatch detected</p>
          <ul className="mt-2 space-y-1">
            {inventoryWarnings.map((w) => (
              <li key={w} className="text-xs text-red-700">{w}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-gray-200">
        <input
          type="text"
          placeholder="Search name / set code / passcode"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={languageFilter}
          onChange={(e) => setLanguageFilter(e.target.value as CardLanguage | 'ALL')}
          className="rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="ALL">All Languages</option>
          <option value="JP">JP</option>
          <option value="AE">AE</option>
          <option value="EN">EN</option>
          <option value="OTHER">Other</option>
        </select>
        <select
          value={rarityFilter}
          onChange={(e) => setRarityFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Rarities</option>
          {RARITIES.map((r) => (
            <option key={r.code} value={r.code}>
              {r.label}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-gray-500">
          Showing {sorted.length} of {collection.length} items · Sorted by {SORT_OPTIONS.find((o) => o.value === sortBy)?.label}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleResearchAll()}
            disabled={isResearching || isRefreshing || !collection.length}
            className="shrink-0 px-3 py-1.5 text-sm bg-white border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 disabled:opacity-50"
          >
            {isResearching && researchProgress ? `Re-searching ${researchProgress.done}/${researchProgress.total}…` : 'Re-search all'}
          </button>
          <button
            type="button"
            onClick={handleRefreshPrices}
            disabled={isRefreshing || isResearching || !collection.length}
            className="shrink-0 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {isRefreshing && refreshProgress ? `Refreshing ${refreshProgress.done}/${refreshProgress.total}…` : 'Refresh prices'}
          </button>
        </div>
      </div>
      {refreshError && <p className="text-sm text-red-600">{refreshError}</p>}

      {totalValue > 0 || totalQuantity > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <span className="text-sm font-medium text-blue-800">Total Cards:</span>
            <span className="ml-2 text-xl font-bold text-blue-700">{totalQuantity}</span>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <span className="text-sm font-medium text-green-800">Total Collection Value:</span>
            <span className="ml-2 text-xl font-bold text-green-700">
              {formatPrice(totalValue, settings?.currency ?? 'TWD', settings?.currency ?? 'TWD')}
            </span>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((item) => (
          <div
            key={item.id}
            className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex gap-4"
          >
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={displayName(item)}
                className="w-20 h-28 object-contain rounded flex-shrink-0"
              />
            ) : (
              <div className="w-20 h-28 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-400 flex-shrink-0">
                No Image
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">{displayName(item)}</h3>
              <p className="text-xs text-gray-500 truncate">{item.setCode}</p>
              <p className="text-xs text-gray-500">Passcode: {item.passcode}</p>
              <div className="flex flex-wrap gap-2 mt-2 text-xs">
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                  {LANGUAGE_LABELS[item.language]}
                </span>
                <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded">{rarityLabel(item.rarity)}</span>
                {item.price && (
                  <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded">
                    {formatPrice(item.price, settings?.currency ?? 'TWD', item.priceCurrency ?? 'USD')}
                    {item.priceSource === 'ruten' && ' (Ruten)'}
                    {item.priceSource === 'manual' && ' (Manual)'}
                  </span>
                )}
              </div>
              <a
                href={buildRutenSearchUrl(item.setCode, item.rarity)}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-xs text-orange-600 hover:underline"
              >
                Search on Ruten
              </a>

              {editingId === item.id ? (
                <div className="mt-3 space-y-2">
                  <input
                    type="number"
                    min={1}
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(Math.max(1, Number(e.target.value)))}
                    className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                  <input
                    type="text"
                    value={editMemo}
                    onChange={(e) => setEditMemo(e.target.value)}
                    placeholder="Memo"
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                  <input
                    type="text"
                    value={editSetCode}
                    onChange={(e) => handleEditSetCodeChange(e.target.value)}
                    placeholder="Set Code"
                    className={`w-full rounded border px-2 py-1 text-sm ${
                      editSetCodeError ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    }`}
                  />
                  {editSetCodeError && <p className="text-xs text-red-600">{editSetCodeError}</p>}
                  <select
                    value={editRarity}
                    onChange={(e) => setEditRarity(e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  >
                    {RARITIES.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      placeholder="Price (leave empty = auto)"
                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                    <span className="text-xs text-gray-500">TWD</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => saveEdit(item.id)}
                      disabled={!!editSetCodeError}
                      className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null)
                        setEditSetCode('')
                        setEditSetCodeError(null)
                        setEditRarity('')
                        setEditPrice('')
                      }}
                      className="px-3 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm">Qty: {item.quantity}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleResearchInfo(item.id)}
                      disabled={researchedId === item.id || isRefreshing}
                      className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-50"
                      aria-label="Re-search card info"
                      title="Re-search card info (name, passcode, image)"
                    >
                      <Search className={`w-4 h-4 ${researchedId === item.id ? 'animate-pulse' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRefreshItem(item.id)}
                      disabled={refreshingId === item.id || isRefreshing}
                      className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                      aria-label="Refresh price"
                      title="Refresh this card's price"
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${refreshingId === item.id ? 'animate-spin' : ''}`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                      aria-label="Edit"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                      aria-label="Delete"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {item.memo && <p className="mt-2 text-xs text-gray-400 italic truncate">{item.memo}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
