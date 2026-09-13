import { describe, expect, it } from 'vitest';
import { channelAddressId, cueDistrict, flatAddressId, moduleAddressId, pinAddress } from '../model/addressing';
import {
  costPerSecond,
  costPerShot,
  normalizeCake,
  normalizeUrl,
  safeHref,
  sequenceSubCakes,
  shellUnitCost,
} from '../model/catalog';
import { DEFAULT_WORKSHEET_SUPPLIES } from '../model/constants';
import { createEmptyShow } from '../model/defaults';
import { createDemoShow } from '../model/demo';
import { inKey, nodeKey, outKey, tubeKey } from '../model/endpoints';
import { controllerFromPreset, presetById } from '../model/presets';
import type { Cake, Candle, FiringModule, Rack, Rocket, Shell, Show, SubCake } from '../model/schema';
import { parseShow } from '../model/schema';
import { buildPositionSheets } from './chains';
import { computeCost } from './cost';
import { buildCueList } from './cues';
import { computeTiming } from './timing';
import { computeTotals } from './totals';
import { validateShow } from './validation';

const GREEN = 'fuse-green-visco'; // 30 s/ft
const QUICK = 'fuse-quickmatch';

function cake(id: string, overrides: Partial<Cake> = {}): Cake {
  return {
    id,
    kind: 'cake',
    name: id,
    qtyOwned: 5,
    notes: '',
    url: '',
    brand: 'Acme',
    shots: 25,
    durationSec: 20,
    effectNotes: '',
    grade: '1.4G',
    unitCost: 40,
    leadDelaySec: 3,
    hasExitFuse: true,
    weightClass: null,
    categories: [],
    subCakes: [],
    ...overrides,
  };
}

function rocket(id: string, overrides: Partial<Rocket> = {}): Rocket {
  return {
    id,
    kind: 'rocket',
    name: id,
    qtyOwned: 12,
    notes: '',
    url: '',
    brand: '',
    effect: 'Whistle',
    leadDelaySec: 3,
    burstDurationSec: 2,
    pricing: { mode: 'case', caseQty: 12, caseCost: 36 },
    ...overrides,
  };
}

function candle(id: string, overrides: Partial<Candle> = {}): Candle {
  return {
    id,
    kind: 'candle',
    name: id,
    qtyOwned: 6,
    notes: '',
    url: '',
    brand: '',
    effect: 'Stars',
    shots: 10,
    durationSec: 15,
    leadDelaySec: 2,
    pricing: { mode: 'unit', unitCost: 6 },
    ...overrides,
  };
}

function sub(name: string, shots: number, offsetSec: number, durationSec: number, categories: SubCake['categories'] = []): SubCake {
  return { id: name, name, shots, offsetSec, durationSec, effectNotes: '', categories };
}

function shell(id: string, overrides: Partial<Shell> = {}): Shell {
  return {
    id,
    kind: 'shell',
    name: id,
    qtyOwned: 24,
    notes: '',
    url: '',
    brand: '',
    effect: 'Peony',
    sizeIn: 1.75,
    leadDelaySec: 2,
    burstDurationSec: 3,
    pricing: { mode: 'case', caseQty: 24, caseCost: 60 },
    ...overrides,
  };
}

const rack: Rack = {
  id: 'rack',
  kind: 'rack',
  name: 'Rack 3',
  qtyOwned: 2,
  notes: '',
  url: '',
  rows: 1,
  cols: 3,
  tubeSizeIn: 1.75,
  tubeSpacingIn: 2.4,
  unitCost: 30,
};

function mod(id: string, overrides: Partial<FiringModule> = {}): FiringModule {
  return {
    id,
    name: id,
    modelName: 'Generic 12-cue receiver',
    cueCount: 12,
    positionId: null,
    startCue: 1,
    bankChannels: [1],
    pinOverrides: {},
    ...overrides,
  };
}

function baseShow(): Show {
  const show = createEmptyShow();
  const pos = show.positions[0];
  pos.y = 10;
  show.catalog = [cake('A'), cake('B'), shell('S'), rack];
  show.firing.modules = [mod('M1', { positionId: pos.id })];
  return show;
}

