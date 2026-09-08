export interface AuthUser {
  email: string
  name: string
  picture?: string
  isAdmin: boolean
}

let cachedUser: AuthUser | null | undefined

/** Fetches the current session user (or null when logged out). Cached per load. */
export async function fetchCurrentUser(force = false): Promise<AuthUser | null> {
  if (!force && cachedUser !== undefined) return cachedUser
  try {
    const resp = await fetch('/api/auth/me', { credentials: 'same-origin' })
    if (!resp.ok) {
      cachedUser = null
      return null
    }
    const json = (await resp.json()) as { user?: AuthUser | null }
    cachedUser = json.user ?? null
    return cachedUser
  } catch {
    cachedUser = null
    return null
  }
}

/** Redirects to Google login. After the callback the user lands back on the app. */
export function loginWithGoogle(): void {
  // Pass the full current URL (including the hash route, e.g. /#/database) so
  // the callback redirects the user back to where they started.
  const currentUrl = window.location.href
  window.location.href = `/api/auth/google?origin=${encodeURIComponent(currentUrl)}`
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
  } finally {
    cachedUser = null
  }
}

/** Submits a new set code -> passcode mapping for review. */
export async function suggestSetCode(input: {
  setCode: string
  passcode?: string
  cardName?: string
  rarity?: string
  language?: string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await fetch('/api/sets/suggest', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const json = (await resp.json()) as { pending?: unknown; error?: string }
    if (!resp.ok) return { ok: false, error: json.error ?? `Request failed (${resp.status})` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}