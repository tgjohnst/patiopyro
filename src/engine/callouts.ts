import type { District } from '../model/addressing';

/** A timed cue as Show mode runs it. */
export interface CalloutCue {
  addressId: string;
  label: string;
  time: number;
  district: District | null;
}

/**
 * Something to tell the operator: `warn` that a cue is coming (10 s out, or as soon as the cue
 * before it fires when they are closer), `count` 3-2-1, `go` at the cue time, and `switch` the
 * remote's district right after the cue before a district change fires.
 */
export type Callout =
  | { kind: 'warn'; text: string }
  | { kind: 'count'; n: number; text: string }
  | { kind: 'go'; text: string }
  | { kind: 'switch'; text: string };

export const WARN_SEC = 10;
const COUNTS = [3, 2, 1];
/** Clock jumps longer than this are seeks or a paused tab, not playback: they call nothing out. */
const MAX_STEP_SEC = 1;
const SAME_TIME = 1e-6;

/** A cue label read aloud: "Cue 13 (2-1)" → "Cue 13", "Ch 2 · Cue 3" → "Channel 2, cue 3". */
export function spokenCue(label: string): string {
  return label
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\bCh (\d+)/g, 'Channel $1')
    .replace(/\s*·\s*Cue/g, ', cue')
    .replace(/\s*·\s*/g, ', ');
}

/** The district change the operator makes before cue `i` fires, if any. */
export function districtChangeBefore(
  cues: CalloutCue[],
  i: number,
): { district: District; start: boolean } | null {
  const d = cues[i]?.district;
  if (!d) return null;
  const prev = cues[i - 1];
  if (!prev) return { district: d, start: true };
  return prev.district?.key === d.key ? null : { district: d, start: false };
}

/** Cues firing together with cue `i` (same time), `i` first. */
function together(cues: CalloutCue[], i: number): CalloutCue[] {
  const out = [cues[i]];
  for (let j = i + 1; j < cues.length && cues[j].time - cues[i].time < SAME_TIME; j++)
    out.push(cues[j]);
  return out;
}

function warnText(cues: CalloutCue[], i: number, inSec: number, withDistrict = true): string {
  const names = together(cues, i).map((c) => spokenCue(c.label));
  const change = withDistrict ? districtChangeBefore(cues, i) : null;
  const district = change
    ? `. ${change.start ? 'Start on' : 'Switch to'} ${change.district.label}`
    : '';
  return `${names.join(' and ')} in ${inSec}${district}`;
}

/**
 * What to call out as the show clock plays from `from` to `to` (seconds, `cues` sorted by time).
 * Each callout is due at a moment in (from, to], so ticking the clock calls each out once.
 */
export function calloutsBetween(cues: CalloutCue[], from: number, to: number): Callout[] {
  if (!(to > from) || to - from > MAX_STEP_SEC) return [];
  const out: Callout[] = [];
  const crossed = (t: number) => from < t && t <= to;

  const fired = cues.filter((c) => crossed(c.time));
  if (fired.length) out.push({ kind: 'go', text: 'Go' });

  const n = cues.findIndex((c) => c.time > to);
  if (n === -1) return out;
  const next = cues[n];

  if (fired.length) {
    // The cue before the next one just fired: the operator has until the next cue to get ready.
    const change = districtChangeBefore(cues, n);
    if (change && !change.start)
      out.push({ kind: 'switch', text: `Switch to ${change.district.label}` });
    const wait = Math.round(next.time - to);
    // Its 10 s warning came while another cue was next, so give it now.
    if (next.time - to < WARN_SEC && wait > COUNTS[0]) {
      out.push({ kind: 'warn', text: warnText(cues, n, wait, !change || change.start) });
    }
  }
  if (crossed(next.time - WARN_SEC)) out.push({ kind: 'warn', text: warnText(cues, n, WARN_SEC) });
  for (const k of COUNTS) {
    if (crossed(next.time - k)) out.push({ kind: 'count', n: k, text: String(k) });
  }
  return out;
}
