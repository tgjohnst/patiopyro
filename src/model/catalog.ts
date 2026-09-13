import type { CAKE_CATEGORIES } from './constants';
import type { CatalogItem, Shell } from './schema';

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
};

export function shellUnitCost(s: Shell): number {
  return s.pricing.mode === 'unit' ? s.pricing.unitCost : s.pricing.caseCost / s.pricing.caseQty;
}

export function itemUnitCost(item: CatalogItem): number {
  return item.kind === 'shell' ? shellUnitCost(item) : item.unitCost;
}

export function tubeCount(rack: { rows: number; cols: number }) {
  return rack.rows * rack.cols;
}

export const KIND_LABEL: Record<CatalogItem['kind'], string> = {
  cake: 'Cake',
  shell: 'Shell',
  rack: 'Rack',
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
