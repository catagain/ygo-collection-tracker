import { create } from 'zustand'
import type { AppSettings, CollectionItem, Deck } from '../types/index.ts'

interface AppState {
  collection: CollectionItem[]
  decks: Deck[]
  settings: AppSettings | null
  isCollectionFormOpen: boolean
  isReady: boolean
  isLoading: boolean
  error: string | null
  setCollection: (items: CollectionItem[]) => void
  setDecks: (decks: Deck[]) => void
  setSettings: (settings: AppSettings | null) => void
  openCollectionForm: () => void
  closeCollectionForm: () => void
  setReady: (ready: boolean) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  collection: [],
  decks: [],
  settings: null,
  isCollectionFormOpen: false,
  isReady: false,
  isLoading: false,
  error: null,
  setCollection: (items) => set({ collection: items }),
  setDecks: (decks) => set({ decks }),
  setSettings: (settings) => set({ settings }),
  openCollectionForm: () => set({ isCollectionFormOpen: true }),
  closeCollectionForm: () => set({ isCollectionFormOpen: false }),
  setReady: (ready) => set({ isReady: ready }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
}))
