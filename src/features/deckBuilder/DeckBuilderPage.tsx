import { SearchIcon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getDeck, getAllCollectionItems, updateDeck } from '../../services/storage.ts'
import { buildCardCatalog, isExtraDeckCard } from '../../services/cardCatalog.ts'
import { getRelatedCards, type CardLinksEntry } from '../../services/cardLinks.ts'
import { RARITIES, type Deck, type DeckCard, type DeckSection } from '../../types/index.ts'

/** Short display label for a rarity code, e.g. "UR" -> "金閃". */
function shortRarityLabel(code: string): string {
  const found = RARITIES.find((r) => r.code === code)
  return found ? found.twName : code
}

/**
 * Renders a card thumbnail directly from the small image URL. YGOPRODECK
 * serves these with a 31-day Cache-Control header, so the browser HTTP cache
 * makes repeat visits (and scrolling back up) instant without any extra work.
 * `loading="lazy"` ensures only the thumbnails actually visible are fetched.
 */
function CardThumb({ smallUrl, alt, className }: { smallUrl: string | null; alt: string; className: string }) {
  if (!smallUrl) {
    return <div className={`${className} bg-gray-100 flex items-center justify-center text-[9px] text-gray-400 p-1 text-center`}>No image</div>
  }
  return <img src={smallUrl} alt={alt} loading="lazy" className={className} draggable={false} />
}

const SECTIONS: { section: DeckSection; label: string; limit: number }[] = [
  { section: 'MAIN', label: '主牌組', limit: 60 },
  { section: 'EXTRA', label: '額外牌組', limit: 15 },
  { section: 'SIDE', label: '備編牌組', limit: 15 },
]

const ATTRIBUTES = ['FIRE', 'WATER', 'EARTH', 'WIND', 'LIGHT', 'DARK', 'DIVINE']
const TYPES = ['Monster', 'Spell', 'Trap']

interface PoolEntry {
  passcode: string
  name: string
  type: string
  frameType: string
  race: string
  level: number | null
  attribute: string
  imageUrl: string | null
  imageUrlSmall: string | null
}

