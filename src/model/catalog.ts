import type { CAKE_CATEGORIES } from './constants';
import type { Cake, CatalogItem, ShellPricing, SubCake } from './schema';

export type CakeCategory = (typeof CAKE_CATEGORIES)[number];

/** Label colors per cake category. Literal class names so Tailwind picks them up. */
export const CATEGORY_CLASS: Record<CakeCategory, string> = {
  'Big breaks': 'bg-red-500/20 text-red-300 ring-red-500/40',
  Small: 'bg-teal-500/20 text-teal-300 ring-teal-500/40',
  Medium: 'bg-cyan-500/20 text-cyan-300 ring-cyan-500/40',
  Long: 'bg-indigo-500/20 text-indigo-300 ring-indigo-500/40',
  Finale: 'bg-fuchsia-500/20 text-fuchsia-300 ring-fuchsia-500/40',
  Zipper: 'bg-yellow-500/20 text-yellow-300 ring-yellow-500/40',
  NOAB: 'bg-orange-500/20 text-orange-300 ring-orange-500/40',
  Fan: 'bg-lime-500/20 text-lime-300 ring-lime-500/40',
  Barrage: 'bg-rose-500/20 text-rose-300 ring-rose-500/40',
  Crackle: 'bg-amber-500/20 text-amber-200 ring-amber-500/40',
  Strobe: 'bg-slate-200/20 text-slate-100 ring-slate-300/40',
  Willow: 'bg-yellow-700/30 text-yellow-200 ring-yellow-700/50',
  Comets: 'bg-sky-500/20 text-sky-300 ring-sky-500/40',
  Mines: 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/40',
  Ghost: 'bg-violet-500/20 text-violet-200 ring-violet-400/40',
  Colors: 'bg-pink-500/20 text-pink-300 ring-pink-500/40',
  Transition: 'bg-purple-500/20 text-purple-300 ring-purple-500/40',
  Fast: 'bg-red-700/30 text-orange-200 ring-red-600/50',
  Golden: 'bg-amber-300/20 text-amber-100 ring-amber-300/50',
  Slow: 'bg-blue-900/40 text-blue-200 ring-blue-700/50',
};

/** Unit cost for items priced per piece or by the case/pack (shells, rockets, roman candles). */
export function shellUnitCost(s: { pricing: ShellPricing }): number {
  return s.pricing.mode === 'unit' ? s.pricing.unitCost : s.pricing.caseCost / s.pricing.caseQty;
}

export function itemUnitCost(item: CatalogItem): number {
  return 'pricing' in item ? shellUnitCost(item) : item.unitCost;
}

/** Items that go in rack tubes. Rockets and roman candles can also be placed on their own. */
export type TubeItem = Extract<CatalogItem, { kind: 'shell' | 'rocket' | 'candle' }>;
export const isTubeLoadable = (item: CatalogItem | undefined): item is TubeItem =>
  item?.kind === 'shell' || item?.kind === 'rocket' || item?.kind === 'candle';

/** Items placed on a position canvas with a lead fuse. */
export type FuseableItem = Extract<CatalogItem, { kind: 'cake' | 'rocket' | 'candle' }>;
export const isFuseable = (item: CatalogItem | undefined): item is FuseableItem =>
  item?.kind === 'cake' || item?.kind === 'rocket' || item?.kind === 'candle';

/** Seconds from first shot (or burst) to the end of the effect. */
export function effectDurationSec(item: TubeItem | FuseableItem): number {
  return item.kind === 'shell' || item.kind === 'rocket' ? item.burstDurationSec : item.durationSec;
}

/** Shots per unit: cakes and candles list them; a shell or rocket is one. Racks have none. */
export function itemShots(item: CatalogItem): number | null {
  switch (item.kind) {
    case 'cake':
    case 'candle':
      return item.shots;
    case 'shell':
    case 'rocket':
      return 1;
    case 'rack':
      return null;
  }
}

/** Cost per shot for cakes and roman candles; null when there is nothing to divide by. */
export function costPerShot(item: CatalogItem): number | null {
  if (item.kind !== 'cake' && item.kind !== 'candle') return null;
  return item.shots > 0 ? itemUnitCost(item) / item.shots : null;
}

/** Cost per second of effect for cakes and roman candles. */
export function costPerSecond(item: CatalogItem): number | null {
  if (item.kind !== 'cake' && item.kind !== 'candle') return null;
  return item.durationSec > 0 ? itemUnitCost(item) / item.durationSec : null;
}

export const PIECE_NOUNS: Record<TubeItem['kind'], { one: string; many: string; pack: string; defaultPack: number }> = {
  shell: { one: 'shell', many: 'Shells', pack: 'case', defaultPack: 24 },
  rocket: { one: 'rocket', many: 'Rockets', pack: 'pack', defaultPack: 12 },
  candle: { one: 'candle', many: 'Candles', pack: 'pack', defaultPack: 6 },
};

export const isCompound = (cake: Cake) => cake.subCakes.length > 0;

export const subCakeEndSec = (sub: SubCake) => sub.offsetSec + sub.durationSec;

/** Compound cakes take their shot count and duration from their sub cakes. */
export function normalizeCake(cake: Cake): Cake {
  if (!isCompound(cake)) return cake;
  return {
    ...cake,
    shots: cake.subCakes.reduce((n, s) => n + s.shots, 0),
    durationSec: Math.max(0, ...cake.subCakes.map(subCakeEndSec)),
  };
}

/** Lay sub cakes end to end, each starting when the previous one finishes. */
export function sequenceSubCakes(subs: SubCake[]): SubCake[] {
  let t = 0;
  return subs.map((s) => {
    const next = { ...s, offsetSec: t };
    t += s.durationSec;
    return next;
  });
}

export function tubeCount(rack: { rows: number; cols: number }) {
  return rack.rows * rack.cols;
}

export const KIND_LABEL: Record<CatalogItem['kind'], string> = {
  cake: 'Cake',
  shell: 'Shell',
  rocket: 'Rocket',
  candle: 'Roman candle',
  rack: 'Rack',
};

export const KIND_ICON: Record<CatalogItem['kind'], string> = {
  cake: '▦',
  shell: '●',
  rocket: '➶',
  candle: '┃',
  rack: '⋮⋮',
};

/** Tidy a user-entered link: trims it and assumes https:// when no scheme is given. */
export function normalizeUrl(input: string): string {
  const url = input.trim();
  if (!url) return '';
  return /^[a-z][a-z\d+.-]*:/i.test(url) ? url : `https://${url}`;
}

/** Only http(s) links are ever rendered as clickable. */
export function safeHref(url: string): string | null {
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}
