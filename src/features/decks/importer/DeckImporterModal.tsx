import { useState } from 'react'
import { addDeck, getAllDecks, updateDeck } from '../../../services/storage.ts'
import { fetchCardByPasscode, getCachedCard, setCachedCard } from '../../../services/cardApi.ts'
import { useAppStore } from '../../../stores/appStore.ts'
import type { Deck, DeckCard } from '../../../types/index.ts'
import { parseYdk } from './parseYdk.ts'

interface Props {
  onClose: () => void
}

export function DeckImporterModal({ onClose }: Props) {
  const [text, setText] = useState('')
  const [deckName, setDeckName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const { setDecks } = useAppStore()

  async function handleImport(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setProgress(null)

    if (!deckName.trim()) {
      setError('Please enter a deck name.')
      return
    }
    if (!text.trim()) {
      setError('Please paste a YDK or text list.')
      return
    }

    const { cards, unknownLines } = parseYdk(text)
    if (cards.length === 0) {
      setError('No valid passcodes found.')
      return
    }

    setLoading(true)
    try {
      const resolved: DeckCard[] = []
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i]
        setProgress(`Resolving ${i + 1} / ${cards.length}...`)

        let cached = await getCachedCard(card.passcode)
        let apiCard = cached
        if (apiCard === undefined) {
          apiCard = await fetchCardByPasscode(card.passcode)
          await setCachedCard(card.passcode, apiCard)
        }

        resolved.push({
          ...card,
          name: apiCard?.name ?? card.passcode,
          imageUrl: apiCard?.imageUrl ?? null,
        })
      }

      const newDeck = await addDeck(deckName.trim())
      const deck: Deck = { ...newDeck, cards: resolved }
      await updateDeck(deck.id, { cards: resolved })

      if (unknownLines.length > 0) {
        console.warn('Unknown lines during import:', unknownLines)
      }

      setDecks(await getAllDecks())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Import Deck</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleImport} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deck Name</label>
              <input
                type="text"
                value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
                placeholder="My New Deck"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">YDK / Text List</label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={12}
                placeholder={`#main\n14558127\n14558127\n89631139\n\n#extra\n44508094\n\n!side\n23434538`}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Supports standard YDK format (#main, #extra, !side) or quantity + passcode lines.
              </p>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
            )}
            {progress && <div className="text-sm text-blue-600 bg-blue-50 rounded-lg p-3">{progress}</div>}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !deckName.trim() || !text.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Importing...' : 'Import'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
