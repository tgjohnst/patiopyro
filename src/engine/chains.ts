import { describeAddress, pinAddress } from '../model/addressing';
import { inKey, nodeKey, outKey, parseEndpoint } from '../model/endpoints';
import type { CatalogItem, FiringModule, PlacedItem, Position, Rack, Show } from '../model/schema';
import type { EffectTiming, TimingResult } from './timing';

export interface ChainStep {
  kind: 'fuse' | 'burn';
  from: string;
  to: string;
  fuseName?: string;
  fuseColor?: string;
  lengthIn?: number;
  /** Time fire reaches `to`, if scheduled. */
  arriveSec: number | null;
}

export interface Chain {
  igniterId: string;
  moduleName: string;
  pin: number;
  addressLabel: string;
  cueTime: number | null;
  steps: ChainStep[];
  effects: EffectTiming[];
}

export interface RackSheet {
  placed: PlacedItem;
  rack: Rack;
  tubes: { index: number; row: number; col: number; shellName: string | null; startSec: number | null }[];
  /** Tube-to-tube fuse runs inside the rack. */
  runs: { a: number; b: number; fuseName: string; lengthIn: number }[];
}

export interface PositionSheet {
  position: Position;
  modules: FiringModule[];
  items: { placed: PlacedItem; item: CatalogItem; label: string }[];
  chains: Chain[];
  racks: RackSheet[];
  /** Fuse runs not reachable from any igniter. */
  orphanSteps: ChainStep[];
}

export function placedLabel(p: PlacedItem, item: CatalogItem | undefined, index?: number) {
  const name = item?.name ?? 'Missing item';
  if (p.label) return `${name} “${p.label}”`;
  return index !== undefined ? `${name} #${index}` : name;
}

/** Human-readable name for each endpoint in a position, numbering duplicates. */
export function endpointNamer(show: Show, positionId: string) {
  const catalog = new Map(show.catalog.map((c) => [c.id, c]));
  const placed = show.placed.filter((p) => p.positionId === positionId);
  const dupCount = new Map<string, number>();
  placed.forEach((p) => dupCount.set(p.catalogId, (dupCount.get(p.catalogId) ?? 0) + 1));
  const seen = new Map<string, number>();
  const names = new Map<string, string>();
  for (const p of placed) {
    const n = (seen.get(p.catalogId) ?? 0) + 1;
    seen.set(p.catalogId, n);
    names.set(p.id, placedLabel(p, catalog.get(p.catalogId), (dupCount.get(p.catalogId) ?? 0) > 1 ? n : undefined));
  }
  const junctions = show.fuseNodes.filter((n) => n.positionId === positionId && n.kind === 'junction');

  return (key: string): string => {
    const e = parseEndpoint(key);
    if (!e) return key;
    switch (e.kind) {
      case 'node': {
        const node = show.fuseNodes.find((n) => n.id === e.nodeId);
        if (!node) return 'Missing node';
        if (node.kind === 'junction') return `Junction J${junctions.indexOf(node) + 1}`;
        const mod = show.firing.modules.find((m) => m.id === node.moduleId);
        return `${show.firing.controller.igniterKind === 'talon' ? 'Talon' : 'E-match'} on ${mod?.name ?? '?'} #${node.pin}`;
      }
      case 'in':
        return `${names.get(e.placedId) ?? '?'} lead fuse`;
      case 'out':
        return `${names.get(e.placedId) ?? '?'} exit fuse`;
      case 'tube': {
        const p = placed.find((x) => x.id === e.placedId);
        const rack = catalog.get(p?.catalogId ?? '') as Rack | undefined;
        const cols = rack?.kind === 'rack' ? rack.cols : 1;
        const rc = `R${Math.floor(e.index / cols) + 1}C${(e.index % cols) + 1}`;
        return `${names.get(e.placedId) ?? '?'} tube ${e.index + 1} (${rc})`;
      }
    }
  };
}

