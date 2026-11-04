import { pinAddress, describeAddress } from '../model/addressing';
import { isFuseable } from '../model/catalog';
import { IGNITER_LEAD_COLOR, igniterLeadIds, igniterLeadName, parseEndpoint } from '../model/endpoints';
import type { Board, CatalogItem, PlacedItem, Show } from '../model/schema';
import { endpointNamer } from './chains';
import type { TimingResult } from './timing';

/** Boards are drawn to scale on the position canvas. */
export const BOARD_PX_PER_IN = 15;

/** Rack tube pitch on the canvas (px), shared with the rack node. */
export const CANVAS_TUBE_PX = 26;

export const boardSizePx = (b: Pick<Board, 'widthIn' | 'depthIn'>) => ({
  w: b.widthIn * BOARD_PX_PER_IN,
  h: b.depthIn * BOARD_PX_PER_IN,
});

/**
 * Approximate on-canvas size of a placed item's node (px). The canvas measures real sizes;
 * this is for printing and for hit tests before a node has been measured.
 */
export function placedSizePx(item: CatalogItem | undefined): { w: number; h: number } {
  if (item?.kind === 'rack') {
    return { w: Math.max(140, item.cols * CANVAS_TUBE_PX + 26), h: item.rows * CANVAS_TUBE_PX + 60 };
  }
  const subs = item?.kind === 'cake' ? item.subCakes.length : 0;
  return { w: 192, h: 76 + (subs ? 6 + subs * 13 : 0) };
}

const IGNITER = { w: 104, h: 36 };
const JUNCTION = { w: 20, h: 34 };

/** The board whose area contains a point at this position, if any (topmost first). */
export function boardAt(boards: Board[], positionId: string, x: number, y: number): Board | undefined {
  return boards
    .filter((b) => b.positionId === positionId)
    .reverse()
    .find((b) => {
      const { w, h } = boardSizePx(b);
      return x >= b.x && x <= b.x + w && y >= b.y && y <= b.y + h;
    });
}

export interface LayoutBoard {
  id: string;
  name: string;
  widthIn: number;
  depthIn: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Labels of the items on the board. */
  items: string[];
}

export interface LayoutBox {
  id: string;
  kind: 'item' | 'rack' | 'igniter' | 'junction';
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  /** Second line: what it is, or the cue it fires on. */
  detail: string;
  rack?: { rows: number; cols: number; loaded: boolean[] };
}

export interface LayoutLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  fuseName: string;
  /** An igniter's lead (no fuse) rather than a fuse run. */
  igniter: boolean;
}

export interface PositionLayout {
  boards: LayoutBoard[];
  boxes: LayoutBox[];
  lines: LayoutLine[];
  /** Bounding box of everything, in canvas px. Null when the position is empty. */
  bounds: { x: number; y: number; w: number; h: number } | null;
}

function tubeCenter(p: PlacedItem, cols: number, index: number) {
  return {
    x: p.x + 13 + (index % cols) * CANVAS_TUBE_PX + CANVAS_TUBE_PX / 2,
    y: p.y + 34 + Math.floor(index / cols) * CANVAS_TUBE_PX + CANVAS_TUBE_PX / 2,
  };
}

