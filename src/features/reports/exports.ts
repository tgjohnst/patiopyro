import type * as XLSXTypes from 'xlsx';
import { buildCueList } from '../../engine/cues';
import { downloadBlob, safeFilename } from '../../lib/file';
import { formatTime } from '../../lib/format';
import { itemUnitCost } from '../../model/catalog';
import type { Show } from '../../model/schema';
import type { Derived } from '../../store/showStore';

const MONEY = '"$"#,##0.00';

function moneyCols(XLSX: typeof XLSXTypes, ws: XLSXTypes.WorkSheet, cols: number[], fromRow: number) {
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  for (let r = fromRow; r <= range.e.r; r++) {
    for (const c of cols) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === 'number') cell.z = MONEY;
    }
  }
}

export function costRows(show: Show, d: Derived) {
  const rows: (string | number)[][] = [['Category', 'Item', 'Detail', 'Qty', 'Unit', 'Unit cost', 'Total']];
  for (const l of d.cost.lines) rows.push([l.category, l.name, l.detail, l.qty, l.unit, l.unitCost, l.total]);
  rows.push([]);
  for (const s of d.cost.subtotals) rows.push(['Subtotal', s.category, '', '', '', '', s.total]);
  rows.push(['TOTAL', show.meta.name, '', '', '', '', d.cost.total]);
  return rows;
}

export async function exportCostXlsx(show: Show, d: Derived) {
  // Loaded on demand: SheetJS is large and only needed for this export.
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const header = [
    [`${show.meta.name}: show cost`],
    [[show.meta.date, show.meta.location].filter(Boolean).join(' · ')],
    [],
  ];
  const cost = XLSX.utils.aoa_to_sheet([...header, ...costRows(show, d)]);
  cost['!cols'] = [{ wch: 12 }, { wch: 32 }, { wch: 48 }, { wch: 8 }, { wch: 16 }, { wch: 12 }, { wch: 12 }];
  moneyCols(XLSX, cost, [5, 6], header.length + 1);
  XLSX.utils.book_append_sheet(wb, cost, 'Show cost');

  const invRows: (string | number)[][] = [['Kind', 'Name', 'Owned', 'Used', 'Remaining', 'Unit cost', 'Value owned', 'Value used', 'Link']];
  for (const item of show.catalog) {
    const use = d.totals.inventory.find((u) => u.catalogId === item.id)?.used ?? 0;
    const unit = itemUnitCost(item);
    invRows.push([item.kind, item.name, item.qtyOwned, use, item.qtyOwned - use, unit, unit * item.qtyOwned, unit * use, item.url]);
  }
  invRows.push([], ['TOTAL', '', '', '', '', '', d.cost.inventoryValue, '']);
  const inv = XLSX.utils.aoa_to_sheet(invRows);
  inv['!cols'] = [{ wch: 8 }, { wch: 32 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 40 }];
  moneyCols(XLSX, inv, [5, 6, 7], 1);
  XLSX.utils.book_append_sheet(wb, inv, 'Inventory');

  const fuseRows: (string | number)[][] = [
    ['Fuse type', 'Runs', 'Drawn (ft)', 'Needed incl. allowance/waste (ft)', 'Roll (ft)', 'Rolls', 'Roll cost', 'Cost'],
  ];
  for (const f of d.totals.fuse) {
    fuseRows.push([f.name, f.segments, +(f.rawIn / 12).toFixed(2), +(f.totalIn / 12).toFixed(2), f.rollLengthFt, f.rolls, f.rollCost, f.rolls * f.rollCost]);
  }
  const ig = d.totals.igniters;
  fuseRows.push([], [ig.kind === 'talon' ? 'Talon igniters' : 'E-matches', ig.count, `+${ig.spares} spare`, `= ${ig.total}`, '', '', show.settings.igniterUnitCost, ig.total * show.settings.igniterUnitCost]);
  const fuse = XLSX.utils.aoa_to_sheet(fuseRows);
  fuse['!cols'] = [{ wch: 24 }, { wch: 8 }, { wch: 12 }, { wch: 30 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 12 }];
  moneyCols(XLSX, fuse, [6, 7], 1);
  XLSX.utils.book_append_sheet(wb, fuse, 'Fuse & igniters');

  const cueRows: (string | number)[][] = [['Time', 'Seconds', 'Cue', 'Module cues', 'Positions', 'Fires', 'Note']];
  for (const c of buildCueList(show, d.timing)) {
    cueRows.push([
      c.time === null ? '—' : formatTime(c.time),
      c.time ?? '',
      c.label,
      c.pins.map((p) => `${p.moduleName} #${p.pin}`).join(', '),
      c.positionIds.map((id) => show.positions.find((p) => p.id === id)?.name).join(', '),
      c.effects.map((e) => e.name + (e.tubeIndex !== null ? ` #${e.tubeIndex + 1}` : '')).join(', '),
      c.note,
    ]);
  }
  const cues = XLSX.utils.aoa_to_sheet(cueRows);
  cues['!cols'] = [{ wch: 8 }, { wch: 8 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 60 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, cues, 'Cues');

  XLSX.writeFile(wb, safeFilename(`${show.meta.name} cost`, 'xlsx'));
}

function csvCell(v: string | number | undefined) {
  const s = v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCostCsv(show: Show, d: Derived) {
  const csv = costRows(show, d)
    .map((r) => r.map((v) => csvCell(typeof v === 'number' ? Math.round(v * 100) / 100 : v)).join(','))
    .join('\n');
  downloadBlob(safeFilename(`${show.meta.name} cost`, 'csv'), new Blob([csv], { type: 'text/csv' }));
}
