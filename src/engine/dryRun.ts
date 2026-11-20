import { districtChangeBefore, type CalloutCue } from './callouts';

/** Show-clock times at which the operator tapped Fire and Switched during a dry run. */
export interface DryRunLog {
  presses: number[];
  switches: number[];
}

export const EMPTY_DRY_RUN: DryRunLog = { presses: [], switches: [] };

export interface DryRunCue {
  addressId: string;
  label: string;
  time: number;
  pressedAt: number | null;
  /** Seconds late (negative = early), null when not pressed. */
  offset: number | null;
}

export interface DryRunSwitch {
  /** The cue the switch is for. */
  addressId: string;
  label: string;
  districtLabel: string;
  /** Seconds between the cue before and this cue: the time there is to switch. */
  window: number;
  switchedAt: number | null;
  /** Seconds from switching to pressing the cue (or to its time, when not pressed). */
  margin: number | null;
  /** Not switched, or switched after the cue was due or pressed. */
  late: boolean;
}

export interface DryRunResult {
  cues: DryRunCue[];
  switches: DryRunSwitch[];
  /** Cues unpressed MISS_GRACE_SEC after their time. */
  missed: number;
  /** Fire taps that didn't match a cue (more than EARLY_SEC before any unpressed cue). */
  extraPresses: number;
  /** Mean of |offset| over pressed cues, null when none. */
  meanAbsOffset: number | null;
  /** The latest press, null when none was late. */
  worstLate: DryRunCue | null;
}

/** A tap more than this many seconds before a cue doesn't count for it. */
const EARLY_SEC = 3;
/** A press later than this counts as pressing early for a later cue, when one is closer. */
const LATE_SEC = 15;
/** A cue pressed this late (seconds) is flagged. */
export const LATE_FLAG_SEC = 0.5;
/** A cue still unpressed this many seconds after its time counts as missed. */
export const MISS_GRACE_SEC = 2;

/**
 * Score a dry run up to show time `upTo` (cues after it haven't come up yet, so they aren't
 * missed). `cues` are sorted by time. Each tap goes to the unpressed cue nearest in time, so a
 * skipped cue doesn't shift every later press onto the wrong cue.
 */
export function scoreDryRun(cues: CalloutCue[], log: DryRunLog, upTo: number): DryRunResult {
  const due = cues.filter((c) => c.time <= upTo + EARLY_SEC);
  const pressedAt = new Map<string, number>();
  let extraPresses = 0;
  for (const p of [...log.presses].sort((a, b) => a - b)) {
    let best: CalloutCue | null = null;
    for (const c of due) {
      if (pressedAt.has(c.addressId) || c.time > p + EARLY_SEC || c.time < p - LATE_SEC) continue;
      if (!best || Math.abs(c.time - p) < Math.abs(best.time - p)) best = c;
    }
    if (best) pressedAt.set(best.addressId, p);
    else extraPresses++;
  }

  const scored: DryRunCue[] = cues
    .filter((c) => c.time <= upTo || pressedAt.has(c.addressId))
    .map((c) => {
      const at = pressedAt.get(c.addressId) ?? null;
      return {
        addressId: c.addressId,
        label: c.label,
        time: c.time,
        pressedAt: at,
        offset: at === null ? null : at - c.time,
      };
    });

  // Switches go, in order, to the district changes they can belong to: after the cue before
  // the change (a little early is fine) and no later than LATE_SEC past the cue that needs it.
  const switches: DryRunSwitch[] = [];
  const taps = [...log.switches].sort((a, b) => a - b);
  let tap = 0;
  cues.forEach((c, i) => {
    const change = districtChangeBefore(cues, i);
    if (!change || change.start || c.time > upTo) return;
    const prev = cues[i - 1];
    while (tap < taps.length && taps[tap] < prev.time - EARLY_SEC) tap++;
    const switchedAt = tap < taps.length && taps[tap] <= c.time + LATE_SEC ? taps[tap++] : null;
    const firedAt = pressedAt.get(c.addressId) ?? c.time;
    switches.push({
      addressId: c.addressId,
      label: c.label,
      districtLabel: change.district.label,
      window: c.time - prev.time,
      switchedAt,
      margin: switchedAt === null ? null : firedAt - switchedAt,
      late: switchedAt === null || switchedAt > firedAt,
    });
  });

  const pressed = scored.filter((c) => c.offset !== null);
  const worst = pressed.reduce<DryRunCue | null>(
    (w, c) => (!w || c.offset! > w.offset! ? c : w),
    null,
  );
  return {
    cues: scored,
    switches,
    missed: scored.filter((c) => c.pressedAt === null && c.time + MISS_GRACE_SEC < upTo).length,
    extraPresses,
    meanAbsOffset: pressed.length
      ? pressed.reduce((s, c) => s + Math.abs(c.offset!), 0) / pressed.length
      : null,
    worstLate: worst && worst.offset! > 0 ? worst : null,
  };
}
