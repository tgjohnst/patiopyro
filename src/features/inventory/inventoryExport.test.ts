import { describe, expect, it } from 'vitest';
import { createDemoShow } from '../../model/demo';
import { computeTotals } from '../../engine/totals';
import { inventoryCsv, inventorySheets } from './inventoryExport';

describe('inventory export', () => {
  const show = createDemoShow();
  const totals = computeTotals(show);
  const used = (id: string) => totals.inventory.find((u) => u.catalogId === id)?.used ?? 0;

  it('writes every inventory section with one row per item', () => {
    const sheets = inventorySheets(show, used);
    expect(sheets.map((s) => s.name)).toEqual([
      'Cakes', 'Sub cakes', 'Roman candles', 'Rockets', 'Shells', 'Racks', 'Assortments', 'Supplies', 'Fuse',
    ]);
    const cakes = sheets[0];
    expect(cakes.rows).toHaveLength(show.catalog.filter((c) => c.kind === 'cake').length);
    for (const s of sheets) for (const r of s.rows) expect(r).toHaveLength(s.head.length);
    const col = (name: string) => cakes.head.indexOf(name);
    const owl = cakes.rows.find((r) => r[0] === 'Night Owl')!;
    expect(owl[col('Tags')]).toBe('Big breaks');
    expect(owl[col('Effects')]).toBe('Crackle');
    expect(owl[col('Colors')]).toBe('Golden');
    expect(owl[col('Cost / shot')]).toBeCloseTo(1.8);
    expect(owl[col('Used')]).toBe(1);
    expect(sheets[1].rows.map((r) => r[1])).toEqual(['Ghost fans', 'Strobe crossfire', 'Golden willow']);
    expect(sheets[7].rows.find((r) => r[0] === 'Landscape stakes')).toEqual(['Landscape stakes', 8, 4, 4, 0.75, 6, 'Two per cake board corner', '']);
  });

  it('puts every section in one CSV, quoting where needed', () => {
    const csv = inventoryCsv(show, used);
    expect(csv.startsWith('Cakes\nName,Brand,Grade,')).toBe(true);
    expect(csv).toContain('\n\nSupplies\nName,Needed,Owned,To buy,');
    expect(csv).toContain('"Plywood board, 36"" × 12"""');
    expect(csv).toMatch(/^Night Owl,Demo Fireworks Co\.,1\.4G,500g,Big breaks,Crackle,Golden,25,30,/m);
  });
});
