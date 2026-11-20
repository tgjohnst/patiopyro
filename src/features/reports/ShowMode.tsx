import clsx from 'clsx';
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Button, Select } from '../../components/ui';
import { calloutsBetween } from '../../engine/callouts';
import { buildCueList, type CueEntry } from '../../engine/cues';
import { EMPTY_DRY_RUN, LATE_FLAG_SEC, MISS_GRACE_SEC, scoreDryRun, type DryRunLog } from '../../engine/dryRun';
import { sceneAt, sceneChangeAt } from '../../engine/scenes';
import { hasSweepMarks } from '../../engine/sweep';
import type { EffectTiming } from '../../engine/timing';
import { formatTime, parseTime } from '../../lib/format';
import { playCallouts, stopSpeech, unlockSound, type SoundMode } from '../../lib/sound';
import { useWakeLock } from '../../lib/wakeLock';
import { districtColor, parseAddress, type District } from '../../model/addressing';
import type { Position, Scene } from '../../model/schema';
import { toggleDud, toggleMisfire } from '../../store/actions';
import { useDerived, useShow } from '../../store/showStore';
import { useUi } from '../../store/uiStore';
import { DryRunResults } from './DryRunResults';

const LEAD_IN = 10;
/** Pressing previous cue within this many seconds of a cue goes to the one before it. */
const PREV_GRACE = 1.5;
/** Show mode only runs cues that have a fire time. */
type TimedCue = CueEntry & { time: number };

/** The number printed on the remote's button for a cue. */
function cueNumber(c: CueEntry) {
  const p = parseAddress(c.addressId);
  if (!p) return c.label;
  return String(p.kind === 'module' ? p.pin : p.cue);
}

const effectName = (e: EffectTiming) => `${e.name}${e.tubeIndex !== null ? ` · tube ${e.tubeIndex + 1}` : ''}`;

