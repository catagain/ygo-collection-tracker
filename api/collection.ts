import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applyCors, requireUser } from '../lib/auth.js'
import {
  deleteUserCollection,
  getUserCollection,
  setUserCollection,
  type UserCloudData,
} from '../lib/kv.js'

/**
 * Per-user cloud collection sync.
 *   GET    /api/collection        -> { data } where data is the user's cloud copy (or null)
 *   PUT    /api/collection        -> replaces the user's cloud copy, body { collection, decks, settings }
 *   DELETE /api/collection        -> removes the user's cloud copy
 *
 * Vercel rewrites /api/collection to this file (see vercel.json).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return

  const user = requireUser(req, res)
  if (!user) return

  try {
    switch (req.method) {
      case 'GET': {
        const data = await getUserCollection(user.email)
        res.json({ data: data ?? null })
        return
      }
      case 'PUT': {
        const body = req.body as { collection?: unknown; decks?: unknown; settings?: unknown } | null
        if (!body || !Array.isArray(body.collection) || !Array.isArray(body.decks)) {
          res.status(400).json({ error: 'Invalid payload: collection and decks must be arrays' })
          return
        }
        const now = Date.now()
        const payload: UserCloudData = {
          collection: body.collection,
          decks: body.decks,
          settings: body.settings != null && typeof body.settings === 'object' ? (body.settings as Record<string, unknown>) : null,
          updatedAt: now,
        }
        await setUserCollection(user.email, payload)
        res.json({ ok: true, updatedAt: now })
        return
      }
      case 'DELETE': {
        await deleteUserCollection(user.email)
        res.json({ ok: true })
        return
      }
      default:
        res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'collection handler error' })
  }
}