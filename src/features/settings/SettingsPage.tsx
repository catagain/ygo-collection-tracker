import { useEffect, useState } from 'react'
import { preloadCollectionCards } from '../../services/cardApi.ts'
import { clearAllData, clearCardCache, exportAllData, getSettings, importAllData, saveSettings } from '../../services/storage.ts'
import { useAppStore } from '../../stores/appStore.ts'
import { DEFAULT_SETTINGS, type AppSettings } from '../../types/index.ts'

export function SettingsPage() {
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState(false)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [cacheStatus, setCacheStatus] = useState<string | null>(null)
  const { setCollection, setDecks, setSettings: setStoreSettings, collection } = useAppStore()

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s)
      setStoreSettings(s)
    })
  }, [setStoreSettings])

  async function handleCurrencyChange(currency: AppSettings['currency']) {
    const next = { ...(settings ?? DEFAULT_SETTINGS), currency }
    setSettings(next)
    setStoreSettings(next)
    await saveSettings(next)
  }

  async function handlePricePriorityChange(pricePriority: AppSettings['pricePriority']) {
    const next = { ...(settings ?? DEFAULT_SETTINGS), pricePriority }
    setSettings(next)
    setStoreSettings(next)
    await saveSettings(next)
  }

  async function handlePreloadCache() {
    setCacheStatus(null)
    if (!collection.length) {
      setCacheStatus('No cards in collection to preload.')
      return
    }
    setCacheStatus('Preloading…')
    const items = collection.map((c) => ({ passcode: c.passcode, setCode: c.setCode }))
    await preloadCollectionCards(items)
    setCacheStatus(`Preloaded ${items.length} cards into local cache.`)
  }

  async function handleClearCache() {
    if (!confirm('Clear the local card cache? This only removes cached card data, not your collection.')) return
    await clearCardCache()
    setCacheStatus('Card cache cleared.')
  }

  async function handleExport() {
    const data = await exportAllData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ygo-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(file: File) {
    setImportError(null)
    setImportSuccess(false)
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!Array.isArray(data.collection) || !Array.isArray(data.decks)) {
        throw new Error('Invalid backup file format.')
      }
      await importAllData(data)
      setCollection(data.collection)
      setDecks(data.decks)
      setImportSuccess(true)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed.')
    }
  }

  async function handleClear() {
    if (!confirm('This will permanently delete all collection and deck data. Continue?')) return
    await clearAllData()
    setCollection([])
    setDecks([])
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Manage your local data.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <section>
          <h2 className="text-lg font-semibold text-gray-900">Currency</h2>
          <p className="text-sm text-gray-500 mb-3">Select the currency used to display card prices.</p>
          <select
            value={settings?.currency ?? 'TWD'}
            onChange={(e) => void handleCurrencyChange(e.target.value as AppSettings['currency'])}
            className="rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="TWD">TWD (NT$)</option>
            <option value="USD">USD ($)</option>
          </select>
        </section>

        <hr className="border-gray-200" />

        <section>
          <h2 className="text-lg font-semibold text-gray-900">Price Source Priority</h2>
          <p className="text-sm text-gray-500 mb-3">Choose which price source to prefer when refreshing card prices.</p>
          <select
            value={settings?.pricePriority ?? 'ruten'}
            onChange={(e) => void handlePricePriorityChange(e.target.value as AppSettings['pricePriority'])}
            className="rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ruten">Ruten (露天) first</option>
            <option value="ygo">YGOPRODECK first</option>
          </select>
        </section>

        <hr className="border-gray-200" />

        <section>
          <h2 className="text-lg font-semibold text-gray-900">Local Cache</h2>
          <p className="text-sm text-gray-500 mb-3">
            Card data is cached locally to speed up repeat lookups. Preload your collection's cards, or clear the cache.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void handlePreloadCache()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Preload collection cards
            </button>
            <button
              type="button"
              onClick={() => void handleClearCache()}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Clear cache
            </button>
          </div>
          {cacheStatus && <p className="mt-2 text-sm text-gray-600">{cacheStatus}</p>}
        </section>

        <hr className="border-gray-200" />

        <section>
          <h2 className="text-lg font-semibold text-gray-900">Backup</h2>
          <p className="text-sm text-gray-500 mb-3">Download a JSON file with all your collection and decks.</p>
          <button
            type="button"
            onClick={handleExport}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Export JSON
          </button>
        </section>

        <hr className="border-gray-200" />

        <section>
          <h2 className="text-lg font-semibold text-gray-900">Restore</h2>
          <p className="text-sm text-gray-500 mb-3">Restore from a previously exported JSON backup file.</p>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleImport(file)
            }}
            className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
          />
          {importError && <p className="mt-2 text-sm text-red-600">{importError}</p>}
          {importSuccess && <p className="mt-2 text-sm text-green-600">Backup restored successfully.</p>}
        </section>

        <hr className="border-gray-200" />

        <section>
          <h2 className="text-lg font-semibold text-red-700">Danger Zone</h2>
          <p className="text-sm text-gray-500 mb-3">Delete all local collection and deck data. This cannot be undone.</p>
          <button
            type="button"
            onClick={handleClear}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Clear All Data
          </button>
        </section>
      </div>
    </div>
  )
}
