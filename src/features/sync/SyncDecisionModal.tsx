import { useEffect } from 'react'
import { CloudDownload, Laptop } from 'lucide-react'
import type { LocalCloudComparison } from '../../services/sync.ts'

interface Props {
  comparison: LocalCloudComparison
  onUseLocal: () => void
  onUseCloud: () => void
  onDismiss: () => void
}

export function SyncDecisionModal({ comparison, onUseLocal, onUseCloud, onDismiss }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onDismiss])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-lg font-bold text-gray-900">Sync your collection</h2>
        <p className="text-sm text-gray-500 mt-1">
          Your account has cloud data that differs from what's saved on this device. Choose which one to keep.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-center gap-1.5 text-gray-700 font-medium text-sm">
              <Laptop className="w-4 h-4" />
              This device
            </div>
            <p className="text-xs text-gray-500 mt-1">Cards: {comparison.local.cards}</p>
            <p className="text-xs text-gray-500">Decks: {comparison.local.decks}</p>
            <button
              type="button"
              onClick={onUseLocal}
              className="mt-3 w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white hover:bg-gray-900"
            >
              Use local data
            </button>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <div className="flex items-center gap-1.5 text-blue-700 font-medium text-sm">
              <CloudDownload className="w-4 h-4" />
              Cloud
            </div>
            <p className="text-xs text-blue-600 mt-1">
              {comparison.hasCloud ? `Cards: ${comparison.cloud.cards}` : 'No cloud data yet'}
            </p>
            <p className="text-xs text-blue-600">{comparison.hasCloud ? `Decks: ${comparison.cloud.decks}` : ''}</p>
            <button
              type="button"
              onClick={onUseCloud}
              disabled={!comparison.hasCloud}
              className="mt-3 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-40"
            >
              Use cloud data
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="mt-4 text-sm text-gray-400 hover:text-gray-600"
        >
          Not now
        </button>
      </div>
    </div>
  )
}