export function buildPositionSheets(show: Show, timing: TimingResult): PositionSheet[] {
  const catalog = new Map(show.catalog.map((c) => [c.id, c]));
  const fuse = new Map(show.fuseTypes.map((f) => [f.id, f]));
  const ctrl = show.firing.controller;

  return show.positions.map((position) => {
    const name = endpointNamer(show, position.id);
    const segs = show.fuseSegments.filter((s) => s.positionId === position.id);
    const usedSegs = new Set<string>();
    const arrive = (k: string) => timing.arrivals.get(k)?.t ?? null;

    const igniters = show.fuseNodes
      .filter((n) => n.positionId === position.id && n.kind === 'igniter')
      .map((n) => {
        if (n.kind !== 'igniter') throw new Error('unreachable');
        const mod = show.firing.modules.find((m) => m.id === n.moduleId);
        const addr = mod ? pinAddress(ctrl, mod, n.pin) : '';
        return { n, mod, addr, time: mod ? (show.cueTimes[addr] ?? null) : null };
      })
      .sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));

    const walk = (startKey: string): ChainStep[] => {
      const steps: ChainStep[] = [];
      const visited = new Set<string>([startKey]);
      const queue = [startKey];
      while (queue.length) {
        const key = queue.shift()!;
        const e = parseEndpoint(key);
        if (e?.kind === 'in') {
          const p = show.placed.find((x) => x.id === e.placedId);
          const item = catalog.get(p?.catalogId ?? '');
          const out = outKey(e.placedId);
          if (item?.kind === 'cake' && item.hasExitFuse && !visited.has(out)) {
            const hasOutSeg = segs.some((s) => s.from === out || s.to === out);
            if (hasOutSeg) {
              visited.add(out);
              queue.push(out);
              steps.push({ kind: 'burn', from: name(key), to: name(out), arriveSec: arrive(out) });
            }
          }
        }
        for (const s of segs) {
          if (usedSegs.has(s.id) || (s.from !== key && s.to !== key)) continue;
          usedSegs.add(s.id);
          const other = s.from === key ? s.to : s.from;
          const ft = fuse.get(s.fuseTypeId);
          steps.push({
            kind: 'fuse',
            from: name(key),
            to: name(other),
            fuseName: ft?.name ?? 'Unknown fuse',
            fuseColor: ft?.color,
            lengthIn: s.lengthIn,
            arriveSec: arrive(other),
          });
          if (!visited.has(other)) {
            visited.add(other);
            queue.push(other);
          }
        }
      }
      return steps;
    };

    const chains: Chain[] = igniters.map(({ n, mod, addr, time }) => ({
      igniterId: n.id,
      moduleName: mod?.name ?? '?',
      pin: n.pin,
      addressLabel: mod ? describeAddress(addr, show.firing.modules).label : '—',
      cueTime: time,
      steps: walk(nodeKey(n.id)),
      effects: timing.effects.filter((e) => e.igniterId === n.id && e.positionId === position.id),
    }));

    const orphanSteps: ChainStep[] = [];
    for (const s of segs) {
      if (usedSegs.has(s.id)) continue;
      orphanSteps.push(...walk(s.from));
    }

    const placed = show.placed.filter((p) => p.positionId === position.id);
    const items = placed.map((p) => ({ placed: p, item: catalog.get(p.catalogId)!, label: name(inKey(p.id)).replace(/ lead fuse$/, '') })).filter((x) => x.item);

    const racks: RackSheet[] = placed
      .filter((p) => catalog.get(p.catalogId)?.kind === 'rack')
      .map((p) => {
        const rack = catalog.get(p.catalogId) as Rack;
        const tubes = (p.tubes ?? []).map((shellId, index) => {
          const eff = timing.effects.find((e) => e.placedId === p.id && e.tubeIndex === index);
          return {
            index,
            row: Math.floor(index / rack.cols),
            col: index % rack.cols,
            shellName: shellId ? (catalog.get(shellId)?.name ?? '?') : null,
            startSec: eff?.startSec ?? null,
          };
        });
        const runs = segs.flatMap((s) => {
          const a = parseEndpoint(s.from);
          const b = parseEndpoint(s.to);
          if (a?.kind === 'tube' && b?.kind === 'tube' && a.placedId === p.id && b.placedId === p.id) {
            return [{ a: a.index, b: b.index, fuseName: fuse.get(s.fuseTypeId)?.name ?? '?', lengthIn: s.lengthIn }];
          }
          return [];
        });
        return { placed: p, rack, tubes, runs };
      });

    return {
      position,
      modules: show.firing.modules.filter((m) => m.positionId === position.id),
      items,
      chains,
      racks,
      orphanSteps,
    };
  });
}

