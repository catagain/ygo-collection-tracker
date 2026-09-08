import { ChartPieIcon, Database, FolderIcon, Layers, Menu, Settings } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { fetchCurrentUser } from '../../services/auth.ts'
import { applyCloudToLocal, compareLocalVsCloud, fetchCloudData, pushLocalToCloud, type LocalCloudComparison } from '../../services/sync.ts'
import { getSettings } from '../../services/storage.ts'
import { useAppStore } from '../../stores/appStore.ts'
import { SyncDecisionModal } from '../../features/sync/SyncDecisionModal.tsx'

const navItems = [
  { to: '/', label: 'Dashboard', icon: ChartPieIcon },
  { to: '/collection', label: 'Collection', icon: FolderIcon },
  { to: '/decks', label: 'Decks', icon: Layers },
  { to: '/analysis', label: 'Analysis', icon: ChartPieIcon },
  { to: '/database', label: 'Database', icon: Database },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const setSettings = useAppStore((s) => s.setSettings)
  const openCollectionForm = useAppStore((s) => s.openCollectionForm)
  const navigate = useNavigate()
  const location = useLocation()
  const [syncComparison, setSyncComparison] = useState<LocalCloudComparison | null>(null)
  const [syncBusy, setSyncBusy] = useState(false)

  // The deck builder needs a wider canvas than the regular pages.
  const isDeckBuilder = location.pathname.includes('/build')

  useEffect(() => {
    getSettings().then(setSettings)
  }, [setSettings])

  // Cloud-sync decision: after the user logs in, if the account has cloud data
  // that differs from this device, ask which side wins (once per session).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const user = await fetchCurrentUser()
      if (cancelled || !user) return
      const decidedKey = `ygo_sync_decided_${user.email}`
      if (sessionStorage.getItem(decidedKey)) return
      const comparison = await compareLocalVsCloud()
      if (cancelled || !comparison.signedIn || !comparison.differs) return
      setSyncComparison(comparison)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleUseLocal = useCallback(async () => {
    const user = await fetchCurrentUser()
    if (!user) return
    setSyncBusy(true)
    try {
      await pushLocalToCloud()
      sessionStorage.setItem(`ygo_sync_decided_${user.email}`, 'local')
      setSyncComparison(null)
      window.location.reload()
    } finally {
      setSyncBusy(false)
    }
  }, [])

  const handleUseCloud = useCallback(async () => {
    const user = await fetchCurrentUser()
    if (!user) return
    setSyncBusy(true)
    try {
      const cloud = await fetchCloudData(true)
      if (cloud) {
        await applyCloudToLocal(cloud)
        sessionStorage.setItem(`ygo_sync_decided_${user.email}`, 'cloud')
        setSyncComparison(null)
        window.location.reload()
      }
    } finally {
      setSyncBusy(false)
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        if (isEditableTarget(e.target)) return
        if (location.pathname !== '/collection') {
          navigate('/collection')
        }
        openCollectionForm()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate, openCollectionForm, location.pathname])

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50 text-gray-900">
      <aside className="bg-white border-r border-gray-200 md:w-64 flex-shrink-0">
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
          <span className="font-bold text-lg text-blue-600">YGO Tracker</span>
          <button
            type="button"
            className="md:hidden p-2 rounded-md hover:bg-gray-100"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
        <nav className={`px-2 py-4 space-y-1 ${menuOpen ? 'block' : 'hidden md:block'}`}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="flex-1 min-w-0 overflow-hidden">
        <div
          className={`mx-auto py-6 md:py-8 ${
            isDeckBuilder ? 'max-w-[1700px] px-4 md:px-6' : 'max-w-6xl px-4 md:px-8'
          }`}
        >
          <Outlet />
        </div>
      </main>

      {syncComparison && !syncBusy && (
        <SyncDecisionModal
          comparison={syncComparison}
          onUseLocal={handleUseLocal}
          onUseCloud={handleUseCloud}
          onDismiss={() => setSyncComparison(null)}
        />
      )}
    </div>
  )
}