/** Top-down drawing of a position as laid out on its canvas: boards, items, igniters and fuse. */
export function positionLayout(show: Show, positionId: string, timing: TimingResult): PositionLayout {
  const catalog = new Map(show.catalog.map((c) => [c.id, c]));
  const fuse = new Map(show.fuseTypes.map((f) => [f.id, f]));
  const name = endpointNamer(show, positionId);
  const placed = show.placed.filter((p) => p.positionId === positionId);
  const label = (p: PlacedItem) => name(`in:${p.id}`).replace(/ lead fuse$/, '');

  const boards: LayoutBoard[] = show.boards
    .filter((b) => b.positionId === positionId)
    .map((b) => ({
      id: b.id,
      name: b.name,
      widthIn: b.widthIn,
      depthIn: b.depthIn,
      x: b.x,
      y: b.y,
      ...boardSizePx(b),
      items: placed.filter((p) => p.boardId === b.id).map(label),
    }));

  const boxes: LayoutBox[] = [];
  const anchors = new Map<string, { x: number; y: number }>();
  for (const p of placed) {
    const item = catalog.get(p.catalogId);
    const { w, h } = placedSizePx(item);
    if (item?.kind === 'rack') {
      const tubes = p.tubes ?? [];
      boxes.push({
        id: p.id,
        kind: 'rack',
        x: p.x,
        y: p.y,
        w,
        h,
        label: label(p),
        detail: `${tubes.filter(Boolean).length}/${tubes.length} loaded`,
        rack: { rows: item.rows, cols: item.cols, loaded: tubes.map(Boolean) },
      });
      tubes.forEach((_, i) => anchors.set(`t:${p.id}:${i}`, tubeCenter(p, item.cols, i)));
    } else if (isFuseable(item)) {
      const t = timing.effects.find((e) => e.placedId === p.id && e.tubeIndex === null);
      const kind = item.kind === 'cake' ? `${item.shots} shots` : item.kind === 'candle' ? 'Roman candle' : 'Rocket';
      boxes.push({
        id: p.id,
        kind: 'item',
        x: p.x,
        y: p.y,
        w,
        h,
        label: label(p),
        detail: t ? `${kind} · ${describeAddress(t.addressId, show.firing.modules).label}` : kind,
      });
      anchors.set(`in:${p.id}`, { x: p.x, y: p.y + h / 2 });
      anchors.set(`out:${p.id}`, { x: p.x + w, y: p.y + h / 2 });
    }
  }

  for (const n of show.fuseNodes) {
    if (n.positionId !== positionId) continue;
    if (n.kind === 'igniter') {
      const mod = show.firing.modules.find((m) => m.id === n.moduleId);
      const addr = mod ? pinAddress(show.firing.controller, mod, n.pin) : null;
      boxes.push({
        id: n.id,
        kind: 'igniter',
        x: n.x,
        y: n.y,
        ...IGNITER,
        label: mod ? `${mod.name} #${n.pin}` : 'Missing module',
        detail: addr ? describeAddress(addr, show.firing.modules).label : '',
      });
      anchors.set(`n:${n.id}`, { x: n.x + IGNITER.w / 2, y: n.y + IGNITER.h });
    } else {
      boxes.push({ id: n.id, kind: 'junction', x: n.x, y: n.y, ...JUNCTION, label: name(`n:${n.id}`).replace('Junction ', ''), detail: '' });
      anchors.set(`n:${n.id}`, { x: n.x + 10, y: n.y + 10 });
    }
  }

  const lines: LayoutLine[] = [];
  const leads = igniterLeadIds(show);
  for (const s of show.fuseSegments) {
    if (s.positionId !== positionId) continue;
    const a = anchors.get(s.from);
    const b = anchors.get(s.to);
    if (!a || !b || !parseEndpoint(s.from) || !parseEndpoint(s.to)) continue;
    const ft = fuse.get(s.fuseTypeId);
    const lead = leads.has(s.id);
    lines.push({
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      color: lead ? IGNITER_LEAD_COLOR : (ft?.color ?? '#64748b'),
      fuseName: lead ? igniterLeadName(show.firing.controller.igniterKind) : (ft?.name ?? 'Fuse'),
      igniter: lead,
    });
  }

  const rects = [...boards, ...boxes];
  const bounds = rects.length
    ? (() => {
        const x = Math.min(...rects.map((r) => r.x));
        const y = Math.min(...rects.map((r) => r.y));
        return {
          x,
          y,
          w: Math.max(...rects.map((r) => r.x + r.w)) - x,
          h: Math.max(...rects.map((r) => r.y + r.h)) - y,
        };
      })()
    : null;

  return { boards, boxes, lines, bounds };
}
