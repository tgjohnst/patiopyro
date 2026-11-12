import { itemShots, itemUnitCost, type CakeColor } from '../model/catalog';
import { CAKE_WEIGHT_CLASSES } from '../model/constants';
import type { CatalogItem, Position, Scene, Show } from '../model/schema';
import { buildCueList } from './cues';
import { binIntensity, type IntensityBin } from './intensity';
import { sceneAt } from './scenes';
import type { EffectTiming, TimingResult } from './timing';

/**
 * Everything the show overview prints, worked out from the show and its timing.
 * Only effects with a fire time count: untimed items aren't part of the show yet.
 */

type FireworkKind = Exclude<CatalogItem['kind'], 'rack'>;

const KIND_ORDER: FireworkKind[] = ['cake', 'candle', 'rocket', 'shell'];
export const KIND_PLURAL: Record<FireworkKind, string> = {
  cake: 'Cakes',
  candle: 'Roman candles',
  rocket: 'Rockets',
  shell: 'Shells',
};

/** Bin sizes the overview's graph picks from, smallest first. */
const BIN_STEPS = [1, 2, 5, 10, 15, 30, 60, 120];
/** The graph gets at most this many bars. */
const MAX_BARS = 60;
/** A scene card lists this many products, then "and N more". */
export const FEATURED_MAX = 4;

export interface ProductUse {
  item: CatalogItem;
  /** Pieces fired. */
  qty: number;
  shots: number;
  cost: number;
}

export interface OverviewScene {
  scene: Scene;
  shots: number;
  cost: number;
  /** Products fired in the scene, most shots first. */
  products: ProductUse[];
  positionIds: string[];
  /** The show's bins that fall in this scene. */
  bins: IntensityBin[];
}

export interface LineupRow extends ProductUse {
  /** Scenes the product fires in, in show order. */
  sceneIds: string[];
  unitCost: number;
}

export interface LineupGroup {
  kind: FireworkKind;
  label: string;
  rows: LineupRow[];
  pieces: number;
  shots: number;
  cost: number;
}

export interface PositionSummary {
  position: Position;
  /** Feet from the position to the nearest point of the audience line. */
  audienceFt: number;
  pieces: number;
  /** The biggest thing that fires here, e.g. "500g cake" or "3 in shells". */
  largest: string | null;
}

export interface ShowOverview {
  durationSec: number;
  shots: number;
  pieces: number;
  products: number;
  cues: number;
  cost: number;
  binSec: number;
  bins: IntensityBin[];
  /**
   * Per bin, the scene whose effects fire the most shots in it (null: none, or between scenes).
   * Effects belong to the scene their cue fires in, so a cake that burns past its scene's end
   * still counts for that scene.
   */
  binSceneIds: (string | null)[];
  /** Per bin, the scene that spends the most in it, like binSceneIds but by cost. */
  binCostSceneIds: (string | null)[];
  /** The busiest bin, or null for a show with no shots. */
  peak: IntensityBin | null;
  /** The bin with the most spent in it, or null for a show that costs nothing. */
  costPeak: IntensityBin | null;
  scenes: OverviewScene[];
  /** Shots and cost fired outside every scene, when the show has scenes. */
  unscened: { shots: number; cost: number };
  lineup: LineupGroup[];
  positions: PositionSummary[];
  /** Feet from the audience to the nearest position; null with no positions in use. */
  nearestFt: number | null;
  /** Items placed but not yet timed, left out of the overview. */
  untimed: number;
  /** The biggest cakes and shells in the show, as for a position. */
  largest: string | null;
  /** Any Pro-line cakes in the show. */
  proLine: boolean;
}

/** The smallest bin size that keeps the graph to MAX_BARS bars. */
export function overviewBinSec(durationSec: number): number {
  return BIN_STEPS.find((b) => durationSec / b <= MAX_BARS) ?? BIN_STEPS[BIN_STEPS.length - 1];
}

