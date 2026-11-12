import { describe, expect, it } from 'vitest';
import { itemShots, itemUnitCost } from '../model/catalog';
import { createDemoShow } from '../model/demo';
import { binIntensity } from './intensity';
import { computeTiming, type EffectTiming } from './timing';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('binIntensity', () => {
  const show = createDemoShow();
  const timing = computeTiming(show);

  it('keeps every shot and dollar of the show, whatever the bin size', () => {
    const shots = sum(timing.effects.map((e) => itemShots(show.catalog.find((c) => c.id === e.catalogId)!) ?? 0));
    const cost = sum(timing.effects.map((e) => itemUnitCost(show.catalog.find((c) => c.id === e.catalogId)!, show)));
    for (const binSec of [1, 2.5, 5, 30]) {
      const bins = binIntensity(timing.effects, show, binSec, timing.showEndSec);
      expect(sum(bins.map((b) => b.shots))).toBeCloseTo(shots, 6);
      expect(sum(bins.map((b) => b.cost))).toBeCloseTo(cost, 6);
      expect(bins[0].startSec).toBe(0);
      expect(bins.at(-1)!.endSec).toBeGreaterThanOrEqual(timing.showEndSec);
    }
  });

  it('spreads a cake evenly across the bins it fires in', () => {
    const cake = show.catalog.find((c) => c.kind === 'cake' && c.subCakes.length === 0 && c.durationSec > 0)!;
    if (cake.kind !== 'cake') throw new Error('expected a cake');
    const effect = {
      ...timing.effects[0],
      catalogId: cake.id,
      sections: [],
      startSec: 10,
      endSec: 10 + cake.durationSec,
    } satisfies EffectTiming;
    const bins = binIntensity([effect], show, cake.durationSec / 2, 10 + cake.durationSec * 2);
    const firing = bins.filter((b) => b.shots > 0);
    expect(sum(firing.map((b) => b.shots))).toBeCloseTo(cake.shots, 6);
    // Density is constant: shots per second match in every fully covered bin.
    const full = bins.filter((b) => b.startSec >= 10 && b.endSec <= 10 + cake.durationSec);
    for (const b of full) expect(b.shots / (b.endSec - b.startSec)).toBeCloseTo(cake.shots / cake.durationSec, 6);
  });

  it('puts compound cake shots in the sections that fire them', () => {
    const effect = timing.effects.find((e) => e.sections.length > 1)!;
    const cake = show.catalog.find((c) => c.id === effect.catalogId)!;
    if (cake.kind !== 'cake') throw new Error('expected a cake');
    const bins = binIntensity([effect], show, 0.5, timing.showEndSec);
    effect.sections.forEach((sec, i) => {
      const inSection = bins.filter((b) => b.startSec >= sec.startSec - 1e-9 && b.endSec <= sec.endSec + 1e-9);
      const covered = sum(inSection.map((b) => b.endSec - b.startSec));
      const secLen = sec.endSec - sec.startSec;
      if (secLen > 0 && covered > 0) {
        expect(sum(inSection.map((b) => b.shots)) / covered).toBeCloseTo(cake.subCakes[i].shots / secLen, 6);
      }
    });
  });

  it('lands instant effects in the bin they start in', () => {
    const effect = { ...timing.effects[0], startSec: 7, endSec: 7, sections: [] };
    const bins = binIntensity([effect], show, 5, 20);
    expect(bins[1].shots).toBeGreaterThan(0);
    expect(bins[0].shots + bins[2].shots).toBe(0);
  });
});
