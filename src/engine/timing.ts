import { pinAddress } from '../model/addressing';
import { inKey, nodeKey, outKey, tubeKey } from '../model/endpoints';
import type { CatalogItem, FuseType, Show } from '../model/schema';

export interface Arrival {
  t: number;
  addressId: string;
  igniterId: string;
}

export interface EffectTiming {
  /** Endpoint key of the fuse point that lights this effect. */
  key: string;
  placedId: string;
  tubeIndex: number | null;
  catalogId: string;
  positionId: string;
  name: string;
  kind: 'cake' | 'shell';
  igniteSec: number;
  startSec: number;
  endSec: number;
  addressId: string;
  igniterId: string;
}

export interface UnscheduledEffect {
  key: string;
  placedId: string;
  tubeIndex: number | null;
  name: string;
  positionId: string;
}

export interface TimingResult {
  arrivals: Map<string, Arrival>;
  effects: EffectTiming[];
  unscheduled: UnscheduledEffect[];
  showEndSec: number;
}

export function segmentDelaySec(lengthIn: number, fuse: FuseType | undefined) {
  return (lengthIn / 12) * (fuse?.burnRateSecPerFt ?? 0);
}

interface Edge {
  to: string;
  w: number;
}

/**
 * Fire propagates along fuse in both directions from wherever it is lit, so the fuse graph is
 * undirected; the only directed edges are cake lead -> exit fuse. Each endpoint's ignition time
 * is its earliest arrival (Dijkstra from every scheduled igniter).
 */
export function computeTiming(show: Show): TimingResult {
  const fuseById = new Map(show.fuseTypes.map((f) => [f.id, f]));
  const defaultFuse = fuseById.get(show.settings.defaultFuseTypeId);
  const catalog = new Map(show.catalog.map((c) => [c.id, c]));
  const modules = new Map(show.firing.modules.map((m) => [m.id, m]));
  const ctrl = show.firing.controller;

  const adj = new Map<string, Edge[]>();
  const addEdge = (a: string, b: string, w: number) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push({ to: b, w });
  };

  for (const seg of show.fuseSegments) {
    const w = segmentDelaySec(seg.lengthIn, fuseById.get(seg.fuseTypeId) ?? defaultFuse);
    addEdge(seg.from, seg.to, w);
    addEdge(seg.to, seg.from, w);
  }
  for (const p of show.placed) {
    const item = catalog.get(p.catalogId);
    if (item?.kind === 'cake' && item.hasExitFuse) {
      addEdge(inKey(p.id), outKey(p.id), item.leadDelaySec + item.durationSec);
    }
  }

  const arrivals = new Map<string, Arrival>();
  const queue: { key: string; a: Arrival }[] = [];
  const push = (key: string, a: Arrival) => {
    const cur = arrivals.get(key);
    if (cur && cur.t <= a.t) return;
    arrivals.set(key, a);
    // Sorted insert; show graphs are small (hundreds of endpoints).
    let i = queue.length;
    while (i > 0 && queue[i - 1].a.t > a.t) i--;
    queue.splice(i, 0, { key, a });
  };

  for (const n of show.fuseNodes) {
    if (n.kind !== 'igniter') continue;
    const mod = modules.get(n.moduleId);
    if (!mod) continue;
    const addressId = pinAddress(ctrl, mod, n.pin);
    const t = show.cueTimes[addressId];
    if (t === undefined) continue;
    push(nodeKey(n.id), { t, addressId, igniterId: n.id });
  }

  while (queue.length) {
    const { key, a } = queue.shift()!;
    if (arrivals.get(key) !== a) continue;
    for (const e of adj.get(key) ?? []) {
      push(e.to, { ...a, t: a.t + e.w });
    }
  }

  const effects: EffectTiming[] = [];
  const unscheduled: UnscheduledEffect[] = [];
  const addEffect = (
    key: string,
    placedId: string,
    tubeIndex: number | null,
    item: CatalogItem,
    positionId: string,
  ) => {
    if (item.kind === 'rack') return;
    const a = arrivals.get(key);
    if (!a) {
      unscheduled.push({ key, placedId, tubeIndex, name: item.name, positionId });
      return;
    }
    const startSec = a.t + item.leadDelaySec;
    const dur = item.kind === 'cake' ? item.durationSec : item.burstDurationSec;
    effects.push({
      key,
      placedId,
      tubeIndex,
      catalogId: item.id,
      positionId,
      name: item.name,
      kind: item.kind,
      igniteSec: a.t,
      startSec,
      endSec: startSec + dur,
      addressId: a.addressId,
      igniterId: a.igniterId,
    });
  };

  for (const p of show.placed) {
    const item = catalog.get(p.catalogId);
    if (!item) continue;
    if (item.kind === 'cake') addEffect(inKey(p.id), p.id, null, item, p.positionId);
    if (item.kind === 'rack') {
      (p.tubes ?? []).forEach((shellId, i) => {
        const shell = shellId ? catalog.get(shellId) : undefined;
        if (shell) addEffect(tubeKey(p.id, i), p.id, i, shell, p.positionId);
      });
    }
  }

  effects.sort((a, b) => a.startSec - b.startSec);
  const showEndSec = effects.reduce((m, e) => Math.max(m, e.endSec), 0);
  return { arrivals, effects, unscheduled, showEndSec };
}