describe('addressing', () => {
  it('maps flat receivers from their start cue', () => {
    const show = baseShow();
    const m = mod('R2', { startCue: 13 });
    expect(pinAddress(show.firing.controller, m, 1)).toBe(flatAddressId(13));
    expect(pinAddress(show.firing.controller, m, 4)).toBe(flatAddressId(16));
  });

  it('splits COBRA 36M pins across two bank channels', () => {
    const ctrl = controllerFromPreset(presetById('cobra'));
    const m = mod('36M', { cueCount: 36, bankChannels: [5, 6] });
    expect(pinAddress(ctrl, m, 18)).toBe(channelAddressId(5, 18));
    expect(pinAddress(ctrl, m, 19)).toBe(channelAddressId(6, 1));
  });

  it('honours manual pin overrides', () => {
    const show = baseShow();
    const m = mod('R', { pinOverrides: { '2': flatAddressId(1) } });
    expect(pinAddress(show.firing.controller, m, 2)).toBe(flatAddressId(1));
  });
});

describe('timing', () => {
  it('chains cakes through exit fuse and fuse delay', () => {
    const show = baseShow();
    const pos = show.positions[0].id;
    show.placed = [
      { id: 'pA', catalogId: 'A', positionId: pos, x: 0, y: 0, label: '' },
      { id: 'pB', catalogId: 'B', positionId: pos, x: 0, y: 0, label: '' },
    ];
    show.fuseNodes = [{ id: 'ig', kind: 'igniter', positionId: pos, x: 0, y: 0, moduleId: 'M1', pin: 1 }];
    show.fuseSegments = [
      { id: 's1', positionId: pos, from: nodeKey('ig'), to: inKey('pA'), fuseTypeId: QUICK, lengthIn: 0 },
      // 6 in green visco = 15 s
      { id: 's2', positionId: pos, from: outKey('pA'), to: inKey('pB'), fuseTypeId: GREEN, lengthIn: 6 },
    ];
    show.cueTimes = { [flatAddressId(1)]: 10 };

    const t = computeTiming(show);
    const a = t.effects.find((e) => e.placedId === 'pA')!;
    const b = t.effects.find((e) => e.placedId === 'pB')!;
    expect(a.startSec).toBeCloseTo(13);
    expect(a.endSec).toBeCloseTo(33);
    // B lit when A's exit fuse (33 s) plus 15 s of visco burns
    expect(b.igniteSec).toBeCloseTo(48);
    expect(b.startSec).toBeCloseTo(51);
    expect(t.showEndSec).toBeCloseTo(71);
  });

  it('uses earliest arrival through a junction fan-out', () => {
    const show = baseShow();
    const pos = show.positions[0].id;
    show.placed = [
      { id: 'pA', catalogId: 'A', positionId: pos, x: 0, y: 0, label: '' },
      { id: 'pB', catalogId: 'B', positionId: pos, x: 0, y: 0, label: '' },
    ];
    show.fuseNodes = [
      { id: 'ig', kind: 'igniter', positionId: pos, x: 0, y: 0, moduleId: 'M1', pin: 1 },
      { id: 'j', kind: 'junction', positionId: pos, x: 0, y: 0 },
    ];
    show.fuseSegments = [
      { id: 's1', positionId: pos, from: nodeKey('ig'), to: nodeKey('j'), fuseTypeId: GREEN, lengthIn: 2 },
      { id: 's2', positionId: pos, from: nodeKey('j'), to: inKey('pA'), fuseTypeId: GREEN, lengthIn: 1 },
      { id: 's3', positionId: pos, from: inKey('pB'), to: nodeKey('j'), fuseTypeId: GREEN, lengthIn: 4 },
      // A slow long path to B that must lose to the junction path
      { id: 's4', positionId: pos, from: nodeKey('ig'), to: inKey('pB'), fuseTypeId: GREEN, lengthIn: 24 },
    ];
    show.cueTimes = { [flatAddressId(1)]: 0 };
    const t = computeTiming(show);
    expect(t.effects.find((e) => e.placedId === 'pA')!.igniteSec).toBeCloseTo(7.5);
    expect(t.effects.find((e) => e.placedId === 'pB')!.igniteSec).toBeCloseTo(15);
  });

  it('times rack tubes fused in series and reports unloaded fuse as unscheduled', () => {
    const show = baseShow();
    const pos = show.positions[0].id;
    show.placed = [
      { id: 'r', catalogId: 'rack', positionId: pos, x: 0, y: 0, label: '', tubes: ['S', 'S', 'S'] },
    ];
    show.fuseNodes = [{ id: 'ig', kind: 'igniter', positionId: pos, x: 0, y: 0, moduleId: 'M1', pin: 3 }];
    show.fuseSegments = [
      { id: 's1', positionId: pos, from: nodeKey('ig'), to: tubeKey('r', 0), fuseTypeId: QUICK, lengthIn: 0 },
      { id: 's2', positionId: pos, from: tubeKey('r', 0), to: tubeKey('r', 1), fuseTypeId: GREEN, lengthIn: 2.4 },
    ];
    show.cueTimes = { [flatAddressId(3)]: 5 };
    const t = computeTiming(show);
    const tubes = t.effects.map((e) => [e.tubeIndex, e.startSec]);
    expect(tubes).toEqual([
      [0, 7],
      [1, 13],
    ]);
    expect(t.unscheduled.map((u) => u.tubeIndex)).toEqual([2]);
  });

  it('fires linked pins on different modules at the same time', () => {
    const show = baseShow();
    const pos = show.positions[0].id;
    show.firing.modules.push(mod('M2', { positionId: pos, startCue: 13, pinOverrides: { '1': flatAddressId(1) } }));
    show.placed = [
      { id: 'pA', catalogId: 'A', positionId: pos, x: 0, y: 0, label: '' },
      { id: 'pB', catalogId: 'B', positionId: pos, x: 0, y: 0, label: '' },
    ];
    show.fuseNodes = [
      { id: 'i1', kind: 'igniter', positionId: pos, x: 0, y: 0, moduleId: 'M1', pin: 1 },
      { id: 'i2', kind: 'igniter', positionId: pos, x: 0, y: 0, moduleId: 'M2', pin: 1 },
    ];
    show.fuseSegments = [
      { id: 's1', positionId: pos, from: nodeKey('i1'), to: inKey('pA'), fuseTypeId: QUICK, lengthIn: 0 },
      { id: 's2', positionId: pos, from: nodeKey('i2'), to: inKey('pB'), fuseTypeId: QUICK, lengthIn: 0 },
    ];
    show.cueTimes = { [flatAddressId(1)]: 42 };
    const t = computeTiming(show);
    expect(t.effects.map((e) => e.igniteSec)).toEqual([42, 42]);
    const issues = validateShow(show, t, computeTotals(show));
    expect(issues.some((i) => i.level === 'info' && i.message.includes('linked'))).toBe(true);
  });

  it('terminates on fuse loops', () => {
    const show = baseShow();
    const pos = show.positions[0].id;
    show.fuseNodes = [
      { id: 'ig', kind: 'igniter', positionId: pos, x: 0, y: 0, moduleId: 'M1', pin: 1 },
      { id: 'j1', kind: 'junction', positionId: pos, x: 0, y: 0 },
      { id: 'j2', kind: 'junction', positionId: pos, x: 0, y: 0 },
    ];
    show.fuseSegments = [
      { id: 'a', positionId: pos, from: nodeKey('ig'), to: nodeKey('j1'), fuseTypeId: GREEN, lengthIn: 1 },
      { id: 'b', positionId: pos, from: nodeKey('j1'), to: nodeKey('j2'), fuseTypeId: GREEN, lengthIn: 1 },
      { id: 'c', positionId: pos, from: nodeKey('j2'), to: nodeKey('ig'), fuseTypeId: GREEN, lengthIn: 1 },
    ];
    show.cueTimes = { [flatAddressId(1)]: 0 };
    const t = computeTiming(show);
    expect(t.arrivals.get(nodeKey('j2'))!.t).toBeCloseTo(2.5);
  });
});

