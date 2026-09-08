import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { displayName } from '../../services/cardApi.ts'
import { USD_TO_TWD, formatPrice } from '../../services/price.ts'
import { getAllCollectionItems, getAllDecks } from '../../services/storage.ts'
import { useAppStore } from '../../stores/appStore.ts'

export function DashboardPage() {
  const { collection, decks, setCollection, setDecks, settings } = useAppStore()

  useEffect(() => {
    getAllCollectionItems().then(setCollection)
    getAllDecks().then(setDecks)
  }, [setCollection, setDecks])

  const totalQuantity = collection.reduce((sum, item) => sum + item.quantity, 0)
  const uniqueCards = new Set(collection.map((item) => item.passcode)).size
  const jpCount = collection.filter((item) => item.language === 'JP').reduce((sum, item) => sum + item.quantity, 0)
  const aeCount = collection.filter((item) => item.language === 'AE').reduce((sum, item) => sum + item.quantity, 0)
  const enCount = collection.filter((item) => item.language === 'EN').reduce((sum, item) => sum + item.quantity, 0)
  const totalValue = useMemo(() => {
    const currency = settings?.currency ?? 'TWD'
    return collection.reduce((sum, item) => {
      const inCurrency =
        (item.priceCurrency ?? 'USD') === currency
          ? item.price ?? 0
          : (item.priceCurrency ?? 'USD') === 'USD'
            ? (item.price ?? 0) * USD_TO_TWD
            : (item.price ?? 0) / USD_TO_TWD
      return sum + inCurrency * item.quantity
    }, 0)
  }, [collection, settings?.currency])
  const recentItems = [...collection].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">Overview of your Yu-Gi-Oh! collection.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Cards</p>
          <p className="text-3xl font-bold text-gray-900">{totalQuantity}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Unique Cards</p>
          <p className="text-3xl font-bold text-gray-900">{uniqueCards}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Decks</p>
          <p className="text-3xl font-bold text-gray-900">{decks.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Value</p>
          <p className="text-3xl font-bold text-green-600">{formatPrice(totalValue, settings?.currency ?? 'TWD', settings?.currency ?? 'TWD')}</p>
          <p className="text-xs text-gray-400 mt-1">Collection worth</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Versions</p>
          <div className="text-sm font-medium text-gray-900 mt-1">
            JP {jpCount} · AE {aeCount} · EN {enCount}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900">Recent Additions</h2>
            <Link to="/collection" className="text-sm text-blue-600 hover:underline">
              View all
            </Link>
          </div>
          {recentItems.length === 0 ? (
            <p className="text-sm text-gray-400">No cards added yet.</p>
          ) : (
            <div className="space-y-2">
              {recentItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={displayName(item)} className="w-10 h-14 object-contain rounded" />
                  ) : (
                    <div className="w-10 h-14 bg-gray-200 rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{displayName(item)}</p>
                    <p className="text-xs text-gray-500">
                      {item.setCode} · {item.rarity} · x{item.quantity}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900">Quick Actions</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/collection"
              className="block p-4 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 text-center font-medium"
            >
              Add Cards
            </Link>
            <Link
              to="/decks"
              className="block p-4 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 text-center font-medium"
            >
              Import Deck
            </Link>
            <Link
              to="/analysis"
              className="block p-4 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 text-center font-medium"
            >
              Analyze
            </Link>
            <Link
              to="/settings"
              className="block p-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-center font-medium"
            >
              Backup
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
