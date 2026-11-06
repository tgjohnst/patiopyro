import type * as XLSXTypes from 'xlsx';
import { downloadBlob, safeFilename } from '../../lib/file';
import {
  PIECE_NOUNS,
  assortmentStats,
  cakeAssortment,
  costPerSecond,
  costPerShot,
  itemUnitCost,
  shellUnitCost,
  tubeCount,
  type TubeItem,
} from '../../model/catalog';
import type { CatalogItem, Show } from '../../model/schema';

type Cell = string | number;

export interface InventorySheet {
  name: string;
  head: string[];
  rows: Cell[][];
  /** Column indexes holding money. */
  money: number[];
}

const list = (xs: string[]) => xs.join(', ');
const orBlank = (n: number | null) => n ?? '';

function packCols(item: TubeItem): Cell[] {
  const n = PIECE_NOUNS[item.kind];
  return item.pricing.mode === 'case'
    ? [`By the ${n.pack}`, item.pricing.caseQty, item.pricing.caseCost, shellUnitCost(item)]
    : [`Per ${n.one}`, '', '', shellUnitCost(item)];
}

/** Every inventory section as a table: what the inventory export writes, one sheet each. */
export function inventorySheets(show: Show, used: (catalogId: string) => number): InventorySheet[] {
  const of = <K extends CatalogItem['kind']>(kind: K) =>
    show.catalog.filter((c): c is Extract<CatalogItem, { kind: K }> => c.kind === kind);
  const cakes = of('cake');
  const sheets: InventorySheet[] = [
    {
      name: 'Cakes',
      head: [
        'Name', 'Brand', 'Grade', 'Weight class', 'Tags', 'Effects', 'Colors', 'Shots', 'Duration (s)', 'Lead delay (s)',
        'Exit fuse', 'Compound', 'Assortment', 'Per assortment', 'Cost (each)', 'Cost / shot', 'Cost / sec',
        'Owned', 'Used', 'Effect notes', 'Notes', 'Link',
      ],
      money: [14, 15, 16],
      rows: cakes.map((c) => [
        c.name, c.brand, c.grade, c.weightClass ?? '', list(c.tags), list(c.effects), list(c.colors), c.shots, c.durationSec,
        c.leadDelaySec, c.hasExitFuse ? 'Yes' : 'No', c.subCakes.length ? `${c.subCakes.length} sub cakes` : '',
        cakeAssortment(c, show)?.name ?? '', cakeAssortment(c, show) ? c.assortmentQty : '', itemUnitCost(c, show),
        orBlank(costPerShot(c, show)), orBlank(costPerSecond(c, show)), c.qtyOwned, used(c.id), c.effectNotes,
        c.notes, c.url,
      ]),
    },
    {
      name: 'Sub cakes',
      head: ['Cake', 'Sub cake', 'Shots', 'Starts at (s)', 'Duration (s)', 'Tags', 'Effects', 'Colors', 'Effect notes'],
      money: [],
      rows: cakes.flatMap((c) =>
        c.subCakes.map((s) => [c.name, s.name, s.shots, s.offsetSec, s.durationSec, list(s.tags), list(s.effects), list(s.colors), s.effectNotes]),
      ),
    },
    {
      name: 'Roman candles',
      head: [
        'Name', 'Brand', 'Effect', 'Shots', 'Duration (s)', 'Lead delay (s)', 'Pricing', 'Per pack', 'Pack cost',
        'Per candle', 'Cost / shot', 'Cost / sec', 'Owned', 'Used', 'Notes', 'Link',
      ],
      money: [8, 9, 10, 11],
      rows: of('candle').map((c) => [
        c.name, c.brand, c.effect, c.shots, c.durationSec, c.leadDelaySec, ...packCols(c),
        orBlank(costPerShot(c)), orBlank(costPerSecond(c)), c.qtyOwned, used(c.id), c.notes, c.url,
      ]),
    },
    {
      name: 'Rockets',
      head: ['Name', 'Brand', 'Effect', 'Light to burst (s)', 'Burst (s)', 'Pricing', 'Per pack', 'Pack cost', 'Per rocket', 'Owned', 'Used', 'Notes', 'Link'],
      money: [7, 8],
      rows: of('rocket').map((r) => [
        r.name, r.brand, r.effect, r.leadDelaySec, r.burstDurationSec, ...packCols(r), r.qtyOwned, used(r.id), r.notes, r.url,
      ]),
    },
    {
      name: 'Shells',
      head: ['Name', 'Brand', 'Effect', 'Size (in)', 'Light to burst (s)', 'Burst (s)', 'Pricing', 'Per case', 'Case cost', 'Per shell', 'Owned', 'Used', 'Notes', 'Link'],
      money: [8, 9],
      rows: of('shell').map((s) => [
        s.name, s.brand, s.effect, s.sizeIn, s.leadDelaySec, s.burstDurationSec, ...packCols(s), s.qtyOwned, used(s.id), s.notes, s.url,
      ]),
    },
    {
      name: 'Racks',
      head: ['Name', 'Rows', 'Tubes per row', 'Tubes', 'Tube size (in)', 'Tube spacing (in)', 'Cost (each)', 'Owned', 'Used', 'Notes', 'Link'],
      money: [6],
      rows: of('rack').map((r) => [
        r.name, r.rows, r.cols, tubeCount(r), r.tubeSizeIn, r.tubeSpacingIn, r.unitCost, r.qtyOwned, used(r.id), r.notes, r.url,
      ]),
    },
    {
      name: 'Assortments',
      head: ['Name', 'Brand', 'Cost', 'Cakes', 'Shots', 'Duration (s)', 'Cost / shot', 'Cost / sec', 'Contents', 'Notes', 'Link'],
      money: [2, 6, 7],
      rows: show.assortments.map((a) => {
        const st = assortmentStats(a, show.catalog);
        return [
          a.name, a.brand, a.cost, st.pieces, st.shots, st.durationSec, orBlank(st.perShot), orBlank(st.perSec),
          st.cakes.map((c) => `${c.assortmentQty}× ${c.name}`).join(', '), a.notes, a.url,
        ];
      }),
    },
    {
      name: 'Supplies',
      head: ['Name', 'Needed', 'Owned', 'To buy', 'Cost (each)', 'Cost for show', 'Notes', 'Link'],
      money: [4, 5],
      rows: show.supplies.map((s) => [
        s.name, s.qtyNeeded, s.qtyOwned, Math.max(0, s.qtyNeeded - s.qtyOwned), s.unitCost, s.unitCost * s.qtyNeeded, s.notes, s.url,
      ]),
    },
    {
      name: 'Fuse',
      head: ['Name', 'Burn rate (s/ft)', 'Roll (ft)', 'Roll cost', 'Notes'],
      money: [3],
      rows: show.fuseTypes.map((f) => [f.name, f.burnRateSecPerFt, f.rollLengthFt, f.rollCost, f.notes]),
    },
  ];
  return sheets;
}