describe('totals and cost', () => {
  it('adds allowance and waste, rounds fuse up to rolls, and counts igniters with spares', () => {
    const show = baseShow();
    const pos = show.positions[0].id;
    show.settings.connectionAllowanceIn = 2;
    show.settings.fuseWastePct = 10;
    show.settings.igniterSparePct = 10;
    show.fuseTypes.find((f) => f.id === GREEN)!.rollLengthFt = 10;
    show.fuseNodes = [
      { id: 'i1', kind: 'igniter', positionId: pos, x: 0, y: 0, moduleId: 'M1', pin: 1 },
      { id: 'i2', kind: 'igniter', positionId: pos, x: 0, y: 0, moduleId: 'M1', pin: 2 },
    ];
    show.fuseSegments = [
      { id: 'a', positionId: pos, from: nodeKey('i1'), to: nodeKey('i2'), fuseTypeId: GREEN, lengthIn: 118 },
    ];
    const totals = computeTotals(show);
    const green = totals.fuse[0];
    expect(green.rawIn).toBe(118);
    expect(green.totalIn).toBeCloseTo(132); // (118 + 2) * 1.1
    expect(green.rolls).toBe(2);
    expect(totals.igniters).toMatchObject({ count: 2, spares: 1, total: 3 });
    expect(totals.cues.used.sort()).toEqual([flatAddressId(1), flatAddressId(2)]);
    expect(totals.modules[0].used).toBe(2);
  });

  it('derives shell unit cost from case pricing and totals show cost', () => {
    const show = baseShow();
    const pos = show.positions[0].id;
    expect(shellUnitCost(show.catalog.find((c) => c.id === 'S') as Shell)).toBe(2.5);
    show.placed = [
      { id: 'pA', catalogId: 'A', positionId: pos, x: 0, y: 0, label: '' },
      { id: 'r', catalogId: 'rack', positionId: pos, x: 0, y: 0, label: '', tubes: ['S', 'S', null] },
    ];
    const totals = computeTotals(show);
    const cost = computeCost(show, totals);
    expect(cost.lines.map((l) => [l.name, l.total])).toEqual([
      ['A', 40],
      ['S', 5],
    ]);
    expect(cost.total).toBe(45);
    show.settings.includeRacksInCost = true;
    expect(computeCost(show, computeTotals(show)).total).toBe(75);
  });
});

