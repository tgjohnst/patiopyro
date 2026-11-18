import { cueDistrict, flatAddressId, parseAddress, pinAddress } from '../model/addressing';
import { blockSpan, cueBlockSize, restorePinTimes, snapshotPinTimes } from '../model/programming';
import type { FiringModule, Show } from '../model/schema';

export interface ModulePlan {
  moduleId: string;
  name: string;
  currentStart: number;
  suggestedStart: number;
  /** Other modules coded to the same block, which fire with this one. */
  linkedWith: string[];
  /** Earliest fire time of a wired pin, null when nothing on it is timed. */
  firstTime: number | null;
  wired: boolean;
}

export interface SequenceStats {
  /** Times the next cue to fire is on a lower remote cue than the one before. */
  backtracks: number;
  /** District changes between consecutive cues (0 when the remote has no districts). */
  districtSwitches: number;
  /** Highest remote cue used. */
  lastCue: number;
}

export interface ProgrammingPlan {
  block: number;
  modules: ModulePlan[];
  before: SequenceStats;
  after: SequenceStats;
  capacity: number;
  /** The plan needs more remote cues than the controller has. */
  overCapacity: boolean;
  /** Anything differs from the current programming (including single-cue links to drop). */
  changed: boolean;
  notes: string[];
}

const SAME_TIME = 1e-6;

/** Fire time per pin (index 0 = pin 1): undefined = not wired, null = wired but not timed. */
function pinTimeline(show: Show, m: FiringModule): (number | null | undefined)[] {
  const out: (number | null | undefined)[] = Array.from({ length: m.cueCount }, () => undefined);
  for (const n of show.fuseNodes) {
    if (n.kind !== 'igniter' || n.moduleId !== m.id || n.pin > m.cueCount) continue;
    out[n.pin - 1] = show.cueTimes[pinAddress(show.firing.controller, m, n.pin)] ?? null;
  }
  return out;
}

/**
 * Two receivers can share a block when they have the same size, every pin wired on both fires
 * at the same time, and at least one such pin exists (so linking saves a button press).
 */
function canShareBlock(
  a: (number | null | undefined)[],
  b: (number | null | undefined)[],
): boolean {
  if (a.length !== b.length) return false;
  let shared = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === undefined || b[i] === undefined) continue;
    if (a[i] === null || b[i] === null) return false;
    if (Math.abs((a[i] as number) - (b[i] as number)) > SAME_TIME) return false;
    shared++;
  }
  return shared > 0;
}

/** How smoothly the operator can step through the remote in fire order. */
export function sequenceStats(show: Show): SequenceStats {
  const ctrl = show.firing.controller;
  const cues = new Map<number, number>();
  for (const n of show.fuseNodes) {
    if (n.kind !== 'igniter') continue;
    const m = show.firing.modules.find((x) => x.id === n.moduleId);
    if (!m) continue;
    const addr = pinAddress(ctrl, m, n.pin);
    const p = parseAddress(addr);
    const t = show.cueTimes[addr];
    if (p?.kind === 'flat' && t !== undefined) cues.set(p.cue, t);
  }
  const order = [...cues.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([cue]) => cue);
  let backtracks = 0;
  let districtSwitches = 0;
  for (let i = 1; i < order.length; i++) {
    if (order[i] < order[i - 1]) backtracks++;
    const d0 = cueDistrict(ctrl, flatAddressId(order[i - 1]));
    const d1 = cueDistrict(ctrl, flatAddressId(order[i]));
    if (d0 && d1 && d0.key !== d1.key) districtSwitches++;
  }
  return { backtracks, districtSwitches, lastCue: Math.max(0, ...cues.keys()) };
}

/** The show with modules coded to `starts` and single-cue links dropped; cue times follow their pins. */
export function withModuleStarts(show: Show, starts: Record<string, number>): Show {
  const next: Show = structuredClone(show);
  const snap = snapshotPinTimes(next);
  for (const m of next.firing.modules) {
    m.pinOverrides = {};
    if (starts[m.id] !== undefined) m.startCue = starts[m.id];
  }
  restorePinTimes(next, snap);
  return next;
}

