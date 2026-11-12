import { describe, expect, it } from 'vitest';
import { cueRows } from '../features/reports/exports';
import { createEmptyShow } from '../model/defaults';
import { createDemoShow } from '../model/demo';
import { parseShow, type Scene, type Show } from '../model/schema';
import {
  clampSceneMove,
  clampSceneRange,
  moveSceneIn,
  nextSceneColor,
  nextSceneName,
  sceneAt,
  sceneChangeAt,
  sceneGap,
  sceneRangeForCues,
} from './scenes';
import { computeTiming } from './timing';

const scene = (id: string, startSec: number, endSec: number): Scene => ({
  id,
  name: id,
  color: '#000000',
  startSec,
  endSec,
  note: '',
});

const A = scene('a', 10, 20);
const B = scene('b', 30, 40);

describe('scene membership', () => {
  it('includes the start of a scene but not its end', () => {
    expect(sceneAt([A], 10)).toBe(A);
    expect(sceneAt([A], 19.9)).toBe(A);
    expect(sceneAt([A], 20)).toBeNull();
    expect(sceneAt([A], null)).toBeNull();
  });

  it('gives a boundary between touching scenes to the later one', () => {
    const next = scene('next', 20, 25);
    expect(sceneAt([A, next], 20)).toBe(next);
  });
});

describe('moving a scene', () => {
  it('moves the scene and only the cues inside it', () => {
    const moved = moveSceneIn(
      { scenes: [A, B], cueTimes: { before: 5, first: 10, last: 19, atEnd: 20, other: 35 } },
      'a',
      3,
    );
    expect(moved.cueTimes).toEqual({ before: 5, first: 13, last: 22, atEnd: 20, other: 35 });
    expect(moved.scenes[0]).toMatchObject({ startSec: 13, endSec: 23 });
    expect(moved.scenes[1]).toBe(B);
  });

  it('stops at the neighbouring scene and at the start of the show', () => {
    expect(clampSceneMove([A, B], 'a', 100)).toBe(10);
    expect(clampSceneMove([A, B], 'b', -100)).toBe(-10);
    expect(clampSceneMove([A, B], 'a', -100)).toBe(-10);
    expect(clampSceneMove([A, B], 'b', 100)).toBe(100);
  });

  it('keeps the gaps between cues when the move is stopped', () => {
    const moved = moveSceneIn({ scenes: [A, B], cueTimes: { x: 10, y: 15 } }, 'a', -100);
    expect(moved.cueTimes).toEqual({ x: 0, y: 5 });
  });

  it('does not accumulate float noise', () => {
    const moved = moveSceneIn({ scenes: [scene('a', 0.1, 1)], cueTimes: { x: 0.2 } }, 'a', 0.1);
    expect(moved.cueTimes.x).toBe(0.3);
    expect(moved.scenes[0].startSec).toBe(0.2);
  });
});

describe('resizing a scene', () => {
  it('stops at neighbours and at the minimum length', () => {
    expect(clampSceneRange([A, B], 'a', 10, 100)).toEqual({ startSec: 10, endSec: 30 });
    expect(clampSceneRange([A, B], 'b', 5, 40)).toEqual({ startSec: 20, endSec: 40 });
    expect(clampSceneRange([A, B], 'a', 19.5, 20)).toEqual({ startSec: 19, endSec: 20 });
    expect(clampSceneRange([A, B], 'a', 10, 5)).toEqual({ startSec: 4, endSec: 5 });
  });

  it('finds the empty stretch to draw in', () => {
    expect(sceneGap([A, B], 25)).toEqual({ lo: 20, hi: 30 });
    expect(sceneGap([A, B], 5)).toEqual({ lo: 0, hi: 10 });
    expect(sceneGap([A, B], 50)).toEqual({ lo: 40, hi: Infinity });
  });
});