describe('validation', () => {
  it('flags over-allocation, igniter limits, missing times and audience distance', () => {
    const show = baseShow();
    const pos = show.positions[0];
    show.catalog.find((c) => c.id === 'A')!.qtyOwned = 1;
    show.placed = [
      { id: 'p1', catalogId: 'A', positionId: pos.id, x: 0, y: 0, label: '' },
      { id: 'p2', catalogId: 'A', positionId: pos.id, x: 0, y: 0, label: '' },
    ];
    show.firing.controller.maxIgnitersPerCue = 1;
    show.fuseNodes = [
      { id: 'i1', kind: 'igniter', positionId: pos.id, x: 0, y: 0, moduleId: 'M1', pin: 1 },
      { id: 'i2', kind: 'igniter', positionId: pos.id, x: 0, y: 0, moduleId: 'M1', pin: 1 },
    ];
    pos.y = 55; // audience line at y=60
    const issues = validateShow(show, computeTiming(show), computeTotals(show));
    const text = issues.map((i) => i.message).join('\n');
    expect(text).toMatch(/2 used but only 1/);
    expect(text).toMatch(/2 igniters/);
    expect(text).toMatch(/no fire time/);
    expect(text).toMatch(/safety radius/);
  });
});

describe('show file', () => {
  it('round-trips through JSON validation', () => {
    const show = baseShow();
    expect(parseShow(JSON.parse(JSON.stringify(show)))).toEqual(show);
    expect(() => parseShow({ hello: 1 })).toThrow(/schemaVersion/);
  });

  it('fills in a blank web link for items saved before links existed', () => {
    const raw = JSON.parse(JSON.stringify(baseShow()));
    delete raw.catalog[0].url;
    expect(parseShow(raw).catalog[0].url).toBe('');
  });

  it('fills in cake classification and worksheet supplies for older files', () => {
    const raw = JSON.parse(JSON.stringify(baseShow()));
    delete raw.catalog[0].weightClass;
    delete raw.catalog[0].categories;
    delete raw.settings.worksheetSupplies;
    const show = parseShow(raw);
    expect(show.catalog[0]).toMatchObject({ weightClass: null, categories: [] });
    expect(show.settings.worksheetSupplies).toEqual(DEFAULT_WORKSHEET_SUPPLIES);
  });

  it('rejects unknown cake categories and weight classes', () => {
    const raw = JSON.parse(JSON.stringify(baseShow()));
    raw.catalog[0].weightClass = '750g';
    expect(() => parseShow(raw)).toThrow(/weightClass/);
  });
});

