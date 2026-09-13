import { addressInRange, describeAddress, pinAddress } from '../model/addressing';
import type { Show } from '../model/schema';
import type { TimingResult } from './timing';
import type { Totals } from './totals';

export interface Issue {
  level: 'error' | 'warning' | 'info';
  message: string;
  positionId?: string;
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function validateShow(show: Show, timing: TimingResult, totals: Totals): Issue[] {
  const issues: Issue[] = [];
  const ctrl = show.firing.controller;
  const modules = show.firing.modules;
  const posName = (id: string | null | undefined) =>
    show.positions.find((p) => p.id === id)?.name ?? 'unassigned';

  for (const inv of totals.inventory) {
    if (inv.used > inv.owned) {
      issues.push({
        level: 'error',
        message: `${inv.name}: ${inv.used} used but only ${inv.owned} in inventory.`,
      });
    }
  }

  if (ctrl.maxModules !== null && modules.length > ctrl.maxModules) {
    issues.push({
      level: 'error',
      message: `${ctrl.name} supports ${ctrl.maxModules} modules; ${modules.length} configured.`,
    });
  }

  const addressPins = new Map<string, Set<string>>();
  const perPin = new Map<string, number>();
  for (const n of show.fuseNodes) {
    if (n.kind !== 'igniter') continue;
    const mod = modules.find((m) => m.id === n.moduleId);
    if (!mod) {
      issues.push({
        level: 'error',
        message: `An igniter at ${posName(n.positionId)} references a deleted module.`,
        positionId: n.positionId,
      });
      continue;
    }
    if (n.pin > mod.cueCount) {
      issues.push({
        level: 'error',
        message: `${mod.name} has no cue ${n.pin} (it has ${mod.cueCount}).`,
        positionId: n.positionId,
      });
    }
    if (mod.positionId !== n.positionId) {
      issues.push({
        level: 'warning',
        message: `${mod.name} cue ${n.pin} is wired at ${posName(n.positionId)} but the module is at ${posName(mod.positionId)}.`,
        positionId: n.positionId,
      });
    }
    const pinKey = `${mod.id}:${n.pin}`;
    perPin.set(pinKey, (perPin.get(pinKey) ?? 0) + 1);
    const addr = pinAddress(ctrl, mod, n.pin);
    if (!addressPins.has(addr)) addressPins.set(addr, new Set());
    addressPins.get(addr)!.add(pinKey);
  }

  for (const [pinKey, count] of perPin) {
    if (count > ctrl.maxIgnitersPerCue) {
      const [modId, pin] = pinKey.split(':');
      const mod = modules.find((m) => m.id === modId)!;
      issues.push({
        level: 'warning',
        message: `${mod.name} cue ${pin} has ${count} igniters; ${ctrl.name} is set to fire at most ${ctrl.maxIgnitersPerCue} per cue.`,
        positionId: mod.positionId ?? undefined,
      });
    }
  }

  for (const [addr, pins] of addressPins) {
    const label = describeAddress(addr, modules).label;
    if (!addressInRange(ctrl, modules, addr)) {
      issues.push({ level: 'error', message: `${label} is outside the controller's range.` });
    }
    if (show.cueTimes[addr] === undefined) {
      issues.push({ level: 'warning', message: `${label} is wired but has no fire time.` });
    }
    if (pins.size > 1) {
      issues.push({
        level: 'info',
        message: `${label} is linked across ${pins.size} module cues and fires them together.`,
      });
    }
  }

  for (const m of modules) {
    if (!m.positionId) {
      issues.push({ level: 'warning', message: `${m.name} is not assigned to a position.` });
    }
  }

  for (const u of timing.unscheduled) {
    const where = u.tubeIndex !== null ? ` (tube ${u.tubeIndex + 1})` : '';
    issues.push({
      level: 'warning',
      message: `${u.name}${where} at ${posName(u.positionId)} isn't connected to a timed cue.`,
      positionId: u.positionId,
    });
  }

  const { audience } = show.siteMap;
  for (const p of show.positions) {
    const d = distToSegment(p.x, p.y, audience.x1, audience.y1, audience.x2, audience.y2);
    if (d < p.safetyRadiusFt) {
      issues.push({
        level: 'error',
        message: `${p.name} is ${d.toFixed(0)} ft from the audience line, inside its ${p.safetyRadiusFt} ft safety radius.`,
        positionId: p.id,
      });
    }
  }

  const order = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.level] - order[b.level]);
}
