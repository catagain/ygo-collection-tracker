import { PlusIcon, TrashIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/ui/EmptyState.tsx'
import { addDeck, deleteDeck, getAllDecks } from '../../services/storage.ts'
import { useAppStore } from '../../stores/appStore.ts'
import { DeckImporterModal } from './importer/DeckImporterModal.tsx'

export function DecksPage() {
  const { decks, setDecks } = useAppStore()
  const [newDeckName, setNewDeckName] = useState('')
  const [showImporter, setShowImporter] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    getAllDecks().then(setDecks)
  }, [setDecks])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newDeckName.trim()) return
    await addDeck(newDeckName.trim())
    setNewDeckName('')
    setDecks(await getAllDecks())
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this deck?')) return
    await deleteDeck(id)
    setDecks(await getAllDecks())
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Decks</h1>
          <p className="text-sm text-gray-500">Build and import your target decks.</p>
        </div>
      </div>

      <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-200 p-4 flex gap-3">
        <input
          type="text"
          value={newDeckName}
          onChange={(e) => setNewDeckName(e.target.value)}
          placeholder="New deck name"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={!newDeckName.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <PlusIcon className="w-4 h-4" />
          Create
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {decks.map((deck) => (
          <div
            key={deck.id}
            className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{deck.name}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {deck.cards.length} card{deck.cards.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(deck.id)}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                aria-label="Delete"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => navigate(`/decks/${deck.id}/build`)}
                className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Build
              </button>
              <button
                type="button"
                onClick={() => navigate(`/analysis/${deck.id}`)}
                className="flex-1 px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
              >
                Analyze
              </button>
              <button
                type="button"
                onClick={() => setShowImporter(true)}
                className="flex-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Import
              </button>
            </div>
          </div>
        ))}
      </div>

      {decks.length === 0 && (
        <EmptyState
          title="No decks yet"
          description="Create your first deck or import one from YDK."
        />
      )}

      {showImporter && <DeckImporterModal onClose={() => setShowImporter(false)} />}
    </div>
  )
}
