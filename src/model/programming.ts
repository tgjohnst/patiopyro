import { pinAddress } from './addressing';
import { presetById } from './presets';
import type { Controller, FiringModule, Show } from './schema';

/**
 * Remote cues per receiver block when the controller codes whole receivers to blocks of
 * sequential cues (Bilusocn: 4), or null when receivers and single cues can go anywhere.
 */
export function cueBlockSize(ctrl: Controller): number | null {
  if (ctrl.addressing !== 'flat') return null;
  return presetById(ctrl.presetId).cueBlockSize ?? null;
}

/** The block start at or below `cue`: with blocks of 4, 7 → 5. */
export function alignDown(cue: number, block: number): number {
  return Math.floor((Math.max(1, cue) - 1) / block) * block + 1;
}

/** The block start at or above `cue`: with blocks of 4, 6 → 9. */
export function alignUp(cue: number, block: number): number {
  return Math.ceil((Math.max(1, cue) - 1) / block) * block + 1;
}

/** Remote cues a receiver takes up, rounded up to whole blocks. */
export function blockSpan(cueCount: number, block: number): number {
  return Math.max(1, Math.ceil(cueCount / block)) * block;
}

/** Start cues a receiver can be coded to on this controller: 1, 5, 9… */
export function blockStarts(ctrl: Controller, block: number): number[] {
  const out: number[] = [];
  for (let c = 1; c <= ctrl.cuesPerChannel; c += block) out.push(c);
  return out;
}

export type PinTimeSnapshot = { moduleId: string; pin: number; time?: number; note?: string }[];

/** Pin -> fire time snapshot, so cue times survive addressing changes. */
export function snapshotPinTimes(s: Show): PinTimeSnapshot {
  const out: PinTimeSnapshot = [];
  for (const n of s.fuseNodes) {
    if (n.kind !== 'igniter') continue;
    const mod = s.firing.modules.find((m) => m.id === n.moduleId);
    if (!mod) continue;
    const addr = pinAddress(s.firing.controller, mod, n.pin);
    out.push({ moduleId: mod.id, pin: n.pin, time: s.cueTimes[addr], note: s.cueNotes[addr] });
  }
  return out;
}

/** Put snapshot times back on whatever addresses the pins fire on now (mutates `s`). */
export function restorePinTimes(s: Show, snapshot: PinTimeSnapshot) {
  const times: Record<string, number> = {};
  const notes: Record<string, string> = {};
  for (const p of snapshot) {
    const mod = s.firing.modules.find((m) => m.id === p.moduleId);
    if (!mod) continue;
    const addr = pinAddress(s.firing.controller, mod, p.pin);
    if (p.time !== undefined) times[addr] = Math.min(times[addr] ?? Infinity, p.time);
    if (p.note) notes[addr] = p.note;
  }
  s.cueTimes = times;
  s.cueNotes = notes;
}

/** Whether a module breaks the block rules: single cues remapped, or a start off a block boundary. */
export function breaksBlockRules(m: FiringModule, block: number): boolean {
  return Object.keys(m.pinOverrides).length > 0 || alignDown(m.startCue, block) !== m.startCue;
}

/**
 * On block-coded controllers, drop single-cue links and move receivers onto block boundaries
 * (mutates `s`). Receivers already on a boundary stay put, so whole-receiver links survive.
 * One that started mid-block goes to the first free block from where it was, so it isn't
 * quietly linked with another receiver. Wired pins keep their fire times.
 * Returns the names of the modules that changed.
 */
export function enforceBlockProgramming(s: Show): string[] {
  const block = cueBlockSize(s.firing.controller);
  if (!block) return [];
  const broken = s.firing.modules.filter((m) => breaksBlockRules(m, block));
  if (broken.length === 0) return [];

  const snap = snapshotPinTimes(s);
  const taken: [number, number][] = [];
  const misplaced: FiringModule[] = [];
  for (const m of s.firing.modules) {
    m.pinOverrides = {};
    if (alignDown(m.startCue, block) === m.startCue)
      taken.push([m.startCue, m.startCue + blockSpan(m.cueCount, block) - 1]);
    else misplaced.push(m);
  }
  const free = (start: number, span: number) =>
    taken.every(([a, b]) => start + span - 1 < a || start > b);
  for (const m of misplaced) {
    const span = blockSpan(m.cueCount, block);
    const last = Math.max(1, s.firing.controller.cuesPerChannel - span + 1);
    let start: number | null = null;
    for (let c = alignDown(m.startCue, block); c <= last && start === null; c += block)
      if (free(c, span)) start = c;
    for (let c = 1; c <= last && start === null; c += block) if (free(c, span)) start = c;
    m.startCue = start ?? alignDown(m.startCue, block);
    taken.push([m.startCue, m.startCue + span - 1]);
  }
  restorePinTimes(s, snap);
  return broken.map((m) => m.name);
}
