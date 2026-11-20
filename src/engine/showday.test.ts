import { describe, expect, it } from 'vitest';
import type { District } from '../model/addressing';
import { flatAddressId } from '../model/addressing';
import { createDemoShow } from '../model/demo';
import { inKey, outKey, tubeKey } from '../model/endpoints';
import type { Show } from '../model/schema';
import { calloutsBetween, spokenCue, type CalloutCue } from './callouts';
import { scoreDryRun } from './dryRun';
import { buildSweepList } from './sweep';
import { computeTiming } from './timing';

const d1: District = { key: 'd1', index: 1, label: 'District 1', short: 'D1', range: '1–4' };
const d2: District = { key: 'd2', index: 2, label: 'District 2', short: 'D2', range: '5–8' };
const cue = (n: number, time: number, district: District | null = null): CalloutCue => ({
  addressId: `c${n}`,
  label: `Cue ${n}`,
  time,
  district,
});

/** Callouts from playing the clock from `from` to `to` in 1/60 s ticks, with the time of each. */
function play(cues: CalloutCue[], from: number, to: number) {
  const out: { t: number; kind: string; text: string }[] = [];
  const step = 1 / 60;
  for (let t = from; t < to; t += step) {
    for (const c of calloutsBetween(cues, t, t + step))
      out.push({ t: Math.round((t + step) * 10) / 10, ...c });
  }
  return out;
}

describe('cue callouts', () => {
  it('warns 10 s out, counts 3-2-1 and calls the cue once each', () => {
    const calls = play([cue(7, 20)], 0, 21);
    expect(calls.map((c) => [c.t, c.kind, c.text])).toEqual([
      [10, 'warn', 'Cue 7 in 10'],
      [17, 'count', '3'],
      [18, 'count', '2'],
      [19, 'count', '1'],
      [20, 'go', 'Go'],
    ]);
  });

  it('calls a district switch as soon as the cue before it fires, and in the 10 s warning', () => {
    const calls = play([cue(1, 0, d1), cue(5, 30, d2)], -1, 30.5);
    const texts = calls.map((c) => c.text);
    expect(calls.find((c) => c.kind === 'switch')).toMatchObject({
      t: 0,
      text: 'Switch to District 2',
    });
    expect(texts).toContain('Cue 5 in 10. Switch to District 2');
  });

  it('gives a close cue its warning when the cue before fires, without repeating the switch', () => {
    const calls = play([cue(1, 0, d1), cue(5, 6, d2)], -1, 7);
    const atZero = calls.filter((c) => c.t === 0).map((c) => c.text);
    expect(atZero).toEqual(['Go', 'Switch to District 2', 'Cue 5 in 6']);
  });

  it('starts the first cue with the district to start on and names cues that fire together', () => {
    const calls = play([cue(5, 12, d1), cue(13, 12, d1)], 0, 3);
    expect(calls[0].text).toBe('Cue 5 and Cue 13 in 10. Start on District 1');
  });

  it('calls nothing out across a seek or when the clock goes back', () => {
    expect(calloutsBetween([cue(1, 5)], 0, 6)).toEqual([]);
    expect(calloutsBetween([cue(1, 5)], 6, 4.9)).toEqual([]);
  });

  it('reads cue labels aloud', () => {
    expect(spokenCue('Cue 13 (2-1)')).toBe('Cue 13');
    expect(spokenCue('Ch 2 · Cue 3')).toBe('Channel 2, cue 3');
    expect(spokenCue('M2 · Cue 3')).toBe('M2, cue 3');
  });
});

