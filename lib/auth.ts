import jwt from 'jsonwebtoken'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export interface SessionUser {
  email: string
  name: string
  picture?: string
  isAdmin: boolean
}

const SESSION_COOKIE = 'ygo_session'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function getSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not configured')
  return secret
}

export function signSession(user: SessionUser): string {
  return jwt.sign(user, getSecret(), { expiresIn: '30d' })
}

export function verifySession(token: string | undefined): SessionUser | null {
  if (!token) return null
  try {
    return jwt.verify(token, getSecret()) as SessionUser
  } catch {
    return null
  }
}

/** Reads the session user from the cookie, or null when not logged in. */
export function getSessionUser(req: VercelRequest): SessionUser | null {
  const header = req.headers.cookie ?? ''
  const match = header.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))
  if (!match) return null
  return verifySession(decodeURIComponent(match[1]))
}

/** Sets the session cookie on the response. */
export function setSessionCookie(res: VercelResponse, user: SessionUser): void {
  const token = signSession(user)
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}`,
  )
}

/** Clears the session cookie. */
export function clearSessionCookie(res: VercelResponse): void {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
}

/** Requires a logged-in user; responds 401 and returns null otherwise. */
export function requireUser(req: VercelRequest, res: VercelResponse): SessionUser | null {
  const user = getSessionUser(req)
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' })
    return null
  }
  return user
}

/** Requires an admin user; responds 403 and returns null otherwise. */
export function requireAdmin(req: VercelRequest, res: VercelResponse): SessionUser | null {
  const user = getSessionUser(req)
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' })
    return null
  }
  if (!user.isAdmin) {
    res.status(403).json({ error: 'Admin only' })
    return null
  }
  return user
}

export function jsonResponse(res: VercelResponse, status: number, body: unknown): void {
  res.status(status).json(body)
}

/** Standard CORS headers for API routes. */
export function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return true
  }
  return false
}

export { SESSION_COOKIE }