/** Distance from point p to the segment a–b. */
export function distanceToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** What a product is, in a few words: "25-shot cake · 500g", "Rocket", "3 in shell". */
export function describeProduct(item: CatalogItem): string {
  switch (item.kind) {
    case 'cake':
      return [
        item.subCakes.length ? `Compound cake, ${item.subCakes.length} sections` : `${item.shots}-shot cake`,
        item.weightClass,
        item.grade,
      ]
        .filter(Boolean)
        .join(' · ');
    case 'candle':
      return `${item.shots}-shot roman candle`;
    case 'rocket':
      return 'Rocket';
    case 'shell':
      return `${item.sizeIn} in shell`;
    case 'rack':
      return 'Rack';
  }
}

/** The effects and colors a product shows, for chips. Non-cakes have one free-text effect. */
export function productLooks(item: CatalogItem): { effects: string[]; colors: CakeColor[] } {
  if (item.kind === 'cake') {
    const subs = item.subCakes;
    const effects = new Set<string>([...item.effects, ...subs.flatMap((s) => s.effects)]);
    const colors = new Set<CakeColor>([...item.colors, ...subs.flatMap((s) => s.colors)]);
    return { effects: [...effects], colors: [...colors] };
  }
  if (item.kind === 'rack') return { effects: [], colors: [] };
  return { effects: item.effect.trim() ? [item.effect.trim()] : [], colors: [] };
}

function largestAt(items: CatalogItem[]): string | null {
  let cakeClass = -1;
  let shellIn = 0;
  for (const item of items) {
    if (item.kind === 'cake' && item.weightClass) cakeClass = Math.max(cakeClass, CAKE_WEIGHT_CLASSES.indexOf(item.weightClass));
    if (item.kind === 'shell') shellIn = Math.max(shellIn, item.sizeIn);
  }
  const parts = [cakeClass >= 0 && `${CAKE_WEIGHT_CLASSES[cakeClass]} cakes`, shellIn > 0 && `${shellIn} in shells`];
  return parts.filter(Boolean).join(', ') || null;
}

/** Products in a set of effects, most shots first, then most spent. */
function productUses(effects: EffectTiming[], byId: Map<string, CatalogItem>, show: Show): ProductUse[] {
  const uses = new Map<string, ProductUse>();
  for (const e of effects) {
    const item = byId.get(e.catalogId);
    if (!item) continue;
    const use = uses.get(item.id) ?? { item, qty: 0, shots: 0, cost: 0 };
    use.qty += 1;
    use.shots += itemShots(item) ?? 0;
    use.cost += itemUnitCost(item, show);
    uses.set(item.id, use);
  }
  return [...uses.values()].sort((a, b) => b.shots - a.shots || b.cost - a.cost || a.item.name.localeCompare(b.item.name));
}