const MONEY = '"$"#,##0.00';

export async function exportInventoryXlsx(show: Show, used: (catalogId: string) => number) {
  // Loaded on demand: SheetJS is large and only needed for exports.
  const XLSX: typeof XLSXTypes = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const sheet of inventorySheets(show, used)) {
    const ws = XLSX.utils.aoa_to_sheet([sheet.head, ...sheet.rows]);
    ws['!cols'] = sheet.head.map((h, i) => ({
      wch: Math.min(48, Math.max(h.length, ...sheet.rows.map((r) => String(r[i] ?? '').length)) + 2),
    }));
    sheet.rows.forEach((row, r) =>
      sheet.money.forEach((c) => {
        const cell = ws[XLSX.utils.encode_cell({ r: r + 1, c })];
        if (cell && typeof row[c] === 'number') cell.z = MONEY;
      }),
    );
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  XLSX.writeFile(wb, safeFilename(`${show.meta.name} inventory`, 'xlsx'));
}

function csvCell(v: Cell) {
  const s = typeof v === 'number' ? String(Math.round(v * 100) / 100) : v;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** All sections in one CSV: each starts with its name and header row, with a blank line between. */
export function inventoryCsv(show: Show, used: (catalogId: string) => number): string {
  return inventorySheets(show, used)
    .map((s) => [[s.name], s.head, ...s.rows].map((r) => r.map(csvCell).join(',')).join('\n'))
    .join('\n\n');
}

export function exportInventoryCsv(show: Show, used: (catalogId: string) => number) {
  downloadBlob(safeFilename(`${show.meta.name} inventory`, 'csv'), new Blob([inventoryCsv(show, used)], { type: 'text/csv' }));
}
