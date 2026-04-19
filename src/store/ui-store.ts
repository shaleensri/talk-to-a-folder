'use client'

import { create } from 'zustand'

export type RightPanelTab = 'sources' | 'folder-view' | 'debug'

interface UIStore {
  // Citation ↔ source panel sync
  highlightedCitationId: string | null
  setHighlightedCitationId: (id: string | null) => void

  // Right panel
  rightPanelTab: RightPanelTab
  setRightPanelTab: (tab: RightPanelTab) => void
  rightPanelOpen: boolean
  setRightPanelOpen: (open: boolean) => void

  // Sidebar
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void

  // Add folder modal
  addFolderModalOpen: boolean
  setAddFolderModalOpen: (open: boolean) => void

  // Active expanded source card (click on citation → expand card)
  expandedSourceId: string | null
  setExpandedSourceId: (id: string | null) => void
}

export const useUIStore = create<UIStore>((set) => ({
  highlightedCitationId: null,
  setHighlightedCitationId: (id) => set({ highlightedCitationId: id }),

  rightPanelTab: 'sources',
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  rightPanelOpen: true,
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),

  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  addFolderModalOpen: false,
  setAddFolderModalOpen: (open) => set({ addFolderModalOpen: open }),

  expandedSourceId: null,
  setExpandedSourceId: (id) => set({ expandedSourceId: id }),
}))