describe('dry run scoring', () => {
  const cues = [cue(1, 0, d1), cue(2, 10, d1), cue(5, 20, d2), cue(6, 30, d2)];

  it('scores each press against the nearest cue, so a skipped cue does not shift the rest', () => {
    const r = scoreDryRun(cues, { presses: [0.2, 21, 30.4], switches: [] }, 40);
    expect(r.cues.map((c) => c.pressedAt)).toEqual([0.2, null, 21, 30.4]);
    expect(r.missed).toBe(1);
    expect(r.worstLate?.label).toBe('Cue 5');
    expect(r.meanAbsOffset).toBeCloseTo((0.2 + 1 + 0.4) / 3);
  });

  it('times each district switch against the press that needed it', () => {
    const onTime = scoreDryRun(cues, { presses: [0, 10, 20, 30], switches: [15] }, 40);
    expect(onTime.switches).toEqual([
      expect.objectContaining({
        label: 'Cue 5',
        districtLabel: 'District 2',
        window: 10,
        margin: 5,
        late: false,
      }),
    ]);
    const late = scoreDryRun(cues, { presses: [0, 10, 20, 30], switches: [22] }, 40);
    expect(late.switches[0]).toMatchObject({ margin: -2, late: true });
    const missed = scoreDryRun(cues, { presses: [0, 10, 20, 30], switches: [] }, 40);
    expect(missed.switches[0]).toMatchObject({ switchedAt: null, late: true });
  });

  it('only scores cues the run has reached, with a moment of grace before counting a miss', () => {
    const r = scoreDryRun(cues, { presses: [0], switches: [] }, 11);
    expect(r.cues.map((c) => c.label)).toEqual(['Cue 1', 'Cue 2']);
    expect(r.missed).toBe(0);
    expect(r.switches).toEqual([]);
    expect(scoreDryRun(cues, { presses: [0], switches: [] }, 13).missed).toBe(1);
  });

  it('counts a tap long before any cue as an extra press', () => {
    expect(scoreDryRun(cues, { presses: [-8], switches: [] }, 0).extraPresses).toBe(1);
  });
});

describe('sweep list', () => {
  function demo() {
    const show = createDemoShow();
    const owl = show.placed.find(
      (p) => show.catalog.find((c) => c.id === p.catalogId)?.name === 'Night Owl',
    )!;
    const rack = show.placed.find((p) => (p.tubes?.length ?? 0) === 9)!;
    return { show, owl, rack };
  }
  const sweep = (show: Show) => buildSweepList(show, computeTiming(show));

  it('lists nothing when nothing was marked and everything was connected', () => {
    expect(sweep(demo().show)).toEqual([]);
  });

  it('lists everything on a misfired cue, including what its fuse chain would have lit', () => {
    const { show, owl } = demo();
    show.sweep.misfires.push(flatAddressId(1));
    const list = sweep(show);
    const timing = computeTiming(show);
    const onCue1 = timing.effects.filter((e) => e.addressId === flatAddressId(1));
    expect(list.map((e) => e.key).sort()).toEqual(onCue1.map((e) => e.key).sort());
    expect(list.every((e) => e.reason === 'misfire' && e.cueLabel?.startsWith('Cue 1'))).toBe(true);
    expect(list.find((e) => e.key === inKey(owl.id))?.boardName).toBe('Cake board');
  });

  it('follows a dud cake to the cakes fused after it, but not past a dud rack tube', () => {
    const { show, owl, rack } = demo();
    show.sweep.duds.push(inKey(owl.id), tubeKey(rack.id, 0));
    const list = sweep(show);
    const segAfterOwl = show.fuseSegments.find((s) => s.from === outKey(owl.id))!;
    expect(list.map((e) => [e.key, e.reason])).toEqual(
      expect.arrayContaining([
        [inKey(owl.id), 'dud'],
        [segAfterOwl.to, 'unlit'],
        [tubeKey(rack.id, 0), 'dud'],
      ]),
    );
    expect(list).toHaveLength(3);
    expect(list.find((e) => e.tubeIndex === 0)).toMatchObject({
      rackName: expect.any(String),
      tubeIndex: 0,
    });
  });

  it('includes items never connected to a timed cue', () => {
    const { show, owl } = demo();
    show.placed.push({ ...owl, id: 'loose', boardId: null });
    expect(sweep(show)).toEqual([
      expect.objectContaining({ placedId: 'loose', reason: 'unconnected', cueLabel: null }),
    ]);
  });
});
