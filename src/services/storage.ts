import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { AppSettings, Card, CardCacheEntry, CollectionItem, Deck } from '../types/index.ts'
import { DEFAULT_SETTINGS } from '../types/index.ts'

const DB_NAME = 'ygo-collection-db'
const DB_VERSION = 5

// Set while applying a cloud download so write-through sync doesn't loop.
let suppressSync = false

/** Exports whether the sync layer should suppress write-through uploads. */
export function setSyncSuppressed(value: boolean): void {
  suppressSync = value
}

/** Coarse-grained change signal for the cloud sync layer (dynamic import avoids a cycle). */
function notifyDataChanged(): void {
  if (suppressSync) return
  void import('./sync.ts').then(({ pushLocalToCloud }) => {
    void pushLocalToCloud()
  })
}

interface YgoDB extends DBSchema {
  collection: {
    key: string
    value: CollectionItem
    indexes: { 'by-passcode': string }
  }
  decks: {
    key: string
    value: Deck
    indexes: { 'by-name': string }
  }
  cache: {
    key: string
    value: CardCacheEntry
  }
  setCodeCache: {
    key: string
    value: SetCodeCacheEntry
  }
  ocgSets: {
    key: string
    value: { key: string; value: string[]; fetchedAt: number }
  }
  settings: {
    key: string
    value: { key: string; value: unknown }
  }
  cardImages: {
    key: string
    value: { passcode: string; blob: Blob; fetchedAt: number }
  }
}

interface SetCodeCacheEntry {
  setCode: string
  card: Card | null
  fetchedAt: number
}

let dbPromise: Promise<IDBPDatabase<YgoDB>> | null = null

function getDb(): Promise<IDBPDatabase<YgoDB>> {
  if (!dbPromise) {
    dbPromise = openDB<YgoDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const collectionStore = db.createObjectStore('collection', { keyPath: 'id' })
          collectionStore.createIndex('by-passcode', 'passcode')

          db.createObjectStore('decks', { keyPath: 'id' })

          db.createObjectStore('cache', { keyPath: 'passcode' })
        }
        if (oldVersion < 2) {
          db.createObjectStore('settings', { keyPath: 'key' })
        }
        if (oldVersion < 3) {
          db.createObjectStore('setCodeCache', { keyPath: 'setCode' })
        }
        if (oldVersion < 4) {
          db.createObjectStore('ocgSets', { keyPath: 'key' })
        }
        if (oldVersion < 5) {
          db.createObjectStore('cardImages', { keyPath: 'passcode' })
        }
      },
    })
  }
  return dbPromise
}

/** Normalizes a passcode to its canonical 8-digit form (see cardApi.normalizePasscode). */
function normalizeStoredPasscode(passcode: string): string {
  if (/^\d{1,7}$/.test(passcode)) return passcode.padStart(8, '0')
  return passcode
}

export async function getAllCollectionItems(): Promise<CollectionItem[]> {
  const db = await getDb()
  const items = await db.getAll('collection')

  // One-time repair: older entries may store passcodes without leading zeros
  // (YGOPRODECK returns them as JSON numbers). Canonicalize to 8 digits.
  let repaired = false
  for (const item of items) {
    const fixed = normalizeStoredPasscode(item.passcode)
    if (fixed !== item.passcode) {
      item.passcode = fixed
      repaired = true
    }
  }
  if (repaired) {
    const tx = db.transaction('collection', 'readwrite')
    for (const item of items) {
      await tx.store.put(item)
    }
    await tx.done
  }

  const groups = new Map<string, CollectionItem[]>()
  for (const item of items) {
    const key = `${item.passcode}|${item.setCode.toUpperCase()}|${item.language}|${item.rarity}`
    const list = groups.get(key) ?? []
    list.push(item)
    groups.set(key, list)
  }

  let needsMerge = false
  for (const list of groups.values()) {
    if (list.length > 1) {
      needsMerge = true
      break
    }
  }

  if (!needsMerge) {
    return items
  }

  const merged: CollectionItem[] = []
  for (const list of groups.values()) {
    if (list.length === 1) {
      merged.push(list[0])
      continue
    }
    const base = list.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b))
    const totalQuantity = list.reduce((sum, entry) => sum + entry.quantity, 0)
    const latestMemo = [...list].reverse().find((entry) => entry.memo)?.memo
    const latestImage = [...list].reverse().find((entry) => entry.imageUrl)?.imageUrl
    merged.push({
      ...base,
      quantity: totalQuantity,
      memo: latestMemo ?? base.memo,
      imageUrl: latestImage ?? base.imageUrl,
      updatedAt: Date.now(),
    })
  }

  const tx = db.transaction('collection', 'readwrite')
  const keepIds = new Set(merged.map((item) => item.id))
  for (const item of items) {
    if (!keepIds.has(item.id)) {
      await tx.store.delete(item.id)
    }
  }
  for (const item of merged) {
    await tx.store.put(item)
  }
  await tx.done

  return merged
}

function isSameCard(a: { passcode: string; setCode: string; language: string; rarity: string }, b: { passcode: string; setCode: string; language: string; rarity: string }): boolean {
  return (
    a.passcode === b.passcode &&
    a.setCode.toUpperCase() === b.setCode.toUpperCase() &&
    a.language === b.language &&
    a.rarity === b.rarity
  )
}

