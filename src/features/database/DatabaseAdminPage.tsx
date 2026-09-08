import { useEffect, useState } from 'react'
import { fetchCurrentUser, loginWithGoogle, logout, type AuthUser } from '../../services/auth.ts'
import { invalidateApprovedSets } from '../../services/cardApi.ts'

interface PendingSet {
  id: string
  setCode: string
  passcode: string
  cardName: string
  rarity?: string
  language?: string
  suggestedBy: string
  suggestedByName: string
  createdAt: number
}

interface ApprovedSet {
  setCode: string
  passcode: string
  name: string
  setName: string
  rarity?: string
  language?: string
  addedBy: string
  addedAt: number
}

export function DatabaseAdminPage() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)
  const [pending, setPending] = useState<PendingSet[] | null>(null)
  const [approved, setApproved] = useState<Record<string, ApprovedSet> | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function loadData() {
    const u = await fetchCurrentUser(true)
    setUser(u)
    if (!u?.isAdmin) return
    const [pRes, aRes] = await Promise.all([
      fetch('/api/sets/pending', { credentials: 'same-origin' }),
      fetch('/api/sets/approved', { credentials: 'same-origin' }),
    ])
    if (pRes.ok) {
      const p = (await pRes.json()) as { pending: PendingSet[] }
      setPending(p.pending)
    }
    if (aRes.ok) {
      const a = (await aRes.json()) as { sets: Record<string, ApprovedSet> }
      setApproved(a.sets)
    }
  }

useEffect(() => {
  let cancelled = false
  async function init() {
    const u = await fetchCurrentUser(true)
    if (cancelled) return
    setUser(u)
    if (!u?.isAdmin) return
    const [pRes, aRes] = await Promise.all([
      fetch('/api/sets/pending', { credentials: 'same-origin' }),
      fetch('/api/sets/approved', { credentials: 'same-origin' }),
    ])
    if (cancelled) return
    if (pRes.ok) {
      const p = (await pRes.json()) as { pending: PendingSet[] }
      setPending(p.pending)
    }
    if (aRes.ok) {
      const a = (await aRes.json()) as { sets: Record<string, ApprovedSet> }
      setApproved(a.sets)
    }
  }
  void init()
  return () => {
    cancelled = true
  }
}, [])

  async function handleApprove(id: string) {
    setBusy(true)
    setMsg(null)
    const resp = await fetch('/api/sets/approve', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const json = (await resp.json()) as { ok?: boolean; error?: string }
    setBusy(false)
    setMsg(json.ok ? 'Approved.' : json.error ?? 'Failed')
    invalidateApprovedSets()
    await loadData()
  }

  async function handleReject(id: string) {
    setBusy(true)
    setMsg(null)
    const resp = await fetch('/api/sets/reject', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const json = (await resp.json()) as { ok?: boolean; error?: string }
    setBusy(false)
    setMsg(json.ok ? 'Rejected.' : json.error ?? 'Failed')
    invalidateApprovedSets()
    await loadData()
  }

  async function handleDelete(setCode: string) {
    if (!window.confirm(`Delete ${setCode} from the approved database?`)) return
    setBusy(true)
    setMsg(null)
    const resp = await fetch(`/api/sets/delete?setcode=${encodeURIComponent(setCode)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    })
    const json = (await resp.json()) as { ok?: boolean; error?: string }
    setBusy(false)
    setMsg(json.ok ? `Deleted ${setCode}.` : json.error ?? 'Failed')
    invalidateApprovedSets()
    await loadData()
  }

  async function handleLogout() {
    await logout()
    setUser(null)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Database Admin</h1>
      <p className="text-sm text-gray-500 mt-1">
        Manage user-submitted set code mappings. Only administrators can review or delete entries.
      </p>

      {user === undefined ? (
        <p className="mt-6 text-sm text-gray-500">Loading…</p>
      ) : !user ? (
        <div className="mt-6 bg-white border border-gray-200 rounded-lg p-6 text-center">
          <p className="text-gray-700">Log in with Google to submit or review card mappings.</p>
          <button
            onClick={loginWithGoogle}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Log in with Google
          </button>
        </div>
      ) : (
        <div className="mt-4 flex items-center justify-between bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            {user.picture && <img src={user.picture} alt="" className="w-8 h-8 rounded-full" />}
            <div>
              <p className="text-sm font-medium text-gray-900">{user.name}</p>
              <p className="text-xs text-gray-500">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user.isAdmin && (
              <span className="text-xs font-medium text-green-700 bg-green-100 rounded-full px-2 py-0.5">Admin</span>
            )}
            <button onClick={handleLogout} className="text-sm text-gray-600 hover:text-gray-900">
              Log out
            </button>
          </div>
        </div>
      )}

      {msg && <p className="mt-3 text-sm text-blue-700">{msg}</p>}

      {user && !user.isAdmin && (
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm text-amber-800">
            You are logged in but not an administrator. You can still submit new card mappings from the
            Add Card form.
          </p>
        </div>
      )}

      {user?.isAdmin && (
        <>
          <h2 className="mt-8 text-lg font-semibold text-gray-900">Pending Review</h2>
          {pending === null ? (
            <p className="mt-2 text-sm text-gray-500">Loading…</p>
          ) : pending.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No pending submissions.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {pending.map((p) => (
                <div key={p.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">
                      {p.cardName} <span className="text-gray-400">→</span>{' '}
                      <code className="text-sm bg-gray-100 px-1.5 py-0.5 rounded">{p.setCode}</code>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {p.passcode ? `Passcode ${p.passcode}` : 'No passcode (OCG-only pack)'} · submitted by {p.suggestedByName} ({p.suggestedBy}) ·{' '}
                      {new Date(p.createdAt).toLocaleString()}
                    </p>
                    {(p.rarity || p.language) && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {[p.language, p.rarity].filter(Boolean).join(' · ') || '—'}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(p.id)}
                      disabled={busy || !/^\d{5,10}$/.test(p.passcode)}
                      title={!/^\d{5,10}$/.test(p.passcode) ? 'Cannot approve: no valid passcode in this submission' : undefined}
                      className="rounded-lg bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(p.id)}
                      disabled={busy}
                      className="rounded-lg bg-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 className="mt-10 text-lg font-semibold text-gray-900">Approved Additions</h2>
          {approved === null ? (
            <p className="mt-2 text-sm text-gray-500">Loading…</p>
          ) : Object.keys(approved).length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No approved additions yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {Object.values(approved)
                .sort((a, b) => a.setCode.localeCompare(b.setCode))
                .map((s) => (
                  <div key={s.setCode} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        <code className="text-sm bg-gray-100 px-1.5 py-0.5 rounded">{s.setCode}</code>
                        <span className="text-gray-400"> → </span>
                        {s.name}
                        <span className="text-gray-400"> ({s.passcode})</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">added by {s.addedBy}</p>
                    </div>
                    <button
                      onClick={() => handleDelete(s.setCode)}
                      disabled={busy}
                      className="rounded-lg bg-red-100 px-3 py-1.5 text-sm text-red-700 hover:bg-red-200 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}