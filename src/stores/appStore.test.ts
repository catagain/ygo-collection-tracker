import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from './appStore.ts'

describe('appStore UI state', () => {
  beforeEach(() => {
    useAppStore.setState({
      isCollectionFormOpen: false,
      collection: [],
      decks: [],
      settings: null,
      isReady: false,
      isLoading: false,
      error: null,
    })
  })

  it('starts with the collection form closed', () => {
    expect(useAppStore.getState().isCollectionFormOpen).toBe(false)
  })

  it('opens and closes the collection form', () => {
    useAppStore.getState().openCollectionForm()
    expect(useAppStore.getState().isCollectionFormOpen).toBe(true)

    useAppStore.getState().closeCollectionForm()
    expect(useAppStore.getState().isCollectionFormOpen).toBe(false)
  })
})