describe('demo show', () => {
  it('includes rockets, roman candles, a compound cake and remote districts, all timed', () => {
    const show = createDemoShow();
    const timing = computeTiming(show);
    expect(show.firing.controller.cuesPerDistrict).toBe(4);
    for (const kind of ['cake', 'rocket', 'candle', 'shell'] as const) {
      expect(timing.effects.some((e) => e.kind === kind)).toBe(true);
    }
    expect(timing.effects.some((e) => e.sections.length === 3)).toBe(true);
    expect(timing.unscheduled).toEqual([]);
    const districts = buildCueList(show, timing).map((c) => c.district?.short);
    expect(districts).toEqual(['D1', 'D1', 'D1', 'D1', 'D3', 'D3', 'D3', 'D4', 'D4', 'D2']);
  });

  it('uses Bilusocn 4-cue receivers, no quickmatch, and loads cleanly', () => {
    const show = createDemoShow();
    expect(show.firing.controller.presetId).toBe('bilusocn');
    expect(show.firing.modules.every((m) => m.cueCount === 4)).toBe(true);
    expect(show.fuseSegments.some((f) => f.fuseTypeId === 'fuse-quickmatch')).toBe(false);
    expect(parseShow(JSON.parse(JSON.stringify(show)))).toEqual(show);
    expect(validateShow(show, computeTiming(show), computeTotals(show)).filter((i) => i.level === 'error')).toEqual([]);
  });
});

describe('web links', () => {
  it('assumes https and only renders http(s) links', () => {
    expect(normalizeUrl('  example.com/cake ')).toBe('https://example.com/cake');
    expect(normalizeUrl('http://shop.test')).toBe('http://shop.test');
    expect(normalizeUrl('')).toBe('');
    expect(safeHref('https://example.com')).toBe('https://example.com');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('')).toBeNull();
  });
});

describe('cake categories', () => {
  it('accepts ghost, colors, strobe, transition, fast, golden and slow', () => {
    const raw = JSON.parse(JSON.stringify(baseShow()));
    raw.catalog[0].categories = ['Ghost', 'Colors', 'Strobe', 'Transition', 'Fast', 'Golden', 'Slow'];
    expect((parseShow(raw).catalog[0] as Cake).categories).toHaveLength(7);
  });
});

describe('compound cakes', () => {
  it('derives shots and duration from sub cakes and times each one', () => {
    const show = baseShow();
    const pos = show.positions[0].id;
    const compound = normalizeCake(
      cake('C', {
        subCakes: [sub('Ghost', 20, 0, 12, ['Ghost']), sub('Strobe', 30, 12, 10, ['Strobe', 'Fast']), sub('Golden', 16, 22, 18)],
      }),
    );
    expect(compound).toMatchObject({ shots: 66, durationSec: 40 });
    show.catalog.push(compound);
    show.placed = [{ id: 'pC', catalogId: 'C', positionId: pos, x: 0, y: 0, label: '' }];
    show.fuseNodes = [{ id: 'ig', kind: 'igniter', positionId: pos, x: 0, y: 0, moduleId: 'M1', pin: 1 }];
    show.fuseSegments = [{ id: 's1', positionId: pos, from: nodeKey('ig'), to: inKey('pC'), fuseTypeId: QUICK, lengthIn: 0 }];
    show.cueTimes = { [flatAddressId(1)]: 10 };

    const e = computeTiming(show).effects[0];
    expect([e.startSec, e.endSec]).toEqual([13, 53]);
    expect(e.sections.map((x) => [x.name, x.startSec, x.endSec])).toEqual([
      ['Ghost', 13, 25],
      ['Strobe', 25, 35],
      ['Golden', 35, 53],
    ]);
    expect(parseShow(JSON.parse(JSON.stringify(show))).catalog.find((c) => c.id === 'C')).toEqual(compound);
  });

  it('leaves plain cakes alone and lays sub cakes end to end', () => {
    const plain = cake('P');
    expect(normalizeCake(plain)).toBe(plain);
    const laid = sequenceSubCakes([sub('a', 1, 5, 10), sub('b', 1, 0, 4), sub('c', 1, 0, 6)]);
    expect(laid.map((x) => x.offsetSec)).toEqual([0, 10, 14]);
  });

  it('fills in no sub cakes for older files', () => {
    const raw = JSON.parse(JSON.stringify(baseShow()));
    delete raw.catalog[0].subCakes;
    expect((parseShow(raw).catalog[0] as Cake).subCakes).toEqual([]);
  });
});

