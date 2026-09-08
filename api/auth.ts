import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applyCors, clearSessionCookie, getSessionUser, setSessionCookie } from '../lib/auth.js'
import { bootstrapAdminIfEmpty, isAdminEmail } from '../lib/kv.js'

/**
 * Consolidated auth handler. Vercel rewrites /api/auth/:path* to this file
 * with ?path=/api/auth/:path* so a single serverless function serves
 * google / callback / me / logout (stays within the Hobby plan's 12-function cap).
 */
function getClientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID
  if (!id) throw new Error('GOOGLE_CLIENT_ID is not configured')
  return id
}

function getClientSecrets(): { id: string; secret: string } {
  const id = process.env.GOOGLE_CLIENT_ID
  const secret = process.env.GOOGLE_CLIENT_SECRET
  if (!id || !secret) throw new Error('GOOGLE_CLIENT_ID/SECRET are not configured')
  return { id, secret }
}

function getBaseUrl(req: VercelRequest): string {
  const proto = req.headers['x-forwarded-proto'] ?? 'http'
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost:5173'
  return `${proto}://${host}`
}

async function handleGoogle(req: VercelRequest, res: VercelResponse) {
  const baseUrl = getBaseUrl(req)
  const redirectUri = `${baseUrl}/api/auth/callback`
  // Allow the frontend to request a return path (e.g. "/#/database") so the
  // callback lands the user back where they started.
  const origin = typeof req.query.origin === 'string' ? req.query.origin : ''
  const returnTo = origin.startsWith('/') ? origin : origin.startsWith(baseUrl) ? origin.slice(baseUrl.length) : ''
  const state = Buffer.from(JSON.stringify({ r: baseUrl, t: Date.now(), returnTo })).toString('base64url')

  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    state,
    prompt: 'select_account',
  })
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
}

async function handleCallback(req: VercelRequest, res: VercelResponse) {
  const { code, state, error } = req.query
  const baseUrl = getBaseUrl(req)

  // returnTo is a same-origin path like "/#/database" captured in the state.
  let returnTo = '/'
  if (typeof state === 'string') {
    try {
      const parsed = JSON.parse(Buffer.from(state, 'base64url').toString())
      if (parsed?.returnTo && typeof parsed.returnTo === 'string' && parsed.returnTo.startsWith('/')) {
        returnTo = parsed.returnTo
      } else if (parsed?.r && typeof parsed.r === 'string') {
        returnTo = parsed.r
      }
    } catch {
      // ignore malformed state
    }
  }

  if (error || typeof code !== 'string') {
    return res.redirect(`${returnTo}${returnTo.includes('#') ? '?' : '#'}login=error`)
  }

  try {
    const { id, secret } = getClientSecrets()
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: id,
        client_secret: secret,
        redirect_uri: `${baseUrl}/api/auth/callback`,
        grant_type: 'authorization_code',
      }),
    })
    if (!tokenResp.ok) throw new Error(`Token exchange failed: ${tokenResp.status}`)
    const tokenJson = (await tokenResp.json()) as { id_token?: string }
    if (!tokenJson.id_token) throw new Error('No id_token returned')

    const payload = tokenJson.id_token.split('.')[1]
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      email?: string
      name?: string
      picture?: string
    }
    if (!decoded.email) throw new Error('No email in id_token')

    const email = decoded.email.toLowerCase()
    // First user to log in becomes an admin automatically (bootstrap).
    await bootstrapAdminIfEmpty(email)
    const isAdmin = await isAdminEmail(email)
    setSessionCookie(res, {
      email,
      name: decoded.name ?? email,
      picture: decoded.picture,
      isAdmin,
    })

    res.redirect(returnTo)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'OAuth callback failed' })
  }
}

async function handleMe(req: VercelRequest, res: VercelResponse) {
  const user = getSessionUser(req)
  res.json({ user })
}

async function handleLogout(_req: VercelRequest, res: VercelResponse) {
  clearSessionCookie(res)
  res.json({ ok: true })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return

  // Which auth action? The rewrite appends ?path=/api/auth/<action>.
  const path = typeof req.query.path === 'string' ? req.query.path : ''
  const action = path.replace(/^\/api\/auth\/?/, '')

  try {
    switch (action) {
      case 'google':
        return await handleGoogle(req, res)
      case 'callback':
        return await handleCallback(req, res)
      case 'logout':
        return await handleLogout(req, res)
      case 'me':
      default:
        return await handleMe(req, res)
    }
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'auth handler error' })
  }
}