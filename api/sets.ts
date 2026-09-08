import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applyCors, requireAdmin, requireUser } from '../lib/auth.js'
import {
  addPendingSet,
  approveSet,
  deleteApprovedSet,
  getApprovedSets,
  getPendingSets,
  removePendingSet,
} from '../lib/kv.js'

/**
 * Consolidated sets handler. Vercel rewrites /api/sets/:path* to this file
 * with ?path=/api/sets/:path* so a single serverless function serves
 * suggest / pending / approve / reject / delete / approved (stays within the
 * Hobby plan's 12-function cap).
 */

async function handleSuggest(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const user = requireUser(req, res)
  if (!user) return

  const body = req.body as { setCode?: unknown; passcode?: unknown; cardName?: unknown; rarity?: unknown; language?: unknown } | null
  const setCode = typeof body?.setCode === 'string' ? body.setCode.trim().toUpperCase() : ''
  const passcode = typeof body?.passcode === 'string' ? body.passcode.trim() : ''
  const cardName = typeof body?.cardName === 'string' ? body.cardName.trim() : ''
  const rarity = typeof body?.rarity === 'string' ? body.rarity.trim() : ''
  const language = typeof body?.language === 'string' ? body.language.trim().toUpperCase() : ''

  if (!setCode || !/^[A-Z0-9]+-[A-Z0-9]{2,6}$/i.test(setCode)) {
    res.status(400).json({ error: 'Invalid set code format' })
    return
  }
  // Passcode is optional (some OCG-only packs don't resolve one), but when
  // provided it must be a valid 5-10 digit code.
  if (passcode && !/^\d{5,10}$/.test(passcode)) {
    res.status(400).json({ error: 'Invalid passcode' })
    return
  }
  if (language && !['JP', 'AE', 'EN', 'OTHER'].includes(language)) {
    res.status(400).json({ error: 'Invalid language' })
    return
  }

  const approved = await getApprovedSets()
  if (approved[setCode]) {
    res.status(409).json({ error: 'This set code is already in the database' })
    return
  }

  try {
    const entry = await addPendingSet({
      setCode,
      passcode,
      cardName: cardName || passcode,
      rarity: rarity || undefined,
      language: language || undefined,
      suggestedBy: user.email,
      suggestedByName: user.name,
    })
    res.json({ pending: entry })
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Failed to submit' })
  }
}

async function handlePending(req: VercelRequest, res: VercelResponse) {
  const user = requireAdmin(req, res)
  if (!user) return
  res.json({ pending: await getPendingSets() })
}

async function handleApprove(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const user = requireAdmin(req, res)
  if (!user) return

  const body = req.body as { id?: unknown } | null
  const id = typeof body?.id === 'string' ? body.id : ''
  const pending = await getPendingSets()
  const target = pending.find((p) => p.id === id)
  if (!target) {
    res.status(404).json({ error: 'Pending entry not found' })
    return
  }
  if (!/^\d{5,10}$/.test(target.passcode)) {
    res.status(400).json({ error: 'Cannot approve: this submission has no valid passcode. Ask the submitter for the passcode, or reject it.' })
    return
  }

  await approveSet(target)
  res.json({ ok: true, setCode: target.setCode, passcode: target.passcode })
}

async function handleReject(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const user = requireAdmin(req, res)
  if (!user) return

  const body = req.body as { id?: unknown } | null
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) {
    res.status(400).json({ error: 'Missing id' })
    return
  }

  await removePendingSet(id)
  res.json({ ok: true })
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const user = requireAdmin(req, res)
  if (!user) return

  const setCode = typeof req.query.setcode === 'string' ? req.query.setcode.trim().toUpperCase() : ''
  if (!setCode) {
    res.status(400).json({ error: 'Missing setcode' })
    return
  }

  await deleteApprovedSet(setCode)
  res.json({ ok: true })
}

async function handleApproved(_req: VercelRequest, res: VercelResponse) {
  res.json({ sets: await getApprovedSets() })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return

  const path = typeof req.query.path === 'string' ? req.query.path : ''
  const action = path.replace(/^\/api\/sets\/?/, '')

  try {
    switch (action) {
      case 'suggest':
        return await handleSuggest(req, res)
      case 'pending':
        return await handlePending(req, res)
      case 'approve':
        return await handleApprove(req, res)
      case 'reject':
        return await handleReject(req, res)
      case 'delete':
        return await handleDelete(req, res)
      case 'approved':
      default:
        return await handleApproved(req, res)
    }
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'sets handler error' })
  }
}