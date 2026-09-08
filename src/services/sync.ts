import type { AppSettings, CollectionItem, Deck } from '../types/index.ts'
import { fetchCurrentUser } from './auth.ts'
import { exportAllData, getSettings, importAllData, saveSettings } from './storage.ts'

export interface CloudCollectionData {
  collection: CollectionItem[]
  decks: Deck[]
  settings: AppSettings | null
  updatedAt?: number
}

export interface LocalCloudComparison {
  /** Whether the user is currently logged in. */
  signedIn: boolean
  /** Cloud copy exists for this account (or the user is logged out). */
  hasCloud: boolean
  /** Local card count, deck count. */
  local: { cards: number; decks: number }
  /** Cloud card count, deck count. */
  cloud: { cards: number; decks: number }
  /** True when local and cloud differ in any meaningful way. */
  differs: boolean
}

let cloudDataPromise: Promise<CloudCollectionData | null> | null = null

function makeCloudData(data: CloudCollectionData | null | undefined): CloudCollectionData | null {
  if (!data) return null
  return {
    collection: Array.isArray(data.collection) ? data.collection : [],
    decks: Array.isArray(data.decks) ? data.decks : [],
    settings: data.settings && typeof data.settings === 'object' ? (data.settings as AppSettings) : null,
    updatedAt: data.updatedAt,
  }
}

/** Fetches the user's cloud copy (cached per load; null when logged out / no data). */
export async function fetchCloudData(force = false): Promise<CloudCollectionData | null> {
  if (!force && cloudDataPromise) return cloudDataPromise
  cloudDataPromise = (async () => {
    const user = await fetchCurrentUser()
    if (!user) return null
    try {
      const resp = await fetch('/api/collection', { credentials: 'same-origin' })
      if (!resp.ok) return null
      const json = (await resp.json()) as { data?: CloudCollectionData | null }
      return makeCloudData(json.data)
    } catch {
      return null
    }
  })()
  return cloudDataPromise
}

/** Invalidates the cached cloud copy (e.g. after a push so the next read is fresh). */
export function invalidateCloudCache(): void {
  cloudDataPromise = null
}

/** Uploads the current local data, replacing the cloud copy wholesale. */
export async function pushLocalToCloud(): Promise<boolean> {
  const user = await fetchCurrentUser()
  if (!user) return false
  const { collection, decks } = await exportAllData()
  const settings = await getSettings()
  try {
    const resp = await fetch('/api/collection', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection, decks, settings }),
    })
    const ok = resp.ok
    invalidateCloudCache()
    return ok
  } catch {
    return false
  }
}

/** Overwrites the local IndexedDB data with the cloud copy. */
export async function applyCloudToLocal(data: CloudCollectionData): Promise<void> {
  const { setSyncSuppressed } = await import('./storage.ts')
  setSyncSuppressed(true)
  try {
    await importAllData({ collection: data.collection, decks: data.decks })
    if (data.settings) {
      await saveSettings({ ...data.settings })
    }
  } finally {
    setSyncSuppressed(false)
  }
}

/**
 * Compares the local IndexedDB data with the user's cloud copy.
 * Returns a summary the UI can show when deciding which side wins.
 */
export async function compareLocalVsCloud(): Promise<LocalCloudComparison> {
  const user = await fetchCurrentUser()
  if (!user) {
    return {
      signedIn: false,
      hasCloud: false,
      local: { cards: 0, decks: 0 },
      cloud: { cards: 0, decks: 0 },
      differs: false,
    }
  }

  const [local, cloud] = await Promise.all([exportAllData(), fetchCloudData()])
  const localCards = local.collection.reduce((sum, c) => sum + (c.quantity ?? 1), 0)
  const cloudCards = cloud ? cloud.collection.reduce((sum, c) => sum + (c.quantity ?? 1), 0) : 0
  const localDecks = local.decks.length
  const cloudDecks = cloud ? cloud.decks.length : 0

  // Ask the user only when there's something meaningful to decide:
  // - the account already has cloud data that differs from this device, or
  // - this device has data that has never been uploaded yet.
  const differs = cloud
    ? localCards !== cloudCards || localDecks !== cloudDecks
    : localCards > 0 || localDecks > 0

  return {
    signedIn: true,
    hasCloud: Boolean(cloud),
    local: { cards: localCards, decks: localDecks },
    cloud: { cards: cloudCards, decks: cloudDecks },
    differs,
  }
}