export function buildOverview(show: Show, timing: TimingResult): ShowOverview {
  const byId = new Map(show.catalog.map((c) => [c.id, c]));
  const effects = timing.effects;
  const durationSec = timing.showEndSec;
  const binSec = overviewBinSec(durationSec);
  const bins = binIntensity(effects, show, binSec, durationSec);
  const all = productUses(effects, byId, show);
  const sum = (uses: ProductUse[], k: 'shots' | 'cost' | 'qty') => uses.reduce((n, u) => n + u[k], 0);

  const scenes = [...show.scenes].sort((a, b) => a.startSec - b.startSec);
  // An effect belongs to the scene its cue fires in, like the cue list and show plan.
  const sceneOf = (e: EffectTiming) => sceneAt(scenes, show.cueTimes[e.addressId] ?? null);
  const overviewScenes: OverviewScene[] = scenes.map((scene) => {
    const inScene = effects.filter((e) => sceneOf(e)?.id === scene.id);
    const products = productUses(inScene, byId, show);
    return {
      scene,
      shots: sum(products, 'shots'),
      cost: sum(products, 'cost'),
      products,
      positionIds: show.positions.filter((p) => inScene.some((e) => e.positionId === p.id)).map((p) => p.id),
      bins: bins.filter((b) => b.endSec > scene.startSec && b.startSec < scene.endSec),
    };
  });
  const sceneBins = overviewScenes.map((s) => ({
    id: s.scene.id,
    bins: binIntensity(effects.filter((e) => sceneOf(e)?.id === s.scene.id), show, binSec, durationSec),
  }));
  /** Per bin, the scene that fires the most of a metric in it; shots outside every scene win when they outnumber each scene's. */
  const dominantScenes = (k: 'shots' | 'cost') =>
    bins.map((bin, i) => {
      let best: { id: string; v: number } | null = null;
      for (const s of sceneBins) {
        const v = s.bins[i]?.[k] ?? 0;
        if (v > 0 && v > (best?.v ?? 0)) best = { id: s.id, v };
      }
      const outside = bin[k] - sceneBins.reduce((n, s) => n + (s.bins[i]?.[k] ?? 0), 0);
      return best && best.v >= outside ? best.id : null;
    });
  const binSceneIds = dominantScenes('shots');
  const binCostSceneIds = dominantScenes('cost');
  const outside = scenes.length ? productUses(effects.filter((e) => !sceneOf(e)), byId, show) : [];

  const lineup: LineupGroup[] = KIND_ORDER.map((kind) => {
    const rows: LineupRow[] = all
      .filter((u) => u.item.kind === kind)
      .map((u) => ({
        ...u,
        unitCost: itemUnitCost(u.item, show),
        sceneIds: overviewScenes.filter((s) => s.products.some((p) => p.item.id === u.item.id)).map((s) => s.scene.id),
      }))
      .sort((a, b) => a.item.name.localeCompare(b.item.name));
    return { kind, label: KIND_PLURAL[kind], rows, pieces: sum(rows, 'qty'), shots: sum(rows, 'shots'), cost: sum(rows, 'cost') };
  }).filter((g) => g.rows.length > 0);

  const { audience } = show.siteMap;
  const positions: PositionSummary[] = show.positions
    .map((position) => {
      const here = effects.filter((e) => e.positionId === position.id);
      return {
        position,
        audienceFt: distanceToSegment(position, { x: audience.x1, y: audience.y1 }, { x: audience.x2, y: audience.y2 }),
        pieces: here.length,
        largest: largestAt(here.map((e) => byId.get(e.catalogId)).filter((c): c is CatalogItem => !!c)),
      };
    })
    .filter((p) => p.pieces > 0);

  const peakBy = (k: 'shots' | 'cost') => bins.reduce<IntensityBin | null>((best, b) => (b[k] > (best?.[k] ?? 0) ? b : best), null);

  return {
    durationSec,
    shots: sum(all, 'shots'),
    pieces: sum(all, 'qty'),
    products: all.length,
    cues: buildCueList(show, timing).filter((c) => c.time !== null).length,
    cost: sum(all, 'cost'),
    binSec,
    bins,
    binSceneIds,
    binCostSceneIds,
    peak: peakBy('shots'),
    costPeak: peakBy('cost'),
    scenes: overviewScenes,
    unscened: { shots: sum(outside, 'shots'), cost: sum(outside, 'cost') },
    lineup,
    positions,
    nearestFt: positions.length ? Math.min(...positions.map((p) => p.audienceFt)) : null,
    untimed: timing.unscheduled.length,
    largest: largestAt(all.map((u) => u.item)),
    proLine: all.some((u) => u.item.kind === 'cake' && u.item.grade === '1.4G Pro-line'),
  };
}

/** "21:15" → "9:15 PM". Null when the text isn't an HH:MM time. */
export function formatClock(hhmm: string, plusSec = 0): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const total = (Number(m[1]) * 60 + Number(m[2]) + Math.round(plusSec / 60)) % (24 * 60);
  const h = Math.floor(total / 60);
  const min = total % 60;
  return `${h % 12 || 12}:${String(min).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "2026-07-04" → "Saturday, July 4, 2026". Other text is returned as typed. */
export function formatShowDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return date.trim();
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
