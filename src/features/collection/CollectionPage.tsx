import { PlusIcon } from 'lucide-react'
import { CollectionAddForm } from './CollectionAddForm.tsx'
import { CollectionList } from './CollectionList.tsx'
import { useAppStore } from '../../stores/appStore.ts'

export function CollectionPage() {
  const isCollectionFormOpen = useAppStore((s) => s.isCollectionFormOpen)
  const openCollectionForm = useAppStore((s) => s.openCollectionForm)
  const closeCollectionForm = useAppStore((s) => s.closeCollectionForm)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Collection</h1>
          <p className="text-sm text-gray-500">Manage your Yu-Gi-Oh! card collection.</p>
        </div>
        <button
          type="button"
          onClick={() => (isCollectionFormOpen ? closeCollectionForm() : openCollectionForm())}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          {isCollectionFormOpen ? 'Close' : 'Add Card'}
        </button>
      </div>

      {isCollectionFormOpen && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <CollectionAddForm onAdded={closeCollectionForm} />
        </div>
      )}

      <CollectionList />
    </div>
  )
}