export function ShowMode() {
  const show = useShow((s) => s);
  const { timing } = useDerived();
  const setShowMode = useUi((u) => u.setShowMode);
  const setPrintView = useUi((u) => u.setPrintView);
  const sound = useUi((u) => u.showSound);
  const setSound = useUi((u) => u.setShowSound);
  const wake = useWakeLock();
  const cues = useMemo(
    () => buildCueList(show, timing).filter((c): c is TimedCue => c.time !== null),
    [show, timing],
  );
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(-LEAD_IN);
  const [editingTime, setEditingTime] = useState(false);
  /** Practice run: taps are scored against the plan and nothing can be marked as not going off. */
  const [dryRun, setDryRun] = useState(false);
  const [log, setLog] = useState<DryRunLog>(EMPTY_DRY_RUN);
  /** The clock: `from` seconds at `at` (performance.now), advancing while running. */
  const clock = useRef({ at: 0, from: -LEAD_IN, running: false });
  /** Clock time callouts were last checked at; seeks move it without calling anything out. */
  const calledTo = useRef(-LEAD_IN);
  const listRef = useRef<HTMLOListElement>(null);
  const end = Math.max(timing.showEndSec, cues[cues.length - 1]?.time ?? 0, 1);

  const read = useCallback(() => {
    const c = clock.current;
    return c.running ? c.from + (performance.now() - c.at) / 1000 : c.from;
  }, []);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = () => {
      const t = read();
      playCallouts(calloutsBetween(cues, calledTo.current, t), sound);
      calledTo.current = t;
      setElapsed(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, read, cues, sound]);

  useEffect(() => stopSpeech, []);

  const play = useCallback(
    (on: boolean) => {
      const t = read();
      clock.current = { at: performance.now(), from: t, running: on };
      calledTo.current = t;
      if (on) unlockSound(sound);
      else stopSpeech();
      setElapsed(t);
      setRunning(on);
    },
    [read, sound],
  );

  /** Set the clock to an exact time (kept within the lead-in and show end), whether running or paused. */
  const seek = useCallback(
    (t: number) => {
      const to = Math.min(Math.max(t, -LEAD_IN), end);
      clock.current = { ...clock.current, at: performance.now(), from: to };
      calledTo.current = to;
      // Going back in a dry run practises that part again: drop the taps after it.
      setLog((l) => ({ presses: l.presses.filter((p) => p <= to), switches: l.switches.filter((p) => p <= to) }));
      setElapsed(to);
    },
    [end],
  );

  const adjust = useCallback((d: number) => seek(read() + d), [seek, read]);

  /** Back to the start of the current cue; if that was just now, to the cue before it. */
  const prevCue = useCallback(() => {
    const t = read();
    const before = cues.filter((c) => c.time <= t);
    const last = before[before.length - 1];
    if (last && t - last.time > PREV_GRACE) seek(last.time);
    else seek(before[before.length - 2]?.time ?? -LEAD_IN);
  }, [cues, read, seek]);

  const nextCue = useCallback(() => {
    const t = read();
    const n = cues.find((c) => c.time > t);
    if (n) seek(n.time);
  }, [cues, read, seek]);

  const reset = useCallback(() => {
    play(false);
    seek(-LEAD_IN);
  }, [play, seek]);

  const toggleDryRun = () => {
    reset();
    setLog(EMPTY_DRY_RUN);
    setDryRun((v) => !v);
  };
  /** Dry run taps, at the clock time they happen. */
  const tapFire = useCallback(() => setLog((l) => ({ ...l, presses: [...l.presses, read()] })), [read]);
  const tapSwitch = useCallback(() => setLog((l) => ({ ...l, switches: [...l.switches, read()] })), [read]);

  const nextIdx = cues.findIndex((c) => c.time > elapsed);
  const next = nextIdx >= 0 ? cues[nextIdx] : null;
  const current = nextIdx === -1 ? cues[cues.length - 1] : cues[nextIdx - 1];
  const countdown = next ? next.time - elapsed : null;
  const misfires = new Set(show.sweep.misfires);
  const duds = new Set(show.sweep.duds);
  const score = useMemo(() => (dryRun ? scoreDryRun(cues, log, elapsed) : null), [dryRun, cues, log, elapsed]);
  const offsets = new Map(score?.cues.map((c) => [c.addressId, c]) ?? []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // Typing a time: the box handles its own keys.
      if (el?.closest('input, textarea, select')) return;
      const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      if (e.key === 'Escape') setShowMode(false);
      else if (e.code === 'Space') {
        e.preventDefault();
        // Keep a focused button from also clicking when Space is released.
        if (el instanceof HTMLButtonElement) el.blur();
        play(!clock.current.running);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        adjust(-step);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        adjust(step);
      } else if (e.key === 'n' || e.key === 'N' || e.key === 'PageDown') {
        e.preventDefault();
        nextCue();
      } else if (e.key === 'p' || e.key === 'P' || e.key === 'PageUp') {
        e.preventDefault();
        prevCue();
      } else if (e.key === 'Home') {
        e.preventDefault();
        seek(-LEAD_IN);
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        setEditingTime(true);
      } else if (dryRun && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        tapFire();
      } else if (dryRun && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        tapSwitch();
      } else if (!dryRun && current && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        toggleMisfire(current.addressId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setShowMode, adjust, seek, play, nextCue, prevCue, dryRun, tapFire, tapSwitch, current]);

  // Keep the upcoming cue visible in the list.
  useEffect(() => {
    listRef.current?.querySelector(`[data-cue-idx="${nextIdx}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [nextIdx]);

  const posNames = (ids: string[]) => ids.map((id) => show.positions.find((p) => p.id === id)?.name).join(' + ');
  const hasDistricts = cues.some((c) => c.district);
  const remoteOn = current?.district ?? null;
  const needSwitch = !!next?.district && current?.district?.key !== next.district.key;
  const sceneNow = sceneAt(show.scenes, elapsed);
  const nextScene = next ? sceneAt(show.scenes, next.time) : null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white" data-testid="show-mode">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-6 py-3">
        <span className={clsx('font-bold', dryRun ? 'text-sky-300' : 'text-amber-400')}>
          {dryRun ? 'DRY RUN' : 'SHOW MODE'}
        </span>
        <span className="text-slate-400">{show.meta.name}</span>
        <span
          className={clsx('text-xs', wake === 'on' ? 'text-emerald-400' : 'text-amber-300')}
          title={
            wake === 'on'
              ? 'The screen stays on while Show mode is open.'
              : wake === 'off'
                ? 'The browser would not keep the screen on (battery saver?). Turn off auto-lock for the show.'
                : 'This browser cannot keep the screen on. Turn off auto-lock for the show.'
          }
          data-testid="wake-lock"
        >
          {wake === 'on' ? '☀ Screen stays on' : '☾ Screen may sleep'}
        </span>
        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          Callouts
          <Select
            value={sound}
            onChange={(v) => {
              setSound(v as SoundMode);
              unlockSound(v as SoundMode);
            }}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'beeps', label: 'Beeps' },
              { value: 'voice', label: 'Voice' },
            ]}
            aria-label="Cue callouts"
          />
        </label>
        <Button
          size="sm"
          variant={dryRun ? 'primary' : 'secondary'}
          onClick={toggleDryRun}
          title="Practise the show: tap Fire and Switched as you would on the remote, and see how your timing compares"
        >
          {dryRun ? '✓ Dry run' : 'Dry run'}
        </Button>
        {!dryRun && (
          <Button
            size="sm"
            onClick={() => setPrintView('sweep')}
            title="Print what is still live after the show, by position, rack and tube"
          >
            🧹 Sweep list{hasSweepMarks(show) ? ` (${show.sweep.misfires.length + show.sweep.duds.length} marked)` : ''}
          </Button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button onClick={prevCue} title="Back to the start of this cue; press again for the cue before (P)">
            ⏮ Prev cue (P)
          </Button>
          <Button onClick={() => adjust(-10)} title="Back 10 seconds (Shift+←)">
            −10s
          </Button>
          <Button onClick={() => adjust(-1)} title="Back 1 second (←)">
            −1s
          </Button>
          <Button variant={running ? 'secondary' : 'primary'} onClick={() => play(!running)}>
            {running ? '❚❚ Pause (Space)' : '▶ Start (Space)'}
          </Button>
          <Button onClick={() => adjust(1)} title="Forward 1 second (→)">
            +1s
          </Button>
          <Button onClick={() => adjust(10)} title="Forward 10 seconds (Shift+→)">
            +10s
          </Button>
          <Button onClick={nextCue} disabled={!next} title="Jump the clock to the next cue (N)">
            ⏭ Next cue (N)
          </Button>
          <Button variant="ghost" onClick={reset} title="Stop and go back to the lead-in (Home)">
            Reset
          </Button>
          <Button variant="danger" onClick={() => setShowMode(false)}>
            Exit (Esc)
          </Button>
        </div>
      </div>

      <div className="border-b border-slate-800 px-6 py-2">
        <Scrubber start={-LEAD_IN} end={end} t={elapsed} cues={cues} scenes={show.scenes} onSeek={seek} />
        <div className="mt-1 text-xs text-slate-500">
          Drag or click the bar, or a cue in the list, to jump · ←/→ 1s · Shift 10s · Alt 0.1s · P/N previous/next
          cue · G or click the clock to type a time · Home back to the start ·{' '}
          {dryRun ? 'F fire · S switched district' : 'M last cue didn’t fire'}
        </div>
      </div>

      {dryRun && (
        <div className="flex flex-wrap items-center gap-3 border-b border-sky-900 bg-sky-950/60 px-6 py-2" data-testid="dry-run-bar">
          <span className="text-sm text-sky-100">
            Practice only. Tap <b>Fire</b> each time you would press a remote button
            {hasDistricts && (
              <>
                {' '}
                and <b>Switched</b> when you change district
              </>
            )}
            .
          </span>
          <div className="ml-auto flex gap-2">
            {hasDistricts && (
              <button
                type="button"
                onClick={tapSwitch}
                className="h-12 rounded-lg bg-slate-700 px-5 text-lg font-bold hover:bg-slate-600"
              >
                ↔ Switched (S)
              </button>
            )}
            <button
              type="button"
              onClick={tapFire}
              className="h-12 rounded-lg bg-sky-500 px-8 text-lg font-black text-slate-950 hover:bg-sky-400"
            >
              Fire (F)
            </button>
          </div>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_380px]">
        <div className="flex min-h-0 flex-col items-center gap-4 overflow-y-auto">
          <div className="flex w-full max-w-5xl flex-wrap items-center justify-center gap-6">
            {editingTime ? (
              <TimeEntry
                initial={elapsed}
                onDone={(t) => {
                  if (t !== null) seek(t);
                  setEditingTime(false);
                }}
              />
            ) : (
              <button
                type="button"
                className="rounded-lg px-2 font-mono text-6xl text-slate-300 tabular-nums hover:bg-slate-900"
                onClick={() => setEditingTime(true)}
                title="Click to go to a time (G)"
                data-testid="show-clock"
              >
                {showTime(elapsed)}
              </button>
            )}
            {show.scenes.length > 0 && (
              <div
                className="rounded-2xl border-4 px-5 py-2 text-center"
                style={{ borderColor: sceneNow?.color ?? '#475569' }}
                data-testid="current-scene"
              >
                <div className="text-xs tracking-widest text-slate-400 uppercase">Scene</div>
                <div className="text-3xl font-black">{sceneNow?.name ?? '—'}</div>
              </div>
            )}
            {hasDistricts && <RemoteDistrict district={remoteOn} />}
          </div>

          {next ? (
            <div
              className={clsx(
                'w-full max-w-3xl rounded-3xl border-4 p-6 text-center transition-colors',
                countdown! <= 3 ? 'border-rose-500 bg-rose-950' : countdown! <= 10 ? 'border-amber-400 bg-amber-950/60' : 'border-slate-700 bg-slate-900',
              )}
              data-testid="next-cue"
            >
              <div className="text-lg tracking-widest text-slate-400 uppercase">Next</div>
              <div className="text-6xl font-black">{next.label}</div>
              <div className="mt-1 font-mono text-7xl font-bold tabular-nums">{countdown!.toFixed(1)}</div>
              <div className="mt-2 text-2xl text-slate-200">{posNames(next.positionIds)}</div>
              <div className="text-lg text-slate-400">{[...new Set(next.effects.map((e) => e.name))].join(', ')}</div>
              {next.note && <div className="mt-2 text-2xl font-semibold text-amber-300">{next.note}</div>}
              {nextScene && nextScene.id !== sceneNow?.id && (
                <div className="mt-2 text-2xl font-semibold" data-testid="next-scene">
                  Starts scene: {nextScene.name}
                </div>
              )}
              {next.district &&
                (needSwitch ? (
                  <div
                    className="mt-3 rounded-xl px-4 py-2 text-3xl font-black text-slate-950"
                    style={{ background: districtColor(next.district) }}
                    data-testid="district-callout"
                  >
                    {current ? 'SWITCH TO' : 'START ON'} {next.district.label.toUpperCase()}
                  </div>
                ) : (
                  <div className="mt-3 text-lg font-semibold" style={{ color: districtColor(next.district) }} data-testid="district-callout">
                    Stay on {next.district.label}
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-5xl font-bold text-slate-400">
              {cues.length ? (elapsed >= timing.showEndSec ? 'Show complete' : 'All cues fired') : 'No timed cues'}
            </div>
          )}
          {current && current.time <= elapsed && (
            <div className="flex flex-wrap items-center justify-center gap-3 text-xl text-slate-500">
              <span>
                Last: {current.label} at {formatTime(current.time)}
              </span>
              {!dryRun && (
                <MisfireButton marked={misfires.has(current.addressId)} onClick={() => toggleMisfire(current.addressId)} big />
              )}
            </div>
          )}

          {score && <DryRunResults score={score} hasDistricts={hasDistricts} />}

          {hasDistricts && <DistrictTrack cues={cues} nextIdx={nextIdx} />}

          <div className="w-full max-w-5xl">
            <div className="mb-1 text-xs tracking-widest text-slate-500 uppercase">Going off now</div>
            <NowFiring
              positions={show.positions}
              effects={timing.effects}
              t={elapsed}
              duds={dryRun ? null : duds}
            />
          </div>
        </div>

        <ol ref={listRef} className="min-h-0 overflow-y-auto rounded-xl border border-slate-800" data-testid="show-cue-list">
          {cues.map((c, i) => {
            const past = c.time <= elapsed;
            const color = c.district ? districtColor(c.district) : undefined;
            const switchHere = c.district && cues[i - 1]?.district?.key !== c.district.key;
            const sceneChange = sceneChangeAt(show.scenes, cues, i);
            return (
              <Fragment key={c.addressId}>
                {sceneChange !== undefined && (
                  <li
                    className={clsx('bg-slate-900 px-4 py-1 text-sm font-bold text-slate-100', past && 'opacity-50')}
                    style={sceneChange ? { borderLeft: `8px solid ${sceneChange.color}` } : undefined}
                    data-testid="list-scene"
                  >
                    {sceneChange?.name ?? 'No scene'}
                  </li>
                )}
                {switchHere && (
                  <li
                    className={clsx('border-y bg-slate-950 px-4 py-1 text-xs font-bold tracking-wider uppercase', past && 'opacity-50')}
                    style={{ color, borderColor: color }}
                  >
                    {i === 0 ? 'Start on' : '↔ Switch to'} {c.district!.label}
                    {c.district!.range && <span className="font-normal normal-case"> · {c.district!.range}</span>}
                  </li>
                )}
                <li
                  data-cue-idx={i}
                  className={clsx(
                    'flex cursor-pointer items-baseline gap-3 border-b border-slate-900 px-4 py-2 hover:bg-slate-900',
                    i === nextIdx && 'bg-amber-500/20',
                    past && 'text-slate-600',
                  )}
                  style={color ? { borderLeft: `4px solid ${color}` } : undefined}
                  onClick={() => seek(c.time)}
                  title={`Jump to ${c.label} at ${formatTime(c.time)}`}
                >
                  <span className="w-16 font-mono tabular-nums">{formatTime(c.time)}</span>
                  <span className="font-semibold">{c.label}</span>
                  <span className="truncate text-sm text-slate-500">{posNames(c.positionIds)}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-1.5">
                    {dryRun && <OffsetBadge cue={offsets.get(c.addressId)} now={elapsed} />}
                    {!dryRun && (past || misfires.has(c.addressId)) && (
                      <MisfireButton marked={misfires.has(c.addressId)} onClick={() => toggleMisfire(c.addressId)} />
                    )}
                    {c.district && (
                      <span
                        className={clsx('rounded px-1.5 text-[11px] font-bold text-slate-950', past && 'opacity-50')}
                        style={{ background: color }}
                      >
                        {c.district.short}
                      </span>
                    )}
                  </span>
                </li>
              </Fragment>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

const showTime = (t: number) => (t < 0 ? `T${formatTime(t)}` : formatTime(t));

/** Mark a remote cue that didn't fire, for the sweep list. */
function MisfireButton({ marked, onClick, big }: { marked: boolean; onClick: () => void; big?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // In the cue list the row seeks on click; marking shouldn't move the clock.
        e.stopPropagation();
        onClick();
      }}
      className={clsx(
        'rounded font-semibold whitespace-nowrap',
        big ? 'px-3 py-1 text-base' : 'px-1.5 text-[11px]',
        marked ? 'bg-rose-600 text-white' : 'border border-slate-700 text-slate-400 hover:border-rose-500 hover:text-rose-300',
      )}
      title={marked ? 'Marked: this cue didn’t fire. Click to unmark.' : 'Mark this cue as not fired (misfire)'}
      aria-pressed={marked}
    >
      {marked ? '✗ Didn’t fire' : big ? 'Didn’t fire? (M)' : 'Didn’t fire?'}
    </button>
  );
}

/** How far off a dry-run press was: early, on time, late, or missed. */
function OffsetBadge({ cue, now }: { cue: { offset: number | null; time: number } | undefined; now: number }) {
  if (!cue) return null;
  if (cue.offset === null) {
    return cue.time + MISS_GRACE_SEC < now ? (
      <span className="rounded bg-rose-600 px-1.5 text-[11px] font-bold text-white">Missed</span>
    ) : null;
  }
  const late = cue.offset > LATE_FLAG_SEC;
  return (
    <span
      className={clsx('rounded px-1.5 font-mono text-[11px] tabular-nums', late ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-200')}
      data-testid="dry-offset"
    >
      {cue.offset >= 0 ? '+' : '−'}
      {Math.abs(cue.offset).toFixed(1)}s
    </span>
  );
}

/** The clock turned into a box: type a time and press Enter to go there, Esc to cancel. */
function TimeEntry({ initial, onDone }: { initial: number; onDone: (t: number | null) => void }) {
  const [text, setText] = useState(() => showTime(initial));
  const [bad, setBad] = useState(false);
  return (
    <input
      autoFocus
      onFocus={(e) => e.target.select()}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        setBad(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          const t = parseTime(text);
          if (t === null) setBad(true);
          else onDone(t);
        } else if (e.key === 'Escape') {
          // Cancel the entry without leaving show mode.
          e.stopPropagation();
          onDone(null);
        }
      }}
      onBlur={() => onDone(null)}
      aria-label="Go to time"
      aria-invalid={bad}
      placeholder="m:ss"
      className={clsx(
        'w-72 rounded-lg border-2 bg-slate-950 px-2 font-mono text-6xl text-white tabular-nums outline-none',
        bad ? 'border-rose-500' : 'border-amber-400',
      )}
      data-testid="goto-time"
    />
  );
}

/** The whole show as a bar: scene bands, a tick per cue, and the clock. Click or drag to seek. */
function Scrubber({
  start,
  end,
  t,
  cues,
  scenes,
  onSeek,
}: {
  start: number;
  end: number;
  t: number;
  cues: TimedCue[];
  scenes: Scene[];
  onSeek: (t: number) => void;
}) {
  const span = end - start;
  const pct = (sec: number) => `${((Math.min(Math.max(sec, start), end) - start) / span) * 100}%`;
  const seekTo = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(start + (Math.min(Math.max(e.clientX - r.left, 0), r.width) / r.width) * span);
  };
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-right font-mono text-xs text-slate-500 tabular-nums">{showTime(start)}</span>
      <div
        role="slider"
        aria-label="Show time"
        aria-valuemin={start}
        aria-valuemax={end}
        aria-valuenow={Math.round(t * 10) / 10}
        aria-valuetext={showTime(t)}
        className="relative h-9 flex-1 cursor-pointer touch-none rounded-md bg-slate-900 select-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekTo(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) seekTo(e);
        }}
        data-testid="show-scrubber"
      >
        {scenes.map((s) => (
          <div
            key={s.id}
            className="absolute inset-y-0 opacity-30"
            style={{ left: pct(s.startSec), width: `calc(${pct(s.endSec)} - ${pct(s.startSec)})`, background: s.color }}
            title={s.name}
          />
        ))}
        <div className="absolute inset-y-0 left-0 rounded-l-md bg-amber-500/25" style={{ width: pct(t) }} />
        <div className="absolute inset-y-0 w-px bg-slate-500" style={{ left: pct(0) }} title="0:00" />
        {cues.map((c) => (
          <div
            key={c.addressId}
            className={clsx('absolute top-2 bottom-2 w-0.5 -translate-x-1/2', c.time <= t ? 'bg-slate-500' : 'bg-slate-200')}
            style={{ left: pct(c.time), background: c.district && c.time > t ? districtColor(c.district) : undefined }}
          />
        ))}
        <div className="absolute -inset-y-1 w-1 -translate-x-1/2 rounded bg-amber-400" style={{ left: pct(t) }} />
      </div>
      <span className="w-20 font-mono text-xs text-slate-500 tabular-nums">{formatTime(end)}</span>
    </div>
  );
}

function RemoteDistrict({ district }: { district: District | null }) {
  const color = district ? districtColor(district) : '#475569';
  return (
    <div className="rounded-2xl border-4 px-5 py-2 text-center" style={{ borderColor: color }} data-testid="remote-district">
      <div className="text-xs tracking-widest text-slate-400 uppercase">Remote on</div>
      <div className="text-3xl font-black" style={{ color }}>
        {district?.label ?? '—'}
      </div>
    </div>
  );
}

/** Cues in firing order, grouped into runs that share a district. Each new group is a switch. */
function DistrictTrack({ cues, nextIdx }: { cues: TimedCue[]; nextIdx: number }) {
  const runs: { district: District; cues: { cue: TimedCue; idx: number }[] }[] = [];
  cues.forEach((cue, idx) => {
    if (!cue.district) return;
    const last = runs[runs.length - 1];
    if (last?.district.key === cue.district.key) last.cues.push({ cue, idx });
    else runs.push({ district: cue.district, cues: [{ cue, idx }] });
  });

  return (
    <div className="w-full max-w-5xl" data-testid="district-track">
      <div className="mb-1 text-xs tracking-widest text-slate-500 uppercase">Districts in firing order</div>
      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {runs.map((run, n) => {
          const color = districtColor(run.district);
          const active = run.cues.some(({ idx }) => idx === nextIdx);
          const done = nextIdx === -1 || run.cues.every(({ idx }) => idx < nextIdx);
          return (
            <Fragment key={n}>
              {n > 0 && <div className="flex items-center px-0.5 text-slate-500">→</div>}
              <div
                className={clsx('shrink-0 rounded-lg border-2 px-2 py-1', done && !active && 'opacity-35')}
                style={{ borderColor: color, background: active ? `${color}33` : undefined }}
              >
                <div className="text-xs font-bold whitespace-nowrap" style={{ color }}>
                  {run.district.label}
                </div>
                <div className="mt-0.5 flex gap-1">
                  {run.cues.map(({ cue, idx }) => (
                    <span
                      key={cue.addressId}
                      className={clsx(
                        'rounded px-1.5 py-0.5 font-mono text-xs whitespace-nowrap tabular-nums',
                        idx === nextIdx ? 'bg-white text-black' : 'bg-slate-800 text-slate-300',
                      )}
                      title={`${cue.label} at ${formatTime(cue.time)}`}
                    >
                      {cueNumber(cue)}
                    </span>
                  ))}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

const MAX_LIT = 3;

/** What is bursting at each position right now, plus fuse that is burning toward an effect. */
function NowFiring({
  positions,
  effects,
  t,
  duds,
}: {
  positions: Position[];
  effects: EffectTiming[];
  t: number;
  /** Effects marked as duds; null in a dry run, where nothing can be marked. */
  duds: Set<string> | null;
}) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, positions.length)}, minmax(0, 1fr))` }}
      data-testid="now-firing"
    >
      {positions.map((p) => {
        const here = effects.filter((e) => e.positionId === p.id);
        const firing = here.filter((e) => e.startSec <= t && t < e.endSec);
        const lit = here.filter((e) => e.igniteSec <= t && t < e.startSec);
        return (
          <div
            key={p.id}
            className={clsx('min-h-28 rounded-xl border bg-slate-950 p-2', firing.length ? 'border-transparent' : 'border-slate-800')}
            style={firing.length ? { boxShadow: `inset 0 0 0 2px ${p.color}` } : undefined}
            data-testid={`now-${p.name}`}
          >
            <div className="mb-1 flex items-center gap-2 text-sm font-bold">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className="truncate">{p.name}</span>
              {firing.length > 0 && (
                <span className="ml-auto rounded bg-rose-600 px-1.5 text-[10px] tracking-wider text-white uppercase">Firing</span>
              )}
            </div>
            {firing.length === 0 && lit.length === 0 && <div className="text-sm text-slate-600">—</div>}
            <ul className="flex flex-col gap-1.5">
              {firing.map((e) => {
                const sections = e.sections.filter((s) => s.startSec <= t && t < s.endSec);
                const pct = ((t - e.startSec) / Math.max(0.001, e.endSec - e.startSec)) * 100;
                return (
                  <li key={e.key}>
                    <div className="flex items-baseline gap-2">
                      <span className={clsx('truncate font-semibold', duds?.has(e.key) ? 'text-rose-300 line-through' : 'text-white')}>
                        {effectName(e)}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-xs text-slate-400 tabular-nums">
                        {Math.ceil(e.endSec - t)}s
                      </span>
                      {duds && <DudButton marked={duds.has(e.key)} onClick={() => toggleDud(e.key)} />}
                    </div>
                    {sections.length > 0 && (
                      <div className="truncate text-xs text-amber-300">↳ {sections.map((s) => s.name).join(' + ')}</div>
                    )}
                    <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-slate-800">
                      <div className="h-full" style={{ width: `${pct}%`, background: p.color }} />
                    </div>
                  </li>
                );
              })}
              {lit.slice(0, MAX_LIT).map((e) => (
                <li key={e.key} className="flex items-center gap-2 text-xs text-slate-500">
                  <span className={clsx('truncate', duds?.has(e.key) && 'text-rose-300 line-through')}>
                    Fuse lit: {effectName(e)} in {(e.startSec - t).toFixed(1)}s
                  </span>
                  {duds && <DudButton marked={duds.has(e.key)} onClick={() => toggleDud(e.key)} />}
                </li>
              ))}
              {lit.length > MAX_LIT && <li className="text-xs text-slate-600">+{lit.length - MAX_LIT} more lit</li>}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Mark an effect that was lit but didn't go off, for the sweep list. */
function DudButton({ marked, onClick }: { marked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'ml-auto shrink-0 rounded px-2 py-0.5 text-xs font-semibold',
        marked ? 'bg-rose-600 text-white' : 'border border-slate-700 text-slate-300 hover:border-rose-500 hover:text-rose-300',
      )}
      title={marked ? 'Marked as a dud. Click to unmark.' : 'Mark as a dud: lit but didn’t go off'}
      aria-pressed={marked}
    >
      {marked ? '✗ Dud' : 'Dud'}
    </button>
  );
}
