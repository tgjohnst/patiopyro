import type { CatalogItem, Shell } from './schema';

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
