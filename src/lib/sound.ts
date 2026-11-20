import type { Callout } from '../engine/callouts';

/** How Show mode calls out cues: not at all, with beeps, or spoken with a beep on each cue. */
export type SoundMode = 'off' | 'beeps' | 'voice';

let ctx: AudioContext | null = null;

/**
 * Browsers only start audio and speech from a user gesture, so call this from a click or key
 * press (Start, or choosing a sound mode) before callouts are needed.
 */
export function unlockSound(mode: SoundMode) {
  if (mode === 'off') return;
  ctx ??= new AudioContext();
  void ctx.resume();
  if (mode === 'voice' && 'speechSynthesis' in window) {
    // Speaking once from a gesture lets later utterances play on iOS.
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  }
}

function tone(freq: number, startIn: number, dur: number) {
  if (!ctx) return;
  const t0 = ctx.currentTime + startIn;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  // Short ramps at each end, so the beep doesn't click.
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.3, t0 + 0.01);
  gain.gain.setValueAtTime(0.3, t0 + dur - 0.02);
  gain.gain.linearRampToValueAtTime(0, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur);
}

const BEEPS: Record<Callout['kind'], [freq: number, startIn: number, dur: number][]> = {
  warn: [[440, 0, 0.25]],
  count: [[880, 0, 0.12]],
  go: [[1320, 0, 0.5]],
  // Two rising pairs, unlike anything else, so a district switch can't be missed.
  switch: [
    [660, 0, 0.12],
    [990, 0.15, 0.12],
    [660, 0.35, 0.12],
    [990, 0.5, 0.12],
  ],
};

function speak(text: string, first: boolean) {
  if (!('speechSynthesis' in window)) return;
  // Drop anything still queued, so the countdown is never behind the clock.
  if (first) window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.1;
  window.speechSynthesis.speak(u);
}

/** Play one clock tick's callouts. Voice speaks everything but the cue itself, which beeps on time. */
export function playCallouts(callouts: Callout[], mode: SoundMode) {
  if (mode === 'off' || callouts.length === 0) return;
  let spoken = 0;
  for (const c of callouts) {
    if (mode === 'beeps' || c.kind === 'go' || c.kind === 'switch') {
      for (const [f, at, dur] of BEEPS[c.kind]) tone(f, at, dur);
    }
    if (mode === 'voice' && c.kind !== 'go') speak(c.text, spoken++ === 0);
  }
}

/** Stop speech when leaving Show mode or pausing. */
export function stopSpeech() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
