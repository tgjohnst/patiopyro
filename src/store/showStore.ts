import { useStore } from 'zustand';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { temporal, type TemporalState } from 'zundo';
import { createEmptyShow } from '../model/defaults';
import { parseShow, type Show } from '../model/schema';
import { computeCost, type CostReport } from '../engine/cost';
import { computeTiming, type TimingResult } from '../engine/timing';
import { computeTotals, type Totals } from '../engine/totals';
import { validateShow, type Issue } from '../engine/validation';

interface ShowState {
  show: Show;
  replaceShow: (show: Show) => void;
  mutate: (fn: (draft: Show) => void) => void;
}

type Snapshot = { show: Show };

export const useShowStore = create<ShowState>()(
  persist(
    temporal(
      immer((set) => ({
        show: createEmptyShow(),
        replaceShow: (show) =>
          set((st) => {
            st.show = show;
          }),
        mutate: (fn) =>
          set((st) => {
            fn(st.show);
          }),
      })),
      {
        partialize: (s): Snapshot => ({ show: s.show }),
        equality: (a, b) => a.show === b.show,
        limit: 200,
      },
    ),
    {
      name: 'patiopyro:show',
      version: 1,
      partialize: (s) => ({ show: s.show }),
      merge: (persisted, current) => {
        if (!(persisted as Partial<Snapshot> | undefined)?.show) return current;
        try {
          return { ...current, show: parseShow((persisted as Partial<Snapshot>)?.show) };
        } catch (e) {
          console.warn('Discarding unreadable autosave', e);
          return current;
        }
      },
      onRehydrateStorage: () => () => {
        queueMicrotask(() => useShowStore.temporal.getState().clear());
      },
    },
  ),
);

export function useShow<T>(selector: (show: Show) => T): T {
  return useShowStore((st) => selector(st.show));
}

export const getShow = () => useShowStore.getState().show;

export function mutate(fn: (draft: Show) => void) {
  useShowStore.getState().mutate(fn);
}

export function replaceShow(show: Show) {
  useShowStore.getState().replaceShow(show);
  useShowStore.temporal.getState().clear();
}

export function useTemporal<T>(selector: (s: TemporalState<Snapshot>) => T): T {
  return useStore(useShowStore.temporal, selector);
}

export const undo = () => useShowStore.temporal.getState().undo();
export const redo = () => useShowStore.temporal.getState().redo();

export interface Derived {
  timing: TimingResult;
  totals: Totals;
  cost: CostReport;
  issues: Issue[];
}

const derivedCache = new WeakMap<Show, Derived>();

export function derive(show: Show): Derived {
  let d = derivedCache.get(show);
  if (!d) {
    const timing = computeTiming(show);
    const totals = computeTotals(show);
    d = { timing, totals, cost: computeCost(show, totals), issues: validateShow(show, timing, totals) };
    derivedCache.set(show, d);
  }
  return d;
}

/** Engine results for the current show, recomputed only when the show changes. */
export function useDerived(): Derived {
  return derive(useShowStore((st) => st.show));
}
