import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getDeck, updateDeck } from '../../services/storage.ts'
import { useAppStore } from '../../stores/appStore.ts'
import type { DeckCard, DeckSection } from '../../types/index.ts'

const SECTION_LABELS: Record<DeckSection, string> = {
  MAIN: 'Main Deck',
  EXTRA: 'Extra Deck',
  SIDE: 'Side Deck',
}

export function DeckDetailPage() {
  const { deckId } = useParams<{ deckId: string }>()
  const { decks } = useAppStore()
  const [deck, setDeck] = useState(decks.find((d) => d.id === deckId))
  const [input, setInput] = useState('')

  useEffect(() => {
    if (!deckId) return
    getDeck(deckId).then(setDeck)
  }, [deckId])

  async function updateCards(cards: DeckCard[]) {
    if (!deck) return
    const updated = await updateDeck(deck.id, { cards })
    if (updated) setDeck(updated)
  }

  function addCard(section: DeckSection) {
    if (!input.trim() || !deck) return
    const newCard: DeckCard = {
      passcode: input.trim(),
      name: input.trim(),
      quantity: 1,
      section,
      imageUrl: null,
    }
    updateCards([...deck.cards, newCard])
    setInput('')
  }

  function changeQuantity(passcode: string, section: DeckSection, delta: number) {
    if (!deck) return
    const updated = deck.cards
      .map((c) => {
        if (c.passcode === passcode && c.section === section) {
          return { ...c, quantity: Math.max(0, c.quantity + delta) }
        }
        return c
      })
      .filter((c) => c.quantity > 0)
    updateCards(updated)
  }

  function removeCard(passcode: string, section: DeckSection) {
    if (!deck) return
    updateCards(deck.cards.filter((c) => !(c.passcode === passcode && c.section === section)))
  }

  if (!deck) {
    return <div className="p-8 text-center text-gray-500">Deck not found.</div>
  }

  const sections: DeckSection[] = ['MAIN', 'EXTRA', 'SIDE']

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{deck.name}</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Quick Add Passcode</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter 8-digit passcode"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2 mt-2">
          {sections.map((section) => (
            <button
              key={section}
              type="button"
              onClick={() => addCard(section)}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              disabled={!input.trim()}
            >
              Add to {SECTION_LABELS[section]}
            </button>
          ))}
        </div>
      </div>

      {sections.map((section) => {
        const cards = deck.cards.filter((c) => c.section === section)
        return (
          <div key={section} className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-900 mb-3">
              {SECTION_LABELS[section]} ({cards.reduce((sum, c) => sum + c.quantity, 0)})
            </h2>
            {cards.length === 0 ? (
              <p className="text-sm text-gray-400">No cards.</p>
            ) : (
              <div className="space-y-2">
                {cards.map((card) => (
                  <div
                    key={`${card.passcode}-${section}`}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
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
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => changeQuantity(card.passcode, section, -1)}
                        className="w-7 h-7 rounded bg-white border border-gray-300 hover:bg-gray-100"
                      >
                        -
                      </button>
                      <span className="w-6 text-center text-sm">{card.quantity}</span>
                      <button
                        type="button"
                        onClick={() => changeQuantity(card.passcode, section, 1)}
                        className="w-7 h-7 rounded bg-white border border-gray-300 hover:bg-gray-100"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => removeCard(card.passcode, section)}
                        className="text-xs text-red-600 hover:underline ml-2"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
