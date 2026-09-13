import { controllerCapacity, pinAddress } from '../model/addressing';
import type { CatalogItem, Show } from '../model/schema';

export interface FuseTotal {
  fuseTypeId: string;
  name: string;
  color: string;
  segments: number;
  /** Sum of drawn segment lengths. */
  rawIn: number;
  /** Including per-connection allowance and waste. */
  totalIn: number;
  rolls: number;
  rollLengthFt: number;
  rollCost: number;
}

export interface InventoryUse {
  catalogId: string;
  name: string;
  kind: CatalogItem['kind'];
  used: number;
  owned: number;
}

export interface ModuleUse {
  moduleId: string;
  name: string;
  used: number;
  cueCount: number;
  positionId: string | null;
}

export interface Totals {
  fuse: FuseTotal[];
  igniters: { kind: 'ematch' | 'talon'; count: number; spares: number; total: number };
  cues: { used: string[]; capacity: number };
  modules: ModuleUse[];
  inventory: InventoryUse[];
}

export function computeTotals(show: Show): Totals {
  const { settings } = show;
  const ctrl = show.firing.controller;

  const byType = new Map<string, FuseTotal>();
  for (const seg of show.fuseSegments) {
    const ft =
      show.fuseTypes.find((f) => f.id === seg.fuseTypeId) ??
      show.fuseTypes.find((f) => f.id === settings.defaultFuseTypeId);
    if (!ft) continue;
    let t = byType.get(ft.id);
    if (!t) {
      t = {
        fuseTypeId: ft.id,
        name: ft.name,
        color: ft.color,
        segments: 0,
        rawIn: 0,
        totalIn: 0,
        rolls: 0,
        rollLengthFt: ft.rollLengthFt,
        rollCost: ft.rollCost,
      };
      byType.set(ft.id, t);
    }
    t.segments += 1;
    t.rawIn += seg.lengthIn;
  }
  const fuse = [...byType.values()].map((t) => {
    const totalIn =
      (t.rawIn + t.segments * settings.connectionAllowanceIn) * (1 + settings.fuseWastePct / 100);
    return { ...t, totalIn, rolls: Math.ceil(totalIn / 12 / t.rollLengthFt - 1e-9) };
  });

  const igniterNodes = show.fuseNodes.filter((n) => n.kind === 'igniter');
  const count = igniterNodes.length;
  const spares = Math.ceil((count * settings.igniterSparePct) / 100);

  const used = new Set<string>();
  const pinsByModule = new Map<string, Set<number>>();
  for (const n of igniterNodes) {
    const mod = show.firing.modules.find((m) => m.id === n.moduleId);
    if (!mod) continue;
    used.add(pinAddress(ctrl, mod, n.pin));
    if (!pinsByModule.has(mod.id)) pinsByModule.set(mod.id, new Set());
    pinsByModule.get(mod.id)!.add(n.pin);
  }

  const modules = show.firing.modules.map((m) => ({
    moduleId: m.id,
    name: m.name,
    used: pinsByModule.get(m.id)?.size ?? 0,
    cueCount: m.cueCount,
    positionId: m.positionId,
  }));

  const usedCounts = new Map<string, number>();
  const bump = (id: string) => usedCounts.set(id, (usedCounts.get(id) ?? 0) + 1);
  for (const p of show.placed) {
    bump(p.catalogId);
    p.tubes?.forEach((s) => s && bump(s));
  }
  const inventory = show.catalog.map((c) => ({
    catalogId: c.id,
    name: c.name,
    kind: c.kind,
    used: usedCounts.get(c.id) ?? 0,
    owned: c.qtyOwned,
  }));

  return {
    fuse,
    igniters: { kind: ctrl.igniterKind, count, spares, total: count + spares },
    cues: { used: [...used], capacity: controllerCapacity(ctrl, show.firing.modules) },
    modules,
    inventory,
  };
}
