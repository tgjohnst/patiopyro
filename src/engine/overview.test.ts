import { describe, expect, it } from 'vitest';
import { itemShots, itemUnitCost } from '../model/catalog';
import { createDemoShow } from '../model/demo';
import { buildOverview, describeProduct, distanceToSegment, formatClock, formatShowDate, overviewBinSec, productLooks } from './overview';
import { computeTiming } from './timing';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('buildOverview', () => {
  const show = createDemoShow();
  const timing = computeTiming(show);
  const o = buildOverview(show, timing);
  const byId = new Map(show.catalog.map((c) => [c.id, c]));

  it('totals every timed effect', () => {
    expect(o.pieces).toBe(timing.effects.length);
    expect(o.shots).toBe(sum(timing.effects.map((e) => itemShots(byId.get(e.catalogId)!) ?? 0)));
    expect(o.cost).toBeCloseTo(sum(timing.effects.map((e) => itemUnitCost(byId.get(e.catalogId)!, show))), 6);
    expect(o.durationSec).toBe(timing.showEndSec);
    expect(o.products).toBe(new Set(timing.effects.map((e) => e.catalogId)).size);
  });

  it('splits shots and cost between scenes and the time outside them', () => {
    expect(o.scenes.map((s) => s.scene.name)).toEqual(['Opening', 'Build', 'Crescendo', 'Finale']);
    expect(sum(o.scenes.map((s) => s.shots)) + o.unscened.shots).toBe(o.shots);
    expect(sum(o.scenes.map((s) => s.cost)) + o.unscened.cost).toBeCloseTo(o.cost, 6);
    for (const s of o.scenes) {
      expect(s.products.map((p) => p.shots)).toEqual([...s.products.map((p) => p.shots)].sort((a, b) => b - a));
      for (const b of s.bins) expect(b.endSec > s.scene.startSec && b.startSec < s.scene.endSec).toBe(true);
    }
  });

  it('groups the lineup by kind and keeps every piece', () => {
    expect(o.lineup.map((g) => g.label)).toEqual(['Cakes', 'Roman candles', 'Rockets', 'Shells'].filter((l) => o.lineup.some((g) => g.label === l)));
    expect(sum(o.lineup.map((g) => g.pieces))).toBe(o.pieces);
    expect(sum(o.lineup.map((g) => g.shots))).toBe(o.shots);
    const night = o.lineup.flatMap((g) => g.rows).find((r) => r.item.name === 'Night Owl')!;
    expect(night.sceneIds.length).toBeGreaterThan(0);
  });

  it('finds the busiest bin and measures positions to the audience', () => {
    expect(o.peak!.shots).toBe(Math.max(...o.bins.map((b) => b.shots)));
    expect(o.positions.length).toBeGreaterThan(0);
    expect(o.nearestFt).toBe(Math.min(...o.positions.map((p) => p.audienceFt)));
    expect(sum(o.positions.map((p) => p.pieces))).toBe(o.pieces);
  });

  it('leaves out effects that have no fire time, and says how many', () => {
    const untimed = createDemoShow();
    untimed.cueTimes = {};
    const t = computeTiming(untimed);
    const u = buildOverview(untimed, t);
    expect(u.pieces).toBe(t.effects.length);
    expect(u.untimed).toBe(t.unscheduled.length);
  });

  it('works for a show with no scenes', () => {
    const plain = createDemoShow();
    plain.scenes = [];
    const p = buildOverview(plain, computeTiming(plain));
    expect(p.scenes).toEqual([]);
    expect(p.unscened).toEqual({ shots: 0, cost: 0 });
  });
});

describe('overview helpers', () => {
  it('keeps the graph to 60 bars or fewer', () => {
    expect(overviewBinSec(30)).toBe(1);
    expect(overviewBinSec(150)).toBe(5);
    expect(overviewBinSec(600)).toBe(10);
    expect(overviewBinSec(3600)).toBe(60);
  });

  it('measures distance to a line segment', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    expect(distanceToSegment({ x: 5, y: 4 }, a, b)).toBe(4);
    expect(distanceToSegment({ x: 13, y: 4 }, a, b)).toBe(5);
    expect(distanceToSegment({ x: 3, y: 4 }, a, a)).toBe(5);
  });

  it('formats clock times and dates', () => {
    expect(formatClock('21:15')).toBe('9:15 PM');
    expect(formatClock('21:15', 174)).toBe('9:18 PM');
    expect(formatClock('00:05')).toBe('12:05 AM');
    expect(formatClock('23:59', 120)).toBe('12:01 AM');
    expect(formatClock('')).toBeNull();
    expect(formatShowDate('2026-07-04')).toBe('Saturday, July 4, 2026');
    expect(formatShowDate('Fourth of July')).toBe('Fourth of July');
  });

  it('describes products and their looks', () => {
    const show = createDemoShow();
    const owl = show.catalog.find((c) => c.name === 'Night Owl')!;
    expect(describeProduct(owl)).toMatch(/^25-shot cake/);
    expect(productLooks(owl)).toEqual({ effects: ['Crackle'], colors: ['Golden'] });
  });
});

describe('chart colors', () => {
  it('colors each bar by the scene whose cues fire the most shots in it', () => {
    const show = createDemoShow();
    const o = buildOverview(show, computeTiming(show));
    expect(o.binSceneIds).toHaveLength(o.bins.length);
    const ids = new Set(o.scenes.map((s) => s.scene.id));
    o.bins.forEach((b, i) => {
      const id = o.binSceneIds[i];
      if (b.shots === 0) expect(id).toBeNull();
      else if (o.unscened.shots === 0) expect(ids.has(id!)).toBe(true);
    });
  });
});
