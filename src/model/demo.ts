import { flatAddressId } from './addressing';
import { normalizeCake } from './catalog';
import { createEmptyShow, uid } from './defaults';
import { inKey, nodeKey, outKey, tubeKey } from './endpoints';
import { controllerFromPreset, presetById } from './presets';
import type { Cake, Candle, FiringModule, Rack, Rocket, Shell, Show, SubCake } from './schema';

const FAST = 'fuse-fast-visco';
const GREEN = 'fuse-green-visco';

export function createDemoShow(): Show {
  const s = createEmptyShow();
  s.meta = {
    name: 'Backyard Fourth (demo)',
    date: '2026-07-04',
    location: 'Back yard',
    notes:
      'Demo show: chained cakes, a compound cake, shell and rocket racks fused in series, roman candles, and a linked finale cue on Bilusocn 4-cue receivers. The remote is set to 4 cues per district.',
  };

  const [posA] = s.positions;
  Object.assign(posA, { name: 'Left', x: 25, y: 18 });
  const posB = { id: uid('pos'), name: 'Center', color: '#3b82f6', x: 50, y: 12, safetyRadiusFt: 35 };
  const posC = { id: uid('pos'), name: 'Right', color: '#eab308', x: 75, y: 18, safetyRadiusFt: 35 };
  s.positions.push(posB, posC);

  const cake = (name: string, extra: Partial<Cake>): Cake => ({
    id: uid('cat'),
    kind: 'cake',
    name,
    qtyOwned: 2,
    notes: '',
    url: '',
    brand: 'Demo Fireworks Co.',
    shots: 25,
    durationSec: 25,
    effectNotes: '',
    grade: '1.4G',
    unitCost: 45,
    leadDelaySec: 4,
    hasExitFuse: true,
    weightClass: null,
    categories: [],
    subCakes: [],
    ...extra,
  });
  const sub = (name: string, extra: Omit<SubCake, 'id' | 'name'>): SubCake => ({ id: uid('sub'), name, ...extra });

  const nightOwl = cake('Night Owl', {
    shots: 25,
    durationSec: 30,
    effectNotes: 'Gold brocade to crackle',
    weightClass: '500g',
    categories: ['Big breaks', 'Crackle', 'Golden'],
    notes: 'Opener',
  });
  const willow = cake('Crackling Willow', {
    shots: 16,
    durationSec: 20,
    unitCost: 30,
    effectNotes: 'Hanging willow',
    weightClass: '200g',
    categories: ['Small', 'Willow', 'Slow'],
  });
  const comets = cake('Blue Comets', {
    shots: 36,
    durationSec: 25,
    unitCost: 55,
    effectNotes: 'Blue comet fans',
    weightClass: '350g',
    categories: ['Medium', 'Fan', 'Comets'],
  });
  const strobe = cake('Strobe Fan', {
    shots: 49,
    durationSec: 28,
    unitCost: 65,
    effectNotes: 'White strobe Z-fan',
    weightClass: '500g',
    categories: ['Zipper', 'Strobe', 'Fast'],
  });
  const finale = cake('Pro Finale 500g', {
    qtyOwned: 1,
    shots: 100,
    durationSec: 45,
    unitCost: 120,
    grade: '1.4G Pro-line',
    hasExitFuse: false,
    effectNotes: 'Multicolor crossette finale',
    weightClass: '1000g+',
    categories: ['Finale', 'Long', 'NOAB', 'Colors'],
    notes: 'Stake down on a board; tall and heavy',
  });
  const compound = normalizeCake(
    cake('Triple Threat Compound', {
      qtyOwned: 1,
      unitCost: 90,
      hasExitFuse: false,
      effectNotes: 'Three cakes fused together on one lead',
      weightClass: '500g',
      categories: ['Transition', 'Colors'],
      notes: 'One lead fuse lights all three sections in turn',
      subCakes: [
        sub('Ghost fans', { shots: 20, offsetSec: 0, durationSec: 12, effectNotes: 'Blue-to-green ghost comets', categories: ['Ghost', 'Fan'] }),
        sub('Strobe crossfire', { shots: 30, offsetSec: 12, durationSec: 10, effectNotes: 'White strobe Z-pattern', categories: ['Strobe', 'Fast'] }),
        sub('Golden willow', { shots: 16, offsetSec: 22, durationSec: 18, effectNotes: 'Slow hanging gold', categories: ['Golden', 'Willow', 'Slow'] }),
      ],
    }),
  );
  const peony: Shell = {
    id: uid('cat'),
    kind: 'shell',
    name: 'Red Peony Canister',
    qtyOwned: 48,
    notes: '',
    url: '',
    brand: 'Demo Fireworks Co.',
    effect: 'Red peony with crackle',
    sizeIn: 1.75,
    leadDelaySec: 3,
    burstDurationSec: 3,
    pricing: { mode: 'case', caseQty: 24, caseCost: 60 },
  };
  const brocade: Shell = {
    id: uid('cat'),
    kind: 'shell',
    name: 'Gold Brocade Canister',
    qtyOwned: 12,
    notes: '',
    url: '',
    brand: 'Demo Fireworks Co.',
    effect: 'Gold brocade crown',
    sizeIn: 1.75,
    leadDelaySec: 3,
    burstDurationSec: 4,
    pricing: { mode: 'unit', unitCost: 4 },
  };
  const rockets: Rocket = {
    id: uid('cat'),
    kind: 'rocket',
    name: 'Sky Whistler Rocket',
    qtyOwned: 12,
    notes: 'Remove the sticks’ caps; launch from the rocket rack',
    url: '',
    brand: 'Demo Fireworks Co.',
    effect: 'Whistling tail to red peony',
    leadDelaySec: 4,
    burstDurationSec: 2,
    pricing: { mode: 'case', caseQty: 12, caseCost: 36 },
  };
  const candles: Candle = {
    id: uid('cat'),
    kind: 'candle',
    name: '10-Ball Roman Candle',
    qtyOwned: 6,
    notes: 'Tape each one to a stake',
    url: '',
    brand: 'Demo Fireworks Co.',
    effect: 'Color stars with crackle',
    shots: 10,
    durationSec: 12,
    leadDelaySec: 3,
    pricing: { mode: 'case', caseQty: 6, caseCost: 24 },
  };
  const rack: Rack = {
    id: uid('cat'),
    kind: 'rack',
    name: 'HDPE 3×3 rack',
    qtyOwned: 2,
    notes: 'Screw to a base board before loading',
    url: '',
    rows: 3,
    cols: 3,
    tubeSizeIn: 1.75,
    tubeSpacingIn: 2.5,
    unitCost: 35,
  };
  const rocketRack: Rack = {
    id: uid('cat'),
    kind: 'rack',
    name: 'Rocket rack 1×4',
    qtyOwned: 1,
    notes: 'Angle slightly away from the audience',
    url: '',
    rows: 1,
    cols: 4,
    tubeSizeIn: 1,
    tubeSpacingIn: 2,
    unitCost: 25,
  };
  s.catalog = [nightOwl, willow, comets, strobe, finale, compound, candles, rockets, peony, brocade, rack, rocketRack];

  s.firing.controller = { ...controllerFromPreset(presetById('bilusocn')), cuesPerDistrict: 4 };
  const mod = (name: string, positionId: string, startCue: number): FiringModule => ({
    id: uid('mod'),
    name,
    modelName: 'Bilusocn 4-cue receiver',
    cueCount: 4,
    positionId,
    startCue,
    bankChannels: [1],
    pinOverrides: {},
  });
  const m1 = mod('M1', posA.id, 1);
  const m2 = mod('M2', posA.id, 5);
  const m3 = mod('M3', posB.id, 9);
  const m4 = mod('M4', posC.id, 13);
  m4.pinOverrides['1'] = flatAddressId(5); // coded to cue 5 with M2 for the finale
  s.firing.modules = [m1, m2, m3, m4];

  const place = (catalogId: string, positionId: string, x: number, y: number, tubes?: (string | null)[]) => {
    const id = uid('pl');
    s.placed.push({ id, catalogId, positionId, x, y, label: '', ...(tubes ? { tubes } : {}) });
    return id;
  };
  const igniter = (positionId: string, moduleId: string, pin: number, x: number, y: number) => {
    const id = uid('ig');
    s.fuseNodes.push({ id, kind: 'igniter', positionId, moduleId, pin, x, y });
    return nodeKey(id);
  };
  const junction = (positionId: string, x: number, y: number) => {
    const id = uid('jn');
    s.fuseNodes.push({ id, kind: 'junction', positionId, x, y });
    return nodeKey(id);
  };
  const seg = (positionId: string, from: string, to: string, fuseTypeId: string, lengthIn: number) =>
    s.fuseSegments.push({ id: uid('fz'), positionId, from, to, fuseTypeId, lengthIn });

  // Left: two chained cakes and a rack in three series runs on M1, and a finale cake on M2.
  const owl = place(nightOwl.id, posA.id, 40, 220);
  const wil = place(willow.id, posA.id, 340, 220);
  seg(posA.id, igniter(posA.id, m1.id, 1, 60, 40), inKey(owl), GREEN, 2);
  seg(posA.id, outKey(owl), inKey(wil), GREEN, 4);

  const tubes = [peony.id, brocade.id, peony.id, brocade.id, peony.id, brocade.id, peony.id, peony.id, peony.id];
  const rk = place(rack.id, posA.id, 560, 200, tubes);
  [2, 3, 4].forEach((pin, row) => {
    seg(posA.id, igniter(posA.id, m1.id, pin, 520 + row * 90, 40), tubeKey(rk, row * 3), FAST, 1);
    seg(posA.id, tubeKey(rk, row * 3), tubeKey(rk, row * 3 + 1), FAST, 2.5);
    seg(posA.id, tubeKey(rk, row * 3 + 1), tubeKey(rk, row * 3 + 2), FAST, 2.5);
  });
  const strobeA = place(strobe.id, posA.id, 340, 460);
  seg(posA.id, igniter(posA.id, m2.id, 1, 60, 480), inKey(strobeA), GREEN, 2);

  // Center: two comet cakes fanned out from one junction on equal fast visco runs, a strobe cake,
  // and four rockets fused in series 5 s apart.
  const c1 = place(comets.id, posB.id, 80, 260);
  const c2 = place(comets.id, posB.id, 340, 260);
  const j = junction(posB.id, 260, 150);
  seg(posB.id, igniter(posB.id, m3.id, 1, 240, 30), j, GREEN, 2);
  seg(posB.id, j, inKey(c1), FAST, 6);
  seg(posB.id, j, inKey(c2), FAST, 6);
  const strobeB = place(strobe.id, posB.id, 600, 260);
  seg(posB.id, igniter(posB.id, m3.id, 2, 620, 30), inKey(strobeB), GREEN, 2);
  const rr = place(rocketRack.id, posB.id, 860, 260, [rockets.id, rockets.id, rockets.id, rockets.id]);
  seg(posB.id, igniter(posB.id, m3.id, 3, 880, 30), tubeKey(rr, 0), FAST, 1);
  [0, 1, 2].forEach((i) => seg(posB.id, tubeKey(rr, i), tubeKey(rr, i + 1), GREEN, 2));

  // Right: the finale on M4 coded to the same remote cue as M2 cue 1, the compound cake, and a
  // pair of roman candles staggered by fuse length from one junction.
  const fin = place(finale.id, posC.id, 120, 240);
  seg(posC.id, igniter(posC.id, m4.id, 1, 140, 40), inKey(fin), GREEN, 2);
  const tri = place(compound.id, posC.id, 380, 240);
  seg(posC.id, igniter(posC.id, m4.id, 2, 400, 40), inKey(tri), GREEN, 2);
  const rc1 = place(candles.id, posC.id, 640, 260);
  const rc2 = place(candles.id, posC.id, 900, 260);
  const jc = junction(posC.id, 800, 150);
  seg(posC.id, igniter(posC.id, m4.id, 3, 780, 30), jc, GREEN, 2);
  seg(posC.id, jc, inKey(rc1), FAST, 2);
  seg(posC.id, jc, inKey(rc2), FAST, 6);

  s.cueTimes = {
    [flatAddressId(1)]: 0,
    [flatAddressId(2)]: 42,
    [flatAddressId(3)]: 50,
    [flatAddressId(4)]: 58,
    [flatAddressId(9)]: 70,
    [flatAddressId(11)]: 84,
    [flatAddressId(10)]: 98,
    [flatAddressId(14)]: 100,
    [flatAddressId(15)]: 112,
    [flatAddressId(5)]: 125,
  };
  s.cueNotes = { [flatAddressId(5)]: 'Finale — both sides together' };
  return s;
}
