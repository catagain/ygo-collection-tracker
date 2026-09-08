import { Redis } from '@upstash/redis'

// Vercel KV was sunset in 2024 and replaced by the Upstash Redis marketplace
// integration. The integration still injects KV_REST_API_URL/KV_REST_API_TOKEN
// (compatible with the old @vercel/kv naming); we also accept the native
// UPSTASH_REDIS_REST_URL/TOKEN names for direct Upstash usage.
const kvUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? ''
const kvToken = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? ''

// When the KV store isn't configured yet, the client would fail to connect.
// Gracefully degrade so the rest of the app keeps working; auth/sets features
// simply report empty until the store is provisioned.
const kvConfigured = Boolean(kvUrl && kvToken)

const kv = new Redis({ url: kvUrl, token: kvToken })

export interface PendingSet {
  id: string
  setCode: string
  passcode: string
  cardName: string
  rarity?: string
  language?: string
  suggestedBy: string // email
  suggestedByName: string
  createdAt: number
}

export interface SetEntry {
  setCode: string
  passcode: string
  name: string
  setName: string
  rarity?: string
  language?: string
  addedBy: string // email
  addedAt: number
}

const ADMIN_KEY = 'admin:emails'
const PENDING_KEY = 'pending:sets'
const APPROVED_KEY = 'approved:sets'

/** Safe wrapper: returns [] when KV is unavailable. */
async function kvGetArray<T>(key: string): Promise<T[]> {
  if (!kvConfigured) return []
  try {
    return (await kv.get<T[]>(key)) ?? []
  } catch {
    return []
  }
}

/** Safe wrapper: returns undefined when KV is unavailable. */
async function kvGet<T>(key: string): Promise<T | undefined> {
  if (!kvConfigured) return undefined
  try {
    const value = await kv.get<T>(key)
    return value ?? undefined
  } catch {
    return undefined
  }
}

/** Safe wrapper: no-op when KV is unavailable. */
async function kvSet(key: string, value: unknown): Promise<void> {
  if (!kvConfigured) return
  try {
    await kv.set(key, value)
  } catch {
    // ignore
  }
}

// --- Admin list ---

export async function getAdminEmails(): Promise<string[]> {
  return kvGetArray<string>(ADMIN_KEY)
}

export async function isAdminEmail(email: string): Promise<boolean> {
  const emails = await getAdminEmails()
  return emails.some((e) => e.toLowerCase() === email.toLowerCase())
}

/**
 * Bootstrap: when no admin exists yet, the first user to log in becomes an
 * admin automatically. This avoids a deadlock where no one can manage the
 * database until an admin is manually configured.
 */
export async function bootstrapAdminIfEmpty(email: string): Promise<boolean> {
  const emails = await getAdminEmails()
  if (emails.length === 0) {
    await kvSet(ADMIN_KEY, [email])
    return true
  }
  return false
}

export async function addAdminEmail(email: string): Promise<void> {
  const emails = await getAdminEmails()
  if (!emails.some((e) => e.toLowerCase() === email.toLowerCase())) {
    emails.push(email)
    await kvSet(ADMIN_KEY, emails)
  }
}

export async function removeAdminEmail(email: string): Promise<void> {
  const emails = await getAdminEmails()
  const filtered = emails.filter((e) => e.toLowerCase() !== email.toLowerCase())
  await kvSet(ADMIN_KEY, filtered)
}

// --- Pending suggestions ---

export async function getPendingSets(): Promise<PendingSet[]> {
  return kvGetArray<PendingSet>(PENDING_KEY)
}

export async function addPendingSet(
  entry: Omit<PendingSet, 'id' | 'createdAt'>,
): Promise<PendingSet> {
  const pending = await getPendingSets()
  // De-duplicate: skip if the same set code is already pending or approved.
  if (pending.some((p) => p.setCode.toUpperCase() === entry.setCode.toUpperCase())) {
    throw new Error('This set code is already pending review')
  }
  const newEntry: PendingSet = {
    ...entry,
    setCode: entry.setCode.toUpperCase(),
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  }
  pending.push(newEntry)
  await kvSet(PENDING_KEY, pending)
  return newEntry
}

export async function removePendingSet(id: string): Promise<void> {
  const pending = await getPendingSets()
  await kvSet(
    PENDING_KEY,
    pending.filter((p) => p.id !== id),
  )
}

// --- Approved additions (merged into the index) ---

export async function getApprovedSets(): Promise<Record<string, SetEntry>> {
  return (await kvGet<Record<string, SetEntry>>(APPROVED_KEY)) ?? {}
}

export async function approveSet(pending: PendingSet): Promise<void> {
  const approved = await getApprovedSets()
  approved[pending.setCode] = {
    setCode: pending.setCode,
    passcode: pending.passcode,
    name: pending.cardName,
    setName: '',
    rarity: pending.rarity,
    language: pending.language,
    addedBy: pending.suggestedBy,
    addedAt: Date.now(),
  }
  await kvSet(APPROVED_KEY, approved)
  await removePendingSet(pending.id)
}

export async function deleteApprovedSet(setCode: string): Promise<void> {
  const approved = await getApprovedSets()
  delete approved[setCode.toUpperCase()]
  await kvSet(APPROVED_KEY, approved)
}

// --- Per-user collection data (collection + decks + settings) ---
// Stored under a key scoped by the user's email so each account gets its own
// cloud copy. Shape mirrors what the frontend exports from IndexedDB.

export interface UserCloudData {
  collection: unknown[]
  decks: unknown[]
  settings: Record<string, unknown> | null
  updatedAt: number
}

function userKey(email: string): string {
  return `user:collection:${email.toLowerCase()}`
}

/** Returns the user's cloud copy (undefined when the account has no data yet). */
export async function getUserCollection(email: string): Promise<UserCloudData | undefined> {
  return kvGet<UserCloudData>(userKey(email))
}

/** Replaces the user's cloud copy wholesale (cloud is authoritative after merge). */
export async function setUserCollection(email: string, data: UserCloudData): Promise<void> {
  await kvSet(userKey(email), data)
}

/** Removes the user's cloud copy. */
export async function deleteUserCollection(email: string): Promise<void> {
  if (!kvConfigured) return
  try {
    await kv.del(userKey(email))
  } catch {
    // ignore
  }
}