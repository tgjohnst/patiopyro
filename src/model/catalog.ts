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
