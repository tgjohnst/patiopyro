import { describeAddress } from '../model/addressing';
import { outKey, parseEndpoint } from '../model/endpoints';
import type { Show } from '../model/schema';
import { computeTiming, type TimingResult } from './timing';

/**
 * Why something is still live after the show: marked a dud, its cue misfired, the fuse that
 * should have lit it came from a dud cake's exit fuse, or it was never connected to a timed cue.
 */
export type SweepReason = 'dud' | 'misfire' | 'unlit' | 'unconnected';

export interface SweepEntry {
  /** Endpoint key: the item's lead fuse, or the rack tube. */
  key: string;
  placedId: string;
  tubeIndex: number | null;
  positionId: string;
  /** The firework: the item, or what is loaded in the rack tube. */
  name: string;
  /** Rack the tube is in; null for items on their own. */
  rackName: string | null;
  /** The placed item's label, '' when none. */
  label: string;
  boardName: string | null;
  /** The cue that was to light it; null when it was never connected. */
  cueLabel: string | null;
  /** When it was to go off; null when it was never connected. */
  plannedSec: number | null;
  reason: SweepReason;
}

export function hasSweepMarks(show: Show): boolean {
  return show.sweep.misfires.length > 0 || show.sweep.duds.length > 0;
}

/**
 * The show as it actually burned: misfired cues never fired, and dud cakes never lit their
 * exit fuse. A dud in a rack tube doesn't stop fuse running on through the rack.
 */
export function showAsFired(show: Show): Show {
  const misfires = new Set(show.sweep.misfires);
  const cut = new Set<string>();
  for (const k of show.sweep.duds) {
    const e = parseEndpoint(k);
    if (e?.kind === 'in') cut.add(outKey(e.placedId));
  }
  return {
    ...show,
    cueTimes: Object.fromEntries(Object.entries(show.cueTimes).filter(([a]) => !misfires.has(a))),
    fuseSegments: show.fuseSegments.filter((s) => !cut.has(s.from) && !cut.has(s.to)),
  };
}

/** Everything still live after the show, by position, then rack or item, then tube. */
export function buildSweepList(show: Show, timing: TimingResult): SweepEntry[] {
  const fired = computeTiming(showAsFired(show));
  const duds = new Set(show.sweep.duds);
  const misfires = new Set(show.sweep.misfires);
  const placed = new Map(show.placed.map((p) => [p.id, p]));
  const catalog = new Map(show.catalog.map((c) => [c.id, c]));
  const boards = new Map(show.boards.map((b) => [b.id, b]));
  const ctrl = show.firing.controller;

  const entry = (
    e: {
      key: string;
      placedId: string;
      tubeIndex: number | null;
      positionId: string;
      name: string;
    },
    reason: SweepReason,
    cue: { addressId: string; startSec: number } | null,
  ): SweepEntry => {
    const p = placed.get(e.placedId);
    return {
      key: e.key,
      placedId: e.placedId,
      tubeIndex: e.tubeIndex,
      positionId: e.positionId,
      name: e.name,
      rackName: e.tubeIndex !== null ? (catalog.get(p?.catalogId ?? '')?.name ?? 'Rack') : null,
      label: p?.label ?? '',
      boardName: p?.boardId ? (boards.get(p.boardId)?.name ?? null) : null,
      cueLabel: cue ? describeAddress(ctrl, show.firing.modules, cue.addressId).label : null,
      plannedSec: cue?.startSec ?? null,
      reason,
    };
  };

  const out: SweepEntry[] = [];
  for (const e of timing.effects) {
    if (duds.has(e.key)) out.push(entry(e, 'dud', e));
    else if (!fired.arrivals.has(e.key))
      out.push(entry(e, misfires.has(e.addressId) ? 'misfire' : 'unlit', e));
  }
  for (const u of timing.unscheduled) out.push(entry(u, 'unconnected', null));

  const posOrder = new Map(show.positions.map((p, i) => [p.id, i]));
  const where = (s: SweepEntry) => s.rackName ?? s.name;
  return out.sort(
    (a, b) =>
      (posOrder.get(a.positionId) ?? Infinity) - (posOrder.get(b.positionId) ?? Infinity) ||
      where(a).localeCompare(where(b)) ||
      a.placedId.localeCompare(b.placedId) ||
      (a.tubeIndex ?? -1) - (b.tubeIndex ?? -1),
  );
}