export async function addCollectionItem(item: Omit<CollectionItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<CollectionItem> {
  const db = await getDb()
  const all = await db.getAll('collection')
  const existing = all.find((entry) => isSameCard(entry, item))

  if (existing) {
    const now = Date.now()
    const updated: CollectionItem = {
      ...existing,
      quantity: existing.quantity + item.quantity,
      memo: item.memo ?? existing.memo,
      imageUrl: item.imageUrl ?? existing.imageUrl,
      createdAt: now,
      updatedAt: now,
    }
    await db.put('collection', updated)
    notifyDataChanged()
    return updated
  }

  const now = Date.now()
  const newItem: CollectionItem = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  }
  await db.add('collection', newItem)
  notifyDataChanged()
  return newItem
}

export async function updateCollectionItem(id: string, changes: Partial<Omit<CollectionItem, 'id' | 'createdAt'>>): Promise<CollectionItem | null> {
  const db = await getDb()
  const existing = await db.get('collection', id)
  if (!existing) return null

  const updated: CollectionItem = {
    ...existing,
    ...changes,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  }
  await db.put('collection', updated)
  notifyDataChanged()
  return updated
}

export async function deleteCollectionItem(id: string): Promise<boolean> {
  const db = await getDb()
  await db.delete('collection', id)
  notifyDataChanged()
  return true
}

export async function getAllDecks(): Promise<Deck[]> {
  const db = await getDb()
  return db.getAll('decks')
}

export async function getDeck(id: string): Promise<Deck | undefined> {
  const db = await getDb()
  return db.get('decks', id)
}

export async function addDeck(name: string, description?: string): Promise<Deck> {
  const now = Date.now()
  const deck: Deck = {
    id: crypto.randomUUID(),
    name,
    description,
    cards: [],
    createdAt: now,
    updatedAt: now,
  }
  const db = await getDb()
  await db.add('decks', deck)
  notifyDataChanged()
  return deck
}

export async function updateDeck(id: string, changes: Partial<Omit<Deck, 'id' | 'createdAt'>>): Promise<Deck | null> {
  const db = await getDb()
  const existing = await db.get('decks', id)
  if (!existing) return null

  const updated: Deck = {
    ...existing,
    ...changes,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  }
  await db.put('decks', updated)
  notifyDataChanged()
  return updated
}

export async function deleteDeck(id: string): Promise<boolean> {
  const db = await getDb()
  await db.delete('decks', id)
  notifyDataChanged()
  return true
}

export async function getCachedCard(passcode: string): Promise<Card | null | undefined> {
  const db = await getDb()
  const entry = await db.get('cache', passcode)
  if (!entry) return undefined
  return entry.card
}

export async function setCachedCard(passcode: string, card: Card | null): Promise<void> {
  const db = await getDb()
  await db.put('cache', { passcode, card, fetchedAt: Date.now() })
}

export async function getCachedCardBySetCode(setCode: string): Promise<Card | null | undefined> {
  const db = await getDb()
  const entry = await db.get('setCodeCache', setCode.toUpperCase())
  if (!entry) return undefined
  return entry.card
}

export async function setCachedCardBySetCode(setCode: string, card: Card | null): Promise<void> {
  const db = await getDb()
  await db.put('setCodeCache', { setCode: setCode.toUpperCase(), card, fetchedAt: Date.now() })
}

export async function getOcgSetList(): Promise<string[] | null> {
  const db = await getDb()
  const entry = await db.get('ocgSets', 'ocg-set-list')
  if (!entry) return null
  return entry.value
}

export async function setOcgSetList(sets: string[]): Promise<void> {
  const db = await getDb()
  await db.put('ocgSets', { key: 'ocg-set-list', value: sets, fetchedAt: Date.now() })
}

export async function clearCardCache(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['cache', 'setCodeCache'], 'readwrite')
  await tx.objectStore('cache').clear()
  await tx.objectStore('setCodeCache').clear()
  await tx.done
}

const SETTINGS_KEY = 'app-settings'

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb()
  const row = await db.get('settings', SETTINGS_KEY)
  return { ...DEFAULT_SETTINGS, ...(row?.value as Partial<AppSettings> | undefined) }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDb()
  await db.put('settings', { key: SETTINGS_KEY, value: settings })
  notifyDataChanged()
}

export async function exportAllData(): Promise<{ collection: CollectionItem[]; decks: Deck[] }> {
  const [collection, decks] = await Promise.all([getAllCollectionItems(), getAllDecks()])
  return { collection, decks }
}

export async function importAllData(data: { collection?: CollectionItem[]; decks?: Deck[] }): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['collection', 'decks'], 'readwrite')
  await tx.objectStore('collection').clear()
  await tx.objectStore('decks').clear()

  for (const item of data.collection ?? []) {
    await tx.objectStore('collection').add(item)
  }
  for (const deck of data.decks ?? []) {
    await tx.objectStore('decks').add(deck)
  }
  await tx.done
  notifyDataChanged()
}

export async function clearAllData(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['collection', 'decks', 'cache', 'setCodeCache', 'settings', 'ocgSets'], 'readwrite')
  await tx.objectStore('collection').clear()
  await tx.objectStore('decks').clear()
  await tx.objectStore('cache').clear()
  await tx.objectStore('setCodeCache').clear()
  await tx.objectStore('settings').clear()
  await tx.objectStore('ocgSets').clear()
  await tx.done
}
