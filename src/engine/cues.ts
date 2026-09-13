import { describeAddress, pinAddress } from '../model/addressing';
import type { Show } from '../model/schema';
import type { EffectTiming, TimingResult } from './timing';

export interface CueEntry {
  addressId: string;
  label: string;
  order: number;
  time: number | null;
  note: string;
  /** Module pins wired to this address, e.g. "M1 #3". */
  pins: { moduleId: string; moduleName: string; pin: number }[];
  positionIds: string[];
  effects: EffectTiming[];
}

/** Every controller cue that has at least one igniter wired, sorted by fire time. */
export function buildCueList(show: Show, timing: TimingResult): CueEntry[] {
  const ctrl = show.firing.controller;
  const map = new Map<string, CueEntry>();
  for (const n of show.fuseNodes) {
    if (n.kind !== 'igniter') continue;
    const mod = show.firing.modules.find((m) => m.id === n.moduleId);
    if (!mod) continue;
    const addr = pinAddress(ctrl, mod, n.pin);
    let entry = map.get(addr);
    if (!entry) {
      const d = describeAddress(addr, show.firing.modules);
      entry = {
        addressId: addr,
        label: d.label,
        order: d.order,
        time: show.cueTimes[addr] ?? null,
        note: show.cueNotes[addr] ?? '',
        pins: [],
        positionIds: [],
        effects: [],
      };
      map.set(addr, entry);
    }
    if (!entry.pins.some((p) => p.moduleId === mod.id && p.pin === n.pin)) {
      entry.pins.push({ moduleId: mod.id, moduleName: mod.name, pin: n.pin });
    }
    if (!entry.positionIds.includes(n.positionId)) entry.positionIds.push(n.positionId);
  }
  for (const e of timing.effects) map.get(e.addressId)?.effects.push(e);

  return [...map.values()].sort(
    (a, b) => (a.time ?? Infinity) - (b.time ?? Infinity) || a.order - b.order,
  );
}
