import { costPerSecond, costPerShot, itemUnitCost } from '../model/catalog';
import type { CatalogItem, Show } from '../model/schema';
import type { Totals } from './totals';

export type CostCategory = 'Cakes' | 'Roman candles' | 'Rockets' | 'Shells' | 'Racks' | 'Fuse' | 'Igniters';

export interface CostLine {
  category: CostCategory;
  name: string;
  detail: string;
  qty: number;
  unit: string;
  unitCost: number;
  total: number;
  /** Cakes and roman candles only. */
  perShot: number | null;
  perSec: number | null;
}

export interface CostReport {
  lines: CostLine[];
  subtotals: { category: CostCategory; total: number }[];
  total: number;
  inventoryLines: CostLine[];
  inventoryValue: number;
}

const CATEGORY_ORDER: CostCategory[] = ['Cakes', 'Roman candles', 'Rockets', 'Shells', 'Racks', 'Fuse', 'Igniters'];

const ITEM_CATEGORY: Record<CatalogItem['kind'], CostCategory> = {
  cake: 'Cakes',
  candle: 'Roman candles',
  rocket: 'Rockets',
  shell: 'Shells',
  rack: 'Racks',
};

function itemDetail(item: CatalogItem): string {
  switch (item.kind) {
    case 'cake':
      return [
        item.brand,
        item.grade,
        `${item.shots} shots`,
        item.subCakes.length ? `compound: ${item.subCakes.map((s) => s.name).join(' + ')}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
    case 'candle':
      return [item.brand, `${item.shots} shots`, item.effect].filter(Boolean).join(' · ');
    case 'rocket':
      return [item.brand, item.effect].filter(Boolean).join(' · ');
    case 'shell':
      return [item.brand, `${item.sizeIn}"`, item.effect].filter(Boolean).join(' · ');
    case 'rack':
      return `${item.rows}×${item.cols} tubes`;
  }
}

export function computeCost(show: Show, totals: Totals): CostReport {
  const lines: CostLine[] = [];
  const catalog = new Map(show.catalog.map((c) => [c.id, c]));

  for (const use of totals.inventory) {
    const item = catalog.get(use.catalogId)!;
    if (use.used === 0) continue;
    if (item.kind === 'rack' && !show.settings.includeRacksInCost) continue;
    const unitCost = itemUnitCost(item);
    lines.push({
      category: ITEM_CATEGORY[item.kind],
      name: item.name,
      detail: itemDetail(item),
      qty: use.used,
      unit: 'ea',
      unitCost,
      total: unitCost * use.used,
      perShot: costPerShot(item),
      perSec: costPerSecond(item),
    });
  }

  for (const f of totals.fuse) {
    lines.push({
      category: 'Fuse',
      name: f.name,
      detail: `${(f.totalIn / 12).toFixed(1)} ft needed incl. allowance/waste (${f.segments} segments)`,
      qty: f.rolls,
      unit: `roll (${f.rollLengthFt} ft)`,
      unitCost: f.rollCost,
      total: f.rolls * f.rollCost,
      perShot: null,
      perSec: null,
    });
  }

  if (totals.igniters.total > 0) {
    lines.push({
      category: 'Igniters',
      name: totals.igniters.kind === 'talon' ? 'Talon / clip igniters' : 'E-matches',
      detail: `${totals.igniters.count} used + ${totals.igniters.spares} spare`,
      qty: totals.igniters.total,
      unit: 'ea',
      unitCost: show.settings.igniterUnitCost,
      total: totals.igniters.total * show.settings.igniterUnitCost,
      perShot: null,
      perSec: null,
    });
  }

  lines.sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
      a.name.localeCompare(b.name),
  );

  const subtotals = CATEGORY_ORDER.map((category) => ({
    category,
    total: lines.filter((l) => l.category === category).reduce((s, l) => s + l.total, 0),
  })).filter((s) => s.total > 0);

  const inventoryLines: CostLine[] = show.catalog.map((item) => {
    const unitCost = itemUnitCost(item);
    return {
      category: ITEM_CATEGORY[item.kind],
      name: item.name,
      detail: '',
      qty: item.qtyOwned,
      unit: 'ea',
      unitCost,
      total: unitCost * item.qtyOwned,
      perShot: costPerShot(item),
      perSec: costPerSecond(item),
    };
  });

  return {
    lines,
    subtotals,
    total: lines.reduce((s, l) => s + l.total, 0),
    inventoryLines,
    inventoryValue: inventoryLines.reduce((s, l) => s + l.total, 0),
  };
}