describe('a scene from selected cues', () => {
  const show = (scenes: Scene[] = []): Show => ({
    ...createEmptyShow(),
    scenes,
    cueTimes: { a: 10, b: 15, c: 16, d: 50 },
  });
  const timing = (endSec: number, addressId = 'b') =>
    ({ effects: [{ addressId, endSec }] }) as unknown as ReturnType<typeof computeTiming>;

  it("wraps the cues and their effects, stopping at the next cue", () => {
    expect(sceneRangeForCues(show(), timing(12), ['a', 'b'])).toEqual({ startSec: 10, endSec: 16 });
    expect(sceneRangeForCues(show(), timing(30), ['c'])).toEqual({ startSec: 16, endSec: 17 });
    expect(sceneRangeForCues(show(), timing(30, 'c'), ['c'])).toEqual({ startSec: 16, endSec: 30 });
  });

  it('stops at the next scene', () => {
    expect(sceneRangeForCues(show([scene('n', 20, 25)]), timing(30, 'c'), ['c'])).toEqual({ startSec: 16, endSec: 20 });
  });

  it('refuses a range that overlaps a scene or spans one', () => {
    expect(sceneRangeForCues(show([scene('n', 14, 20)]), timing(0), ['b'])).toBeNull();
    expect(sceneRangeForCues(show([scene('n', 20, 25)]), timing(0), ['a', 'd'])).toBeNull();
  });

  it('needs at least one timed cue', () => {
    expect(sceneRangeForCues(show(), timing(0), [])).toBeNull();
    expect(sceneRangeForCues(show(), timing(0), ['unscheduled'])).toBeNull();
  });
});

describe('new scene defaults', () => {
  it('avoids names and colors already in use', () => {
    expect(nextSceneName([])).toBe('Scene 1');
    expect(nextSceneName([{ ...A, name: 'Scene 2' }])).toBe('Scene 3');
    const first = nextSceneColor([]);
    expect(nextSceneColor([{ ...A, color: first }])).not.toBe(first);
  });
});

describe('scene headings in cue lists', () => {
  const cues = [10, 15, 25, 30, null].map((time) => ({ time }));

  it('marks entering a scene, leaving one, and nothing in between', () => {
    expect(sceneChangeAt([A, B], cues, 0)).toBe(A);
    expect(sceneChangeAt([A, B], cues, 1)).toBeUndefined();
    expect(sceneChangeAt([A, B], cues, 2)).toBeNull();
    expect(sceneChangeAt([A, B], cues, 3)).toBe(B);
    expect(sceneChangeAt([A, B], cues, 4)).toBeNull();
  });

  it('shows no heading before a first cue that is not in a scene', () => {
    expect(sceneChangeAt([B], cues, 0)).toBeUndefined();
  });
});

describe('scenes in show files and exports', () => {
  it('loads older files without scenes', () => {
    const old: Partial<Show> = createEmptyShow();
    delete old.scenes;
    expect(parseShow(old).scenes).toEqual([]);
  });

  it('round-trips scenes', () => {
    const s = { ...createEmptyShow(), scenes: [A] };
    expect(parseShow(JSON.parse(JSON.stringify(s))).scenes).toEqual([A]);
  });

  it('adds a Scene column to the cue sheet', () => {
    const demo = createDemoShow();
    const rows = cueRows(demo, computeTiming(demo));
    const col = rows[0].indexOf('Scene');
    const cueCol = rows[0].indexOf('Cue');
    expect(rows.find((r) => r[cueCol] === 'Cue 1 (1-1)')?.[col]).toBe('Opening');
    expect(rows.find((r) => r[cueCol] === 'Cue 5 (2-1)')?.[col]).toBe('Finale');
  });

  it('gives every demo cue a scene, and the scenes do not overlap', () => {
    const demo = createDemoShow();
    for (const t of Object.values(demo.cueTimes)) expect(sceneAt(demo.scenes, t)).not.toBeNull();
    const sorted = [...demo.scenes].sort((a, b) => a.startSec - b.startSec);
    sorted.slice(1).forEach((s, i) => expect(s.startSec).toBeGreaterThanOrEqual(sorted[i].endSec));
  });
});