/**
 * Suggest how to code block receivers (Bilusocn) for the current show. Receivers are laid out
 * on the remote in the order they first fire, so the operator steps forward through the cues;
 * receivers whose shared pins fire at the same moments are coded to one block so a single
 * button fires them together; a receiver isn't split across a remote district when it fits in
 * one; receivers with nothing wired go last. Returns null for controllers without blocks.
 */
export function suggestModuleProgramming(show: Show): ProgrammingPlan | null {
  const ctrl = show.firing.controller;
  const block = cueBlockSize(ctrl);
  if (!block) return null;
  const modules = show.firing.modules;

  const info = modules.map((m, index) => {
    const pins = pinTimeline(show, m);
    const timed = pins.filter((t): t is number => typeof t === 'number');
    return {
      m,
      index,
      pins,
      wired: pins.some((t) => t !== undefined),
      firstTime: timed.length ? Math.min(...timed) : null,
    };
  });
  const sorted = [...info].sort(
    (a, b) =>
      Number(!a.wired) - Number(!b.wired) ||
      (a.firstTime ?? Infinity) - (b.firstTime ?? Infinity) ||
      a.m.startCue - b.m.startCue ||
      a.index - b.index,
  );

  // Group receivers that can fire as one, joining the earliest compatible group.
  const groups: (typeof info)[] = [];
  for (const mi of sorted) {
    const group = mi.wired
      ? groups.find((g) => g[0].wired && g.every((o) => canShareBlock(o.pins, mi.pins)))
      : undefined;
    if (group) group.push(mi);
    else groups.push([mi]);
  }

  const district = ctrl.cuesPerDistrict;
  const respectDistricts = district > 0 && district % block === 0;
  const starts: Record<string, number> = {};
  let cursor = 1;
  for (const g of groups) {
    const span = blockSpan(g[0].m.cueCount, block);
    if (respectDistricts && span <= district) {
      const used = (cursor - 1) % district;
      if (used + span > district) cursor += district - used;
    }
    for (const mi of g) starts[mi.m.id] = cursor;
    cursor += span;
  }

  const suggested = withModuleStarts(show, starts);
  const notes: string[] = [];
  const lastCue = cursor - 1;
  const overCapacity = lastCue > ctrl.cuesPerChannel;
  if (overCapacity) {
    notes.push(
      `These receivers need ${lastCue} remote cues but ${ctrl.name} has ${ctrl.cuesPerChannel}.`,
    );
  }
  for (const mi of info) {
    if (!mi.wired) continue;
    const timed = mi.pins
      .map((t, i) => ({ t, pin: i + 1 }))
      .filter((p): p is { t: number; pin: number } => typeof p.t === 'number');
    const outOfOrder = timed.find((p, i) => i > 0 && p.t < timed[i - 1].t);
    if (outOfOrder) {
      notes.push(
        `${mi.m.name}: cue ${outOfOrder.pin} fires before an earlier cue on the receiver. Rewire its pins in fire order to step forward through the remote.`,
      );
    }
    if (mi.pins.some((t) => t === null)) {
      notes.push(
        `${mi.m.name} has wired cues with no time yet, so it can't be linked with another receiver.`,
      );
    }
  }
  const unwired = info.filter((mi) => !mi.wired);
  if (unwired.length > 0) {
    notes.push(
      `Nothing is wired to ${unwired.map((mi) => mi.m.name).join(', ')}; ${unwired.length > 1 ? 'they go' : 'it goes'} last.`,
    );
  }

  const plans: ModulePlan[] = sorted.map((mi) => ({
    moduleId: mi.m.id,
    name: mi.m.name,
    currentStart: mi.m.startCue,
    suggestedStart: starts[mi.m.id],
    linkedWith: info
      .filter((o) => o.m.id !== mi.m.id && starts[o.m.id] === starts[mi.m.id])
      .map((o) => o.m.name),
    firstTime: mi.firstTime,
    wired: mi.wired,
  }));

  return {
    block,
    modules: plans,
    before: sequenceStats(show),
    after: sequenceStats(suggested),
    capacity: ctrl.cuesPerChannel,
    overCapacity,
    changed: modules.some(
      (m) => m.startCue !== starts[m.id] || Object.keys(m.pinOverrides).length > 0,
    ),
    notes,
  };
}
