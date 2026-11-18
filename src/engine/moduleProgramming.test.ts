import { describe, expect, it } from 'vitest';
import { flatAddressId, pinAddress } from '../model/addressing';
import { createEmptyShow } from '../model/defaults';
import { createDemoShow } from '../model/demo';
import { controllerFromPreset, presetById } from '../model/presets';
import { alignDown, alignUp, cueBlockSize, enforceBlockProgramming } from '../model/programming';
import type { FiringModule, Show } from '../model/schema';
import { parseShow } from '../model/schema';
import { suggestModuleProgramming, withModuleStarts } from './moduleProgramming';

function mod(id: string, startCue: number, overrides: Partial<FiringModule> = {}): FiringModule {
  return {
    id,
    name: id,
    modelName: 'Bilusocn 4-cue receiver',
    cueCount: 4,
    positionId: null,
    startCue,
    bankChannels: [1],
    pinOverrides: {},
    ...overrides,
  };
}

/** A Bilusocn show; `wires` lists [moduleId, pin] for each igniter. */
function bilusocn(modules: FiringModule[], wires: [string, number][], cuesPerDistrict = 0): Show {
  const s = createEmptyShow();
  s.firing.controller = { ...controllerFromPreset(presetById('bilusocn')), cuesPerDistrict };
  s.firing.modules = modules;
  const pos = s.positions[0].id;
  s.fuseNodes = wires.map(([moduleId, pin], i) => ({ id: `ig${i}`, kind: 'igniter', positionId: pos, x: 0, y: 0, moduleId, pin }));
  return s;
}

/** Fire time of each wired module pin, keyed "M1:2". */
function pinTimes(s: Show) {
  const out: Record<string, number | undefined> = {};
  for (const n of s.fuseNodes) {
    if (n.kind !== 'igniter') continue;
    const m = s.firing.modules.find((x) => x.id === n.moduleId)!;
    out[`${m.id}:${n.pin}`] = s.cueTimes[pinAddress(s.firing.controller, m, n.pin)];
  }
  return out;
}

describe('block-coded receivers', () => {
  it('only Bilusocn codes receivers in blocks of 4', () => {
    expect(cueBlockSize(controllerFromPreset(presetById('bilusocn')))).toBe(4);
    expect(cueBlockSize(controllerFromPreset(presetById('generic')))).toBeNull();
    expect(cueBlockSize(controllerFromPreset(presetById('cobra')))).toBeNull();
    expect([1, 2, 4, 5, 8, 9].map((c) => alignDown(c, 4))).toEqual([1, 1, 1, 5, 5, 9]);
    expect([1, 2, 5, 6, 9].map((c) => alignUp(c, 4))).toEqual([1, 5, 5, 9, 9]);
  });

  it('drops single-cue links and moves mid-block receivers on load, keeping cue times', () => {
    const s = bilusocn(
      [mod('M1', 1), mod('M2', 5), mod('M3', 13, { pinOverrides: { '1': flatAddressId(5) } }), mod('M4', 3)],
      [
        ['M1', 1],
        ['M2', 1],
        ['M3', 1],
        ['M3', 2],
        ['M4', 1],
      ],
    );
    s.cueTimes = { [flatAddressId(1)]: 0, [flatAddressId(5)]: 30, [flatAddressId(14)]: 40, [flatAddressId(3)]: 50 };
    const before = pinTimes(s);
    const loaded = parseShow(JSON.parse(JSON.stringify(s)));
    expect(loaded.firing.modules.map((m) => [m.name, m.startCue, m.pinOverrides])).toEqual([
      ['M1', 1, {}],
      ['M2', 5, {}],
      ['M3', 13, {}],
      // Cues 1–4 and 5–8 are taken, so M4 isn't silently linked with M1.
      ['M4', 9, {}],
    ]);
    expect(pinTimes(loaded)).toEqual(before);
  });

  it('keeps whole-receiver links and leaves other systems alone', () => {
    const s = bilusocn([mod('M1', 1), mod('M2', 1)], [['M1', 1]]);
    expect(enforceBlockProgramming(s)).toEqual([]);
    const generic = bilusocn([mod('M1', 3, { pinOverrides: { '1': flatAddressId(9) } })], []);
    generic.firing.controller = controllerFromPreset(presetById('generic'));
    expect(enforceBlockProgramming(generic)).toEqual([]);
    expect(generic.firing.modules[0].startCue).toBe(3);
  });

  it('loads the demo show without changes', () => {
    const demo = createDemoShow();
    expect(demo.firing.modules.every((m) => Object.keys(m.pinOverrides).length === 0 && (m.startCue - 1) % 4 === 0)).toBe(
      true,
    );
    expect(parseShow(JSON.parse(JSON.stringify(demo)))).toEqual(demo);
  });
});

