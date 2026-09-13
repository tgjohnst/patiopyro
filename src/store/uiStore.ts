import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Tab = 'inventory' | 'site' | 'positions' | 'firing' | 'timeline' | 'reports';
export type PrintView = 'worksheet' | 'plan' | null;

interface UiState {
  tab: Tab;
  positionId: string | null;
  rackPlacedId: string | null;
  inventoryOpen: boolean;
  showMode: boolean;
  printView: PrintView;
  setTab: (tab: Tab) => void;
  setPositionId: (id: string | null) => void;
  openRack: (placedId: string | null) => void;
  toggleInventory: () => void;
  setShowMode: (on: boolean) => void;
  setPrintView: (v: PrintView) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      tab: 'inventory',
      positionId: null,
      rackPlacedId: null,
      inventoryOpen: true,
      showMode: false,
      printView: null,
      setTab: (tab) => set({ tab }),
      setPositionId: (positionId) => set({ positionId }),
      openRack: (rackPlacedId) => set({ rackPlacedId }),
      toggleInventory: () => set((s) => ({ inventoryOpen: !s.inventoryOpen })),
      setShowMode: (showMode) => set({ showMode }),
      setPrintView: (printView) => set({ printView }),
    }),
    {
      name: 'patiopyro:ui',
      partialize: (s) => ({ tab: s.tab, positionId: s.positionId, inventoryOpen: s.inventoryOpen }),
    },
  ),
);

/** MIME type used when dragging catalog items out of the inventory panel. */
export const DND_CATALOG = 'application/x-patiopyro-catalog';
