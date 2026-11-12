import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Tab = 'inventory' | 'site' | 'positions' | 'firing' | 'timeline' | 'reports';
export type PrintView = 'worksheet' | 'plan' | 'overview' | null;
export type TimelineGraph = 'shots' | 'cost';

/** What goes in the show overview PDF. The at-a-glance page is always included. */
export interface OverviewOptions {
  scenes: boolean;
  lineup: boolean;
  /** Cost section, and prices and cost totals everywhere else. */
  cost: boolean;
  safety: boolean;
  /** Product links, with a QR code for each on paper. */
  links: boolean;
  paper: 'letter' | 'a4';
  orientation: 'landscape' | 'portrait';
}

export const DEFAULT_OVERVIEW: OverviewOptions = {
  scenes: true,
  lineup: true,
  cost: false,
  safety: false,
  links: true,
  paper: 'letter',
  orientation: 'landscape',
};

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
  overview: OverviewOptions;
  setTab: (tab: Tab) => void;
  setPositionId: (id: string | null) => void;
  openRack: (placedId: string | null) => void;
  toggleInventory: () => void;
  setShowMode: (on: boolean) => void;
  setPrintView: (v: PrintView) => void;
  setGraphBinSec: (sec: number) => void;
  toggleGraph: (g: TimelineGraph) => void;
  setOverview: (patch: Partial<OverviewOptions>) => void;
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
      overview: DEFAULT_OVERVIEW,
      setTab: (tab) => set({ tab }),
      setPositionId: (positionId) => set({ positionId }),
      openRack: (rackPlacedId) => set({ rackPlacedId }),
      toggleInventory: () => set((s) => ({ inventoryOpen: !s.inventoryOpen })),
      setShowMode: (showMode) => set({ showMode }),
      setPrintView: (printView) => set({ printView }),
      setGraphBinSec: (graphBinSec) => set({ graphBinSec }),
      toggleGraph: (g) => set((s) => ({ graphs: { ...s.graphs, [g]: !s.graphs[g] } })),
      setOverview: (patch) => set((s) => ({ overview: { ...s.overview, ...patch } })),
    }),
    {
      name: 'patiopyro:ui',
      partialize: (s) => ({
        tab: s.tab,
        positionId: s.positionId,
        inventoryOpen: s.inventoryOpen,
        graphBinSec: s.graphBinSec,
        graphs: s.graphs,
        overview: s.overview,
      }),
      // Options added in later versions fall back to their defaults.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UiState>;
        return { ...current, ...p, overview: { ...current.overview, ...p.overview } };
      },
    },
  ),
);

/** MIME type used when dragging catalog items out of the inventory panel. */
export const DND_CATALOG = 'application/x-patiopyro-catalog';