export function DeckBuilderPage() {
  const { deckId } = useParams<{ deckId: string }>()
  const navigate = useNavigate()

  const [deck, setDeck] = useState<Deck | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [catalog, setCatalog] = useState<Map<string, PoolEntry> | null>(null)
  // passcode -> { total copies owned, breakdown by rarity }
  const [owned, setOwned] = useState<Map<string, { total: number; byRarity: Map<string, number> }>>(new Map())

  // Pool filters
  const [poolTab, setPoolTab] = useState<'all' | 'owned'>('all')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [attrFilter, setAttrFilter] = useState('')

  // Selection for the detail panel
  const [selected, setSelected] = useState<{ entry: PoolEntry; desc: string } | null>(null)
  const [descLoading, setDescLoading] = useState(false)
  // Related-card links for the currently selected card.
  const [related, setRelated] = useState<CardLinksEntry | null>(null)

  useEffect(() => {
    void (async () => {
      if (!deckId) {
        setNotFound(true)
        return
      }
      const d = await getDeck(deckId)
      if (!d) {
        setNotFound(true)
        return
      }
      setDeck(d)
      void buildCardCatalog().then(setCatalog)
      void getAllCollectionItems().then((items) => {
        const map = new Map<string, { total: number; byRarity: Map<string, number> }>()
        for (const item of items) {
          const entry = map.get(item.passcode) ?? { total: 0, byRarity: new Map<string, number>() }
          entry.total += item.quantity
          entry.byRarity.set(item.rarity, (entry.byRarity.get(item.rarity) ?? 0) + item.quantity)
          map.set(item.passcode, entry)
        }
        setOwned(map)
      })
    })()
  }, [deckId])

  const persist = useCallback(
    (cards: DeckCard[]) => {
      setDeck((current) => {
        if (!current || !deckId) return current
        const updated = { ...current, cards }
        void updateDeck(deckId, { cards }).then((saved) => {
          if (saved) setDeck(saved)
        })
        return updated
      })
    },
    [deckId],
  )

  const addToSection = useCallback(
    (entry: PoolEntry, section: DeckSection) => {
      const passcode = entry.passcode
      setDeck((current) => {
        if (!current) return current
        const cards = [...current.cards]
        const existing = cards.find((c) => c.passcode === passcode && c.section === section)
        // A card is limited to 3 copies per section.
        const currentQty = existing?.quantity ?? 0
        if (currentQty >= 3) return current
        if (existing) {
          existing.quantity += 1
        } else {
          cards.push({
            passcode,
            name: entry.name || entry.passcode,
            quantity: 1,
            section,
            imageUrl: entry.imageUrl ?? null,
          })
        }
        persist(cards)
        return { ...current, cards }
      })
    },
    [persist],
  )

  const removeFromSection = useCallback(
    (passcode: string, section: DeckSection) => {
      setDeck((current) => {
        if (!current) return current
        const cards = [...current.cards]
        const idx = cards.findIndex((c) => c.passcode === passcode && c.section === section)
        if (idx === -1) return current
        const existing = cards[idx]
        if (existing.quantity > 1) {
          existing.quantity -= 1
        } else {
          cards.splice(idx, 1)
        }
        persist(cards)
        return { ...current, cards }
      })
    },
    [persist],
  )

  const handleDrop = useCallback(
    (section: DeckSection) => (e: React.DragEvent) => {
      e.preventDefault()
      const raw = e.dataTransfer.getData('application/x-ygo-card')
      if (!raw) return
      try {
        const entry = JSON.parse(raw) as PoolEntry
        addToSection(entry, section)
      } catch {
        // ignore malformed payload
      }
    },
    [addToSection],
  )

  const sectionCards = useMemo(() => {
    const map = new Map<DeckSection, DeckCard[]>()
    for (const { section } of SECTIONS) map.set(section, [])
    for (const card of deck?.cards ?? []) {
      map.get(card.section)?.push(card)
    }
    return map
  }, [deck])

  const filteredPool = useMemo(() => {
    if (!catalog) return []
    const term = search.trim().toLowerCase()
    const rows: PoolEntry[] = []
    for (const entry of catalog.values()) {
      if (poolTab === 'owned' && !owned.has(entry.passcode)) continue
      if (typeFilter === 'Monster' && !/Monster/i.test(entry.type)) continue
      if (typeFilter === 'Spell' && !/Spell/i.test(entry.type)) continue
      if (typeFilter === 'Trap' && !/Trap/i.test(entry.type)) continue
      if (attrFilter && entry.attribute.toUpperCase() !== attrFilter) continue
      if (term && !entry.name.toLowerCase().includes(term)) continue
      rows.push(entry)
    }
    rows.sort((a, b) => a.name.localeCompare(b.name))
    return rows
  }, [catalog, poolTab, owned, search, typeFilter, attrFilter])

  const selectCard = useCallback(async (entry: PoolEntry) => {
    setSelected((current) => (current?.entry.passcode === entry.passcode ? current : { entry, desc: '' }))
    setDescLoading(true)
    setRelated(null)
    void getRelatedCards(entry.passcode).then(setRelated)
    try {
      const resp = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${entry.passcode}`)
      if (resp.ok) {
        const json = (await resp.json()) as { data?: { desc?: string }[] }
        const desc = json.data?.[0]?.desc ?? ''
        setSelected((current) => (current?.entry.passcode === entry.passcode ? { entry, desc } : current))
      }
    } catch {
      // description unavailable; keep the entry without text
    } finally {
      setDescLoading(false)
    }
  }, [])

  const addRelatedCard = useCallback(
    (passcode: string) => {
      const entry = catalog?.get(passcode)
      if (!entry) return
      addToSection(entry, isExtraDeckCard(entry) ? 'EXTRA' : 'MAIN')
    },
    [catalog, addToSection],
  )

  const relatedGroups = useMemo(() => {
    if (!related || !catalog) return []
    const groups: { label: string; entries: PoolEntry[] }[] = []
    if (related.sameArchetype.length > 0) {
      groups.push({
        label: related.archetype ? `同系列：${related.archetype}` : '同系列',
        entries: related.sameArchetype.map((p) => catalog.get(p)).filter((e): e is PoolEntry => Boolean(e)),
      })
    }
    if (related.mentionedBy.length > 0) {
      groups.push({
        label: '效果支援此卡',
        entries: related.mentionedBy.map((p) => catalog.get(p)).filter((e): e is PoolEntry => Boolean(e)),
      })
    }
    if (related.mentions.length > 0) {
      groups.push({
        label: '此卡效果提及',
        entries: related.mentions.map((p) => catalog.get(p)).filter((e): e is PoolEntry => Boolean(e)),
      })
    }
    return groups.filter((g) => g.entries.length > 0)
  }, [related, catalog])

  if (notFound) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Deck not found.</p>
        <button
          type="button"
          onClick={() => navigate('/decks')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Back to Decks
        </button>
      </div>
    )
  }

  if (!deck || !catalog) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-gray-400">Loading deck…</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{deck.name}</h1>
          <p className="text-sm text-gray-500">Drag cards from the pool into your deck. Changes save automatically.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/decks')}
          className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
        >
          ← Back to Decks
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_380px] gap-4 items-start">
        {/* Left: card detail */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sticky top-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">卡片資訊</h2>
          {selected ? (
            <div className="space-y-3">
              {selected.entry.imageUrl ? (
                <img
                  src={selected.entry.imageUrl}
                  alt={selected.entry.name}
                  className="w-full rounded-lg"
                  draggable={false}
                />
              ) : (
                <div className="w-full h-40 bg-gray-100 rounded-lg flex items-center justify-center text-xs text-gray-400">
                  No image
                </div>
              )}
              <div>
                <p className="font-semibold text-gray-900">{selected.entry.name}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {[selected.entry.type, selected.entry.race, selected.entry.attribute, selected.entry.level ? `★${selected.entry.level}` : '']
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="text-xs text-gray-700 leading-relaxed max-h-64 overflow-y-auto">
                {descLoading ? 'Loading description…' : selected.desc || 'No description available.'}
              </div>

              {relatedGroups.length > 0 && (
                <div className="border-t border-gray-100 pt-3">
                  <h3 className="text-xs font-semibold text-gray-700 mb-2">相關卡片</h3>
                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {relatedGroups.map((group) => (
                      <div key={group.label}>
                        <p className="text-[10px] text-gray-400 mb-1">{group.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {group.entries.map((entry) => (
                            <button
                              key={entry.passcode}
                              type="button"
                              onClick={() => addRelatedCard(entry.passcode)}
                              onDoubleClick={() => selectCard(entry)}
                              title={`${entry.name} — click to add, double-click for details`}
                              className="relative rounded overflow-hidden group w-10 shrink-0"
                            >
                              {entry.imageUrlSmall ? (
                                <img
                                  src={entry.imageUrlSmall}
                                  alt={entry.name}
                                  loading="lazy"
                                  className="w-full aspect-[3/4] object-contain bg-slate-100"
                                  draggable={false}
                                />
                              ) : (
                                <div className="w-full aspect-[3/4] bg-gray-100 flex items-center justify-center text-[7px] text-gray-400 p-0.5 text-center">
                                  {entry.name}
                                </div>
                              )}
                              <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-xs text-gray-400">
              Select a card to see its details.
            </div>
          )}
        </div>

        {/* Center: build zones */}
        <div className="space-y-4">
          {(() => {
            // Tracks how many copies of each card have been placed so far
            // (across all zones) so copies beyond what the user owns render
            // in grayscale.
            const placedCount = new Map<string, number>()
            return SECTIONS.map(({ section, label, limit }) => {
              const cards = sectionCards.get(section) ?? []
              const total = cards.reduce((sum, c) => sum + c.quantity, 0)
              const isMain = section === 'MAIN'
              const warn = isMain && (total < 40 || total > limit)
            return (
              <div
                key={section}
                className={`rounded-xl border-2 p-4 bg-slate-900 border-slate-700 ${
                  warn ? 'border-amber-500' : ''
                }`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop(section)}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-white">{label}</h3>
                  <span className={`text-sm ${warn ? 'text-amber-400' : 'text-slate-400'}`}>
                    {total}/{isMain ? 60 : limit}
                    {isMain && total < 40 && <span className="ml-2 text-amber-400">(min 40)</span>}
                  </span>
                </div>
                {cards.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center border border-dashed border-slate-700 rounded-lg">
                    Drop cards here
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {cards.flatMap((card) =>
                      Array.from({ length: card.quantity }, (_, i) => {
                        const placed = placedCount.get(card.passcode) ?? 0
                        placedCount.set(card.passcode, placed + 1)
                        const ownedTotal = owned.get(card.passcode)?.total ?? 0
                        // Copies beyond what the user owns are shown grayscale.
                        const insufficient = placed >= ownedTotal
                        return (
                          <button
                            key={`${card.passcode}-${card.section}-${i}`}
                            type="button"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData(
                                'application/x-ygo-remove',
                                JSON.stringify({ passcode: card.passcode, section: card.section }),
                              )
                              e.dataTransfer.effectAllowed = 'copyMove'
                            }}
                            onDragEnd={(e) => {
                              // Dragging a card out of the deck (no valid drop
                              // target) removes one copy.
                              if (e.dataTransfer.dropEffect === 'none') {
                                removeFromSection(card.passcode, card.section)
                              }
                            }}
                            onClick={() => removeFromSection(card.passcode, card.section)}
                            title={`${card.name} — click or drag out to remove${insufficient ? ' (not owned)' : ''}`}
                            className="relative rounded overflow-hidden group w-12 shrink-0"
                          >
                            {card.imageUrl ? (
                              <img
                                src={card.imageUrl}
                                alt={card.name}
                                className={`w-full aspect-[3/4] object-contain bg-slate-800 ${insufficient ? 'grayscale opacity-60' : ''}`}
                                draggable={false}
                              />
                            ) : (
                              <div
                                className={`w-full aspect-[3/4] bg-slate-800 flex items-center justify-center text-[8px] text-slate-500 p-0.5 text-center ${
                                  insufficient ? 'opacity-50' : ''
                                }`}
                              >
                                {card.name}
                              </div>
                            )}
                            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors" />
                          </button>
                        )
                      }),
                    )}
                  </div>
                )}
              </div>
            )
            })
          })()}
        </div>

        {/* Right: card pool */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">卡片池</h2>

          <div className="flex gap-1 mb-3">
            <button
              type="button"
              onClick={() => setPoolTab('all')}
              className={`flex-1 px-2 py-1.5 text-xs rounded-lg ${
                poolTab === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              所有卡片
            </button>
            <button
              type="button"
              onClick={() => setPoolTab('owned')}
              className={`flex-1 px-2 py-1.5 text-xs rounded-lg ${
                poolTab === 'owned' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              擁有的卡片
            </button>
          </div>

          <div className="relative mb-2">
            <SearchIcon className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋卡片名稱"
              className="w-full rounded-lg border border-gray-300 pl-8 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex gap-2 mb-3">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部類型</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={attrFilter}
              onChange={(e) => setAttrFilter(e.target.value)}
              className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部屬性</option>
              {ATTRIBUTES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <p className="text-xs text-gray-400 mb-2">{filteredPool.length} 張卡片</p>

          <div className="grid grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto pr-1">
            {filteredPool.map((entry) => {
              const ownedInfo = owned.get(entry.passcode)
              const rarityRows = ownedInfo ? [...ownedInfo.byRarity.entries()].sort((a, b) => b[1] - a[1]) : []
              return (
                <button
                  key={entry.passcode}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-ygo-card', JSON.stringify(entry))
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => selectCard(entry)}
                  onDoubleClick={() => addToSection(entry, isExtraDeckCard(entry) ? 'EXTRA' : 'MAIN')}
                  className="rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all text-left"
                  title={entry.name}
                >
                  <CardThumb
                    smallUrl={entry.imageUrlSmall}
                    alt={entry.name}
                    className="w-full aspect-[3/4] object-contain bg-slate-100"
                  />
                  <div className="px-1 py-0.5">
                    <p className="text-[10px] text-gray-700 truncate">{entry.name}</p>
                    {ownedInfo && ownedInfo.total > 0 ? (
                      <p className="text-[9px] text-green-700 font-medium mt-0.5">擁有 ×{ownedInfo.total}</p>
                    ) : (
                      <p className="text-[9px] text-gray-400 mt-0.5">未擁有</p>
                    )}
                    {rarityRows.length > 0 && (
                      <p className="text-[9px] text-gray-500 mt-0.5 truncate">
                        {rarityRows.slice(0, 3).map(([rarity, qty]) => `${shortRarityLabel(rarity)}×${qty}`).join(' · ')}
                        {rarityRows.length > 3 && ' …'}
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
            {filteredPool.length === 0 && (
              <p className="col-span-3 text-xs text-gray-400 py-8 text-center">No cards match your filters.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}