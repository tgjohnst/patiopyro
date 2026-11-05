import { SCENE_COLORS } from '../model/presets';
import type { Scene, Show } from '../model/schema';
import type { CueEntry } from './cues';
import type { TimingResult } from './timing';

/** Shortest scene you can draw or resize to. */
export const MIN_SCENE_SEC = 1;

type SceneRange = Pick<Scene, 'startSec' | 'endSec'>;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const toMs = (t: number) => Math.round(t * 1000) / 1000;

/** The scene a time falls in. A scene owns its start but not its end, so neighbours can touch. */
export function sceneAt(scenes: Scene[], t: number | null): Scene | null {
  if (t === null) return null;
  return scenes.find((s) => s.startSec <= t && t < s.endSec) ?? null;
}

/** The empty stretch of timeline around `t`, bounded by the scenes either side. */
export function sceneGap(scenes: Scene[], t: number) {
  let lo = 0;
  let hi = Infinity;
  for (const s of scenes) {
    if (s.endSec <= t) lo = Math.max(lo, s.endSec);
    else if (s.startSec >= t) hi = Math.min(hi, s.startSec);
  }
  return { lo, hi };
}

function neighbourBounds(scenes: Scene[], scene: Scene) {
  let lo = 0;
  let hi = Infinity;
  for (const s of scenes) {
    if (s.id === scene.id) continue;
    if (s.startSec < scene.startSec) lo = Math.max(lo, s.endSec);
    else hi = Math.min(hi, s.startSec);
  }
  return { lo, hi };
}

/** Fit a new range for a scene between its neighbours, keeping it at least MIN_SCENE_SEC long. */
export function clampSceneRange(scenes: Scene[], id: string, startSec: number, endSec: number): SceneRange {
  const scene = scenes.find((s) => s.id === id);
  if (!scene) return { startSec, endSec };
  const { lo, hi } = neighbourBounds(scenes, scene);
  const start = clamp(startSec, lo, Math.max(lo, endSec - MIN_SCENE_SEC));
  return { startSec: start, endSec: clamp(endSec, start + MIN_SCENE_SEC, Math.max(start + MIN_SCENE_SEC, hi)) };
}

/** The part of `dt` a scene can move before it hits a neighbour or the start of the show. */
export function clampSceneMove(scenes: Scene[], id: string, dt: number): number {
  const scene = scenes.find((s) => s.id === id);
  if (!scene) return 0;
  const { lo, hi } = neighbourBounds(scenes, scene);
  return clamp(dt, lo - scene.startSec, hi - scene.endSec);
}

/** Move a scene and every cue inside it by `dt`, stopping at neighbouring scenes. */
export function moveSceneIn(show: Pick<Show, 'scenes' | 'cueTimes'>, id: string, dt: number) {
  const scene = show.scenes.find((s) => s.id === id);
  const d = clampSceneMove(show.scenes, id, dt);
  if (!scene || d === 0) return { scenes: show.scenes, cueTimes: show.cueTimes };
  const cueTimes = { ...show.cueTimes };
  for (const [addr, t] of Object.entries(cueTimes)) {
    if (sceneAt([scene], t)) cueTimes[addr] = toMs(t + d);
  }
  const scenes = show.scenes.map((s) =>
    s.id === id ? { ...s, startSec: toMs(s.startSec + d), endSec: toMs(s.endSec + d) } : s,
  );
  return { scenes, cueTimes };
}

/**
 * A range wrapping the given cues and their effects, without reaching the next cue or scene.
 * Null when there are no timed cues or the range would overlap an existing scene.
 */
export function sceneRangeForCues(show: Show, timing: TimingResult, addrs: string[]): SceneRange | null {
  const times = addrs.map((a) => show.cueTimes[a]).filter((t) => t !== undefined);
  if (!times.length) return null;
  const startSec = Math.min(...times);
  const last = Math.max(...times);
  if (show.scenes.some((s) => s.startSec <= last && startSec < s.endSec)) return null;

  const effectEnd = timing.effects
    .filter((e) => addrs.includes(e.addressId))
    .reduce((m, e) => Math.max(m, e.endSec), 0);
  const limit = Math.min(
    ...Object.values(show.cueTimes).filter((t) => t > last),
    ...show.scenes.filter((s) => s.startSec > last).map((s) => s.startSec),
  );
  return { startSec, endSec: Math.min(limit, Math.max(effectEnd, last + MIN_SCENE_SEC)) };
}

export function nextSceneName(scenes: Scene[]) {
  const used = new Set(scenes.map((s) => s.name));
  let n = scenes.length + 1;
  while (used.has(`Scene ${n}`)) n++;
  return `Scene ${n}`;
}

export function nextSceneColor(scenes: Scene[]) {
  const used = new Set(scenes.map((s) => s.color));
  return SCENE_COLORS.find((c) => !used.has(c)) ?? SCENE_COLORS[scenes.length % SCENE_COLORS.length];
}

/**
 * For a heading above cue `i` in a time-sorted cue list: what the operator is entering there.
 * Undefined means no change; `null` means the cue has left a scene and isn't in another.
 */
export function sceneChangeAt(scenes: Scene[], cues: Pick<CueEntry, 'time'>[], i: number): Scene | null | undefined {
  const scene = sceneAt(scenes, cues[i].time);
  const prior = i > 0 ? sceneAt(scenes, cues[i - 1].time) : null;
  return scene?.id === prior?.id ? undefined : scene;
}
