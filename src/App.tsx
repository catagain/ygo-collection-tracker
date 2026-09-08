import { Navigate, Route, HashRouter, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout.tsx'
import { AnalysisPage } from './features/analysis/AnalysisPage.tsx'
import { CollectionPage } from './features/collection/CollectionPage.tsx'
import { DashboardPage } from './features/dashboard/DashboardPage.tsx'
import { DatabaseAdminPage } from './features/database/DatabaseAdminPage.tsx'
import { DeckBuilderPage } from './features/deckBuilder/DeckBuilderPage.tsx'
import { DecksPage } from './features/decks/DecksPage.tsx'
import { SettingsPage } from './features/settings/SettingsPage.tsx'

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="collection" element={<CollectionPage />} />
          <Route path="decks" element={<DecksPage />} />
          <Route path="decks/:deckId/build" element={<DeckBuilderPage />} />
          <Route path="analysis/:deckId?" element={<AnalysisPage />} />
          <Route path="database" element={<DatabaseAdminPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App
