import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { EmptyState } from '../../components/ui/EmptyState.tsx'
import { getAllCollectionItems, getAllDecks } from '../../services/storage.ts'
import { useAppStore } from '../../stores/appStore.ts'
import { analyzeDeck, exportMissingList } from './analyzeDeck.ts'

export function AnalysisPage() {
  const { deckId } = useParams<{ deckId?: string }>()
  const { decks, collection, setDecks, setCollection } = useAppStore()
  const [selectedDeckId, setSelectedDeckId] = useState<string>(() => deckId ?? '')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getAllCollectionItems().then(setCollection)
    getAllDecks().then((d) => {
      setDecks(d)
    })
  }, [setCollection, setDecks])

  const analysis = useMemo(() => {
    const deck = decks.find((d) => d.id === selectedDeckId)
    if (!deck) return null
    return analyzeDeck(deck, collection)
  }, [decks, collection, selectedDeckId])

  const missingText = useMemo(() => {
    return analysis ? exportMissingList(analysis, 'text') : ''
  }, [analysis])

  function copyMissing() {
    navigator.clipboard.writeText(missingText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function downloadCsv() {
    if (!analysis) return
    const csv = exportMissingList(analysis, 'csv')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${analysis.deckName}-missing.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deck Analysis</h1>
          <p className="text-sm text-gray-500">Compare your collection against a target deck.</p>
        </div>
        <select
          value={selectedDeckId}
          onChange={(e) => setSelectedDeckId(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select a deck</option>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {!analysis ? (
        <EmptyState title="No deck selected" description="Select a deck to view analysis." />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Total Progress</p>
              <p className="text-2xl font-bold text-gray-900">
                {analysis.overallOwned} / {analysis.overallRequired}
              </p>
              <div className="mt-2 h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full"
                  style={{
                    width: `${analysis.overallRequired === 0 ? 0 : (analysis.overallOwned / analysis.overallRequired) * 100}%`,
                  }}
                />
              </div>
            </div>
            {analysis.sections.map((section) => (
              <div key={section.section} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-sm text-gray-500">{section.label}</p>
                <p className="text-2xl font-bold text-gray-900">
                  {section.totalOwned} / {section.totalRequired}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {section.totalRequired === 0
                    ? 'No cards'
                    : `${Math.round((section.totalOwned / section.totalRequired) * 100)}% complete`}
                </p>
              </div>
            ))}
          </div>

          {analysis.missingCards.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-900">
                  Missing Cards ({analysis.missingCards.reduce((sum, c) => sum + c.missingQuantity, 0)})
                </h2>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={copyMissing}
                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={downloadCsv}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    CSV
                  </button>
                </div>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {analysis.missingCards.map((card) => (
                  <div
                    key={`${card.passcode}-${card.section}`}
                    className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {card.imageUrl ? (
                        <img src={card.imageUrl} alt={card.name} className="w-10 h-14 object-contain rounded" />
                      ) : (
                        <div className="w-10 h-14 bg-gray-200 rounded" />
                      )}
                      <div>
                        <p className="font-medium text-sm text-gray-900">{card.name}</p>
                        <p className="text-xs text-gray-500">{card.passcode}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-red-700">Missing × {card.missingQuantity}</p>
                      <p className="text-xs text-gray-500">
                        Need {card.quantity} · Have {card.ownedQuantity}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="font-bold text-gray-900 mb-3">Section Breakdown</h2>
            {analysis.sections.map((section) => (
              <div key={section.section} className="mb-4">
                <h3 className="font-medium text-gray-800 mb-2">
                  {section.label} ({section.totalOwned}/{section.totalRequired})
                </h3>
                {section.cards.length === 0 ? (
                  <p className="text-sm text-gray-400">No cards in this section.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {section.cards.map((card) => (
                      <div
                        key={`${card.passcode}-${section.section}`}
                        className={`p-3 rounded-lg border ${
                          card.missingQuantity > 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {card.imageUrl ? (
                            <img src={card.imageUrl} alt={card.name} className="w-10 h-14 object-contain rounded" />
                          ) : (
                            <div className="w-10 h-14 bg-gray-200 rounded" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{card.name}</p>
                            <p className="text-xs text-gray-500">{card.passcode}</p>
                          </div>
                          <div className="text-right text-sm">
                            <p className={card.missingQuantity > 0 ? 'text-red-700' : 'text-green-700'}>
                              {card.ownedQuantity}/{card.quantity}
                            </p>
                          </div>
                        </div>
                        {card.ownedVersions.length > 0 && (
                          <div className="mt-2 text-xs text-gray-500">
                            Owned:{' '}
                            {card.ownedVersions
                              .map((v) => `${v.setCode} ${v.language} ${v.rarity} x${v.quantity}`)
                              .join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
