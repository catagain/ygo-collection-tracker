import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAllData } from './storage.ts'
import { matchExactSetName } from './yugiohCn.ts'

describe('matchExactSetName', () => {
  beforeEach(async () => {
    await clearAllData()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('matches a raw all-caps OCG pack name to the authoritative YGOPRODECK set name', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      sets: [
        'Quarter Century Chronicle side:Unity',
        'Rarity Collection Quarter Century Edition',
        'Utility Selection',
      ],
    }), { status: 200 }))

    const exact = await matchExactSetName('QUARTER CENTURY CHRONICLE side：UNITY')
    expect(exact).toBe('Quarter Century Chronicle side:Unity')
  })

  it('normalizes full-width colon and case differences', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      sets: ['Rarity Collection Quarter Century Edition'],
    }), { status: 200 }))

    const exact = await matchExactSetName('RARITY COLLECTION －QUARTER CENTURY EDITION－')
    expect(exact).toBe('Rarity Collection Quarter Century Edition')
  })

  it('falls back to a prefix match when no exact set exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      sets: ['Rarity Collection 5', 'Rarity Collection Quarter Century Edition'],
    }), { status: 200 }))

    const exact = await matchExactSetName('RARITY COLLECTION')
    expect(exact).toBe('Rarity Collection 5')
  })

  it('returns null when the set list is empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      sets: [],
    }), { status: 200 }))

    const exact = await matchExactSetName('UNKNOWN PACK')
    expect(exact).toBeNull()
  })

  it('caches the set list after the first fetch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      sets: ['Utility Selection'],
    }), { status: 200 }))

    await matchExactSetName('UTILITY SELECTION')
    await matchExactSetName('UTILITY SELECTION')
    // First call fetches; second call reads from IndexedDB cache.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})