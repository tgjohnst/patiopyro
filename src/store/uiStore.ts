import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Tab = 'inventory' | 'site' | 'positions' | 'firing' | 'timeline' | 'reports';
export type PrintView = 'worksheet' | 'plan' | null;
export type TimelineGraph = 'shots' | 'cost';

interface UiState {
  tab: Tab;
  positionId: string | null;
  rackPlacedId: string | null;
  inventoryOpen: boolean;
  showMode: boolean;
  printView: PrintView;
  /** Timeline graph rows: bin size and which are shown. */
  graphBinSec: number;
  graphs: Record<TimelineGraph, boolean>;
  setTab: (tab: Tab) => void;
  setPositionId: (id: string | null) => void;
  openRack: (placedId: string | null) => void;
  toggleInventory: () => void;
  setShowMode: (on: boolean) => void;
  setPrintView: (v: PrintView) => void;
  setGraphBinSec: (sec: number) => void;
  toggleGraph: (g: TimelineGraph) => void;
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
      graphBinSec: 5,
      graphs: { shots: true, cost: true },
      setTab: (tab) => set({ tab }),
      setPositionId: (positionId) => set({ positionId }),
      openRack: (rackPlacedId) => set({ rackPlacedId }),
      toggleInventory: () => set((s) => ({ inventoryOpen: !s.inventoryOpen })),
      setShowMode: (showMode) => set({ showMode }),
      setPrintView: (printView) => set({ printView }),
      setGraphBinSec: (graphBinSec) => set({ graphBinSec }),
      toggleGraph: (g) => set((s) => ({ graphs: { ...s.graphs, [g]: !s.graphs[g] } })),
    }),
    {
      name: 'patiopyro:ui',
      partialize: (s) => ({
        tab: s.tab,
        positionId: s.positionId,
        inventoryOpen: s.inventoryOpen,
        graphBinSec: s.graphBinSec,
        graphs: s.graphs,
      }),
    },
  ),
);

/** MIME type used when dragging catalog items out of the inventory panel. */
export const DND_CATALOG = 'application/x-patiopyro-catalog';
