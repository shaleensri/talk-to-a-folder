'use client'

import { create } from 'zustand'

interface UIStore {
  // Citation ↔ source panel sync
  highlightedCitationId: string | null
  setHighlightedCitationId: (id: string | null) => void

  // Active expanded source card (click on citation → expand card)
  expandedSourceId: string | null
  setExpandedSourceId: (id: string | null) => void

  // Document viewer — which file is currently open in the center panel
  openFileId: string | null
  setOpenFileId: (id: string | null) => void

  // Add folder modal
  addFolderModalOpen: boolean
  setAddFolderModalOpen: (open: boolean) => void

  // Three-column panel widths (px).
  // Center width is derived: totalWidth - leftWidth - rightWidth - 10px for dividers.
  leftPanelWidth: number
  rightPanelWidth: number
  setLeftPanelWidth: (w: number) => void
  setRightPanelWidth: (w: number) => void
}

export const useUIStore = create<UIStore>((set) => ({
  highlightedCitationId: null,
  setHighlightedCitationId: (id) => set({ highlightedCitationId: id }),

  expandedSourceId: null,
  setExpandedSourceId: (id) => set({ expandedSourceId: id }),

  openFileId: null,
  setOpenFileId: (id) => set({ openFileId: id }),

  addFolderModalOpen: false,
  setAddFolderModalOpen: (open) => set({ addFolderModalOpen: open }),

  leftPanelWidth: 240,
  rightPanelWidth: 380,
  setLeftPanelWidth: (w) => set({ leftPanelWidth: w }),
  setRightPanelWidth: (w) => set({ rightPanelWidth: w }),
}))