describe('rockets and roman candles', () => {
  function show() {
    const s = baseShow();
    const pos = s.positions[0].id;
    s.catalog.push(rocket('R'), candle('RC'));
    s.placed = [
      { id: 'pRC', catalogId: 'RC', positionId: pos, x: 0, y: 0, label: '' },
      { id: 'pR', catalogId: 'R', positionId: pos, x: 0, y: 0, label: '' },
      { id: 'r', catalogId: 'rack', positionId: pos, x: 0, y: 0, label: '', tubes: ['R', 'S', null] },
    ];
    s.fuseNodes = [
      { id: 'i1', kind: 'igniter', positionId: pos, x: 0, y: 0, moduleId: 'M1', pin: 1 },
      { id: 'i2', kind: 'igniter', positionId: pos, x: 0, y: 0, moduleId: 'M1', pin: 2 },
    ];
    s.fuseSegments = [
      { id: 'a', positionId: pos, from: nodeKey('i1'), to: inKey('pRC'), fuseTypeId: QUICK, lengthIn: 0 },
      { id: 'b', positionId: pos, from: nodeKey('i1'), to: inKey('pR'), fuseTypeId: QUICK, lengthIn: 0 },
      { id: 'c', positionId: pos, from: nodeKey('i2'), to: tubeKey('r', 0), fuseTypeId: QUICK, lengthIn: 0 },
      { id: 'd', positionId: pos, from: tubeKey('r', 0), to: tubeKey('r', 1), fuseTypeId: GREEN, lengthIn: 2.4 },
    ];
    s.cueTimes = { [flatAddressId(1)]: 0, [flatAddressId(2)]: 20 };
    return s;
  }

  it('times them placed on their own or loaded in rack tubes', () => {
    const t = computeTiming(show());
    const summary = t.effects.map((e) => [e.kind, e.tubeIndex, e.startSec, e.endSec]);
    expect(summary).toEqual([
      ['candle', null, 2, 17],
      ['rocket', null, 3, 5],
      ['rocket', 0, 23, 25],
      ['shell', 1, 28, 31],
    ]);
  });

  it('costs them per piece or by the pack, in their own categories', () => {
    const s = show();
    const cost = computeCost(s, computeTotals(s));
    const lines = cost.lines.filter((l) => l.category === 'Roman candles' || l.category === 'Rockets');
    expect(lines.map((l) => [l.category, l.qty, l.unitCost, l.total])).toEqual([
      ['Roman candles', 1, 6, 6],
      ['Rockets', 2, 3, 6],
    ]);
    expect(lines[0]).toMatchObject({ perShot: 0.6, perSec: 0.4 });
    expect(lines[1]).toMatchObject({ perShot: null, perSec: null });
  });
});

describe('cost per shot and per second', () => {
  it('divides cake cost by shots and duration', () => {
    expect(costPerShot(cake('A'))).toBeCloseTo(1.6);
    expect(costPerSecond(cake('A'))).toBeCloseTo(2);
    expect(costPerShot(cake('Z', { shots: 0, durationSec: 0 }))).toBeNull();
    expect(costPerSecond(cake('Z', { shots: 0, durationSec: 0 }))).toBeNull();
    expect(costPerShot(shell('S'))).toBeNull();
    expect(costPerShot(rack)).toBeNull();
  });

  it('adds them to show cost lines for cakes only', () => {
    const show = baseShow();
    const pos = show.positions[0].id;
    show.placed = [
      { id: 'pA', catalogId: 'A', positionId: pos, x: 0, y: 0, label: '' },
      { id: 'r', catalogId: 'rack', positionId: pos, x: 0, y: 0, label: '', tubes: ['S', null, null] },
    ];
    const cost = computeCost(show, computeTotals(show));
    expect(cost.lines.map((l) => [l.name, l.perShot, l.perSec])).toEqual([
      ['A', 1.6, 2],
      ['S', null, null],
    ]);
    expect(cost.inventoryLines.find((l) => l.name === 'A')).toMatchObject({ perShot: 1.6, perSec: 2 });
  });
});

