import { itemShots, itemUnitCost, type PricingContext } from '../model/catalog';
import type { CatalogItem } from '../model/schema';
import type { EffectTiming } from './timing';

export interface IntensityBin {
  startSec: number;
  endSec: number;
  shots: number;
  cost: number;
}

/** A stretch of time an effect spends some of its shots and cost over. */
interface Span {
  startSec: number;
  endSec: number;
  shots: number;
  cost: number;
}

/** Where an effect's shots and cost land in time: compound cakes per section, anything else evenly. */
function spans(e: EffectTiming, item: CatalogItem | undefined, ctx: PricingContext): Span[] {
  if (!item) return [];
  const shots = itemShots(item) ?? 0;
  const cost = itemUnitCost(item, ctx);
  if (item.kind === 'cake' && item.subCakes.length > 0 && e.sections.length === item.subCakes.length) {
    const subShots = item.subCakes.reduce((n, s) => n + s.shots, 0);
    if (subShots > 0) {
      return e.sections.map((sec, i) => ({
        startSec: sec.startSec,
        endSec: sec.endSec,
        shots: item.subCakes[i].shots,
        cost: (cost * item.subCakes[i].shots) / subShots,
      }));
    }
  }
  return [{ startSec: e.startSec, endSec: e.endSec, shots, cost }];
}

/**
 * Shots and firework cost per time bin across the show. Each effect's shots and cost
 * are spread evenly over the time it is firing (per section for compound cakes), so a
 * 60 s cake contributes to every bin it spans. Instant effects land in the bin they start in.
 */
export function binIntensity(
  effects: EffectTiming[],
  ctx: PricingContext,
  binSec: number,
  durationSec: number,
): IntensityBin[] {
  const size = Math.max(0.1, binSec);
  const lastEnd = effects.reduce((m, e) => Math.max(m, e.endSec), durationSec);
  const count = Math.max(1, Math.ceil(lastEnd / size));
  const bins: IntensityBin[] = Array.from({ length: count }, (_, i) => ({
    startSec: i * size,
    endSec: (i + 1) * size,
    shots: 0,
    cost: 0,
  }));
  const byId = new Map(ctx.catalog.map((c) => [c.id, c]));
  const binAt = (t: number) => Math.min(count - 1, Math.max(0, Math.floor(t / size)));

  for (const e of effects) {
    for (const s of spans(e, byId.get(e.catalogId), ctx)) {
      const len = s.endSec - s.startSec;
      if (len <= 0) {
        const b = bins[binAt(s.startSec)];
        b.shots += s.shots;
        b.cost += s.cost;
        continue;
      }
      for (let i = binAt(s.startSec); i <= binAt(s.endSec); i++) {
        const overlap = Math.min(s.endSec, bins[i].endSec) - Math.max(s.startSec, bins[i].startSec);
        if (overlap <= 0) continue;
        bins[i].shots += (s.shots * overlap) / len;
        bins[i].cost += (s.cost * overlap) / len;
      }
    }
  }
  return bins;
}