describe('suggestModuleProgramming', () => {
  it('returns nothing for systems without blocks', () => {
    const s = createEmptyShow();
    expect(suggestModuleProgramming(s)).toBeNull();
  });

  it('lays receivers out in fire order and links receivers that fire together', () => {
    // M1 fires last, M2 first; M3 fires exactly with M2 on its shared pins; M4 has nothing wired.
    const s = bilusocn(
      [mod('M1', 1), mod('M2', 5), mod('M3', 9), mod('M4', 13)],
      [
        ['M1', 1],
        ['M2', 1],
        ['M2', 2],
        ['M3', 1],
        ['M3', 3],
      ],
    );
    s.cueTimes = {
      [flatAddressId(1)]: 100,
      [flatAddressId(5)]: 0,
      [flatAddressId(6)]: 10,
      [flatAddressId(9)]: 0,
      [flatAddressId(11)]: 20,
    };
    const plan = suggestModuleProgramming(s)!;
    const start = Object.fromEntries(plan.modules.map((m) => [m.name, m.suggestedStart]));
    expect(start).toEqual({ M2: 1, M3: 1, M1: 5, M4: 9 });
    expect(plan.modules.find((m) => m.name === 'M2')!.linkedWith).toEqual(['M3']);
    expect(plan.changed).toBe(true);
    expect(plan.before.backtracks).toBe(2);
    expect(plan.after.backtracks).toBe(0);
    expect(plan.after.lastCue).toBe(5);
    expect(plan.notes.some((n) => n.includes('M4'))).toBe(true);

    const applied = withModuleStarts(s, Object.fromEntries(plan.modules.map((m) => [m.moduleId, m.suggestedStart])));
    expect(pinTimes(applied)).toEqual(pinTimes(s));
    expect(suggestModuleProgramming(applied)!.changed).toBe(false);
  });

  it("doesn't link receivers whose shared cues fire at different times", () => {
    const s = bilusocn(
      [mod('M1', 1), mod('M2', 5)],
      [
        ['M1', 1],
        ['M2', 1],
      ],
    );
    s.cueTimes = { [flatAddressId(1)]: 0, [flatAddressId(5)]: 5 };
    const plan = suggestModuleProgramming(s)!;
    expect(plan.modules.map((m) => m.suggestedStart)).toEqual([1, 5]);
    expect(plan.changed).toBe(false);
  });

  it('keeps a receiver inside one remote district', () => {
    const s = bilusocn(
      [mod('M1', 1), mod('M2', 5, { cueCount: 12 })],
      [
        ['M1', 1],
        ['M2', 1],
      ],
      12,
    );
    s.cueTimes = { [flatAddressId(1)]: 0, [flatAddressId(5)]: 5 };
    const plan = suggestModuleProgramming(s)!;
    expect(plan.modules.map((m) => [m.name, m.suggestedStart])).toEqual([
      ['M1', 1],
      ['M2', 13],
    ]);
  });

  it('flags plans that need more cues than the remote has', () => {
    const mods = Array.from({ length: 16 }, (_, i) => mod(`M${i + 1}`, i * 4 + 1));
    const s = bilusocn(mods, mods.map((m) => [m.id, 1] as [string, number]));
    s.cueTimes = Object.fromEntries(mods.map((m, i) => [flatAddressId(m.startCue), i]));
    const plan = suggestModuleProgramming(s)!;
    expect(plan.overCapacity).toBe(true);
    expect(plan.notes[0]).toMatch(/64 remote cues/);
  });
});