describe('districts', () => {
  it('splits flat remotes into districts and treats channels as districts', () => {
    const ctrl = { ...createEmptyShow().firing.controller, cuesPerChannel: 30, cuesPerDistrict: 12 };
    expect(cueDistrict(ctrl, flatAddressId(12))).toMatchObject({ key: 'd1', label: 'District 1', range: 'Cues 1–12' });
    expect(cueDistrict(ctrl, flatAddressId(13))).toMatchObject({ key: 'd2', short: 'D2', range: 'Cues 13–24' });
    expect(cueDistrict(ctrl, flatAddressId(30))).toMatchObject({ index: 3, range: 'Cues 25–30' });
    expect(cueDistrict({ ...ctrl, cuesPerDistrict: 0 }, flatAddressId(13))).toBeNull();
    const cobra = controllerFromPreset(presetById('cobra'));
    expect(cueDistrict(cobra, channelAddressId(7, 3))).toMatchObject({ key: 'ch7', label: 'Channel 7' });
    expect(cueDistrict(controllerFromPreset(presetById('ignite')), moduleAddressId('m', 1))).toBeNull();
  });

  it('labels each cue in the cue list and defaults older files to no districts', () => {
    const show = baseShow();
    const pos = show.positions[0].id;
    show.firing.controller.cuesPerDistrict = 2;
    show.fuseNodes = [1, 2, 3].map((pin) => ({ id: `i${pin}`, kind: 'igniter' as const, positionId: pos, x: 0, y: 0, moduleId: 'M1', pin }));
    show.cueTimes = { [flatAddressId(1)]: 0, [flatAddressId(2)]: 5, [flatAddressId(3)]: 10 };
    expect(buildCueList(show, computeTiming(show)).map((c) => c.district?.label)).toEqual([
      'District 1',
      'District 1',
      'District 2',
    ]);

    const raw = JSON.parse(JSON.stringify(baseShow()));
    delete raw.firing.controller.cuesPerDistrict;
    expect(parseShow(raw).firing.controller.cuesPerDistrict).toBe(0);
  });
});

describe('rack worksheet diagram', () => {
  it('orients tube runs the way fire travels and shows where fuse joins the rack', () => {
    const show = baseShow();
    const pos = show.positions[0].id;
    show.placed = [{ id: 'r', catalogId: 'rack', positionId: pos, x: 0, y: 0, label: '', tubes: ['S', 'S', 'S'] }];
    show.fuseNodes = [{ id: 'ig', kind: 'igniter', positionId: pos, x: 0, y: 0, moduleId: 'M1', pin: 1 }];
    // Drawn from tube 1 toward tube 3, but lit at tube 3.
    show.fuseSegments = [
      { id: 'a', positionId: pos, from: tubeKey('r', 0), to: tubeKey('r', 1), fuseTypeId: GREEN, lengthIn: 2 },
      { id: 'b', positionId: pos, from: tubeKey('r', 1), to: tubeKey('r', 2), fuseTypeId: GREEN, lengthIn: 2 },
      { id: 'c', positionId: pos, from: nodeKey('ig'), to: tubeKey('r', 2), fuseTypeId: QUICK, lengthIn: 1 },
    ];
    show.cueTimes = { [flatAddressId(1)]: 0 };
    const [sheet] = buildPositionSheets(show, computeTiming(show));
    const rackSheet = sheet.racks[0];
    expect(rackSheet.runs.map((x) => [x.a, x.b, x.directed])).toEqual([
      [1, 0, true],
      [2, 1, true],
    ]);
    expect(rackSheet.runs[0].color).toBe('#22c55e');
    expect(rackSheet.links).toEqual([
      expect.objectContaining({ index: 2, other: 'E-match on M1 #1', entering: true, fuseName: 'Quickmatch' }),
    ]);
    // 2 in of green visco is 5 s per link; the inch of quickmatch adds a few milliseconds.
    expect(rackSheet.tubes.map((x) => x.litSec)).toEqual([expect.closeTo(10, 1), expect.closeTo(5, 1), expect.closeTo(0, 1)]);
  });
});
