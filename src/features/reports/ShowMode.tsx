import clsx from 'clsx';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/ui';
import { buildCueList, type CueEntry } from '../../engine/cues';
import type { EffectTiming } from '../../engine/timing';
import { formatTime } from '../../lib/format';
import { districtColor, parseAddress, type District } from '../../model/addressing';
import type { Position } from '../../model/schema';
import { useDerived, useShow } from '../../store/showStore';
import { useUi } from '../../store/uiStore';

const LEAD_IN = 10;
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
  const cues = useMemo(
    () => buildCueList(show, timing).filter((c): c is TimedCue => c.time !== null),
    [show, timing],
  );
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(-LEAD_IN);
  const base = useRef({ at: 0, from: -LEAD_IN });
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!running) return;
    base.current = { at: performance.now(), from: elapsed };
    let raf = 0;
    const tick = () => {
      setElapsed(base.current.from + (performance.now() - base.current.at) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const adjust = useCallback((d: number) => {
    base.current.from += d;
    setElapsed((e) => e + d);
  }, []);

  /** Set the clock to an exact time, whether running or paused. */
  const seek = useCallback((t: number) => {
    base.current = { at: performance.now(), from: t };
    setElapsed(t);
  }, []);

  const nextIdx = cues.findIndex((c) => c.time > elapsed);
  const next = nextIdx >= 0 ? cues[nextIdx] : null;
  const current = nextIdx === -1 ? cues[cues.length - 1] : cues[nextIdx - 1];
  const countdown = next ? next.time - elapsed : null;
  const nextTime = next?.time ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMode(false);
      else if (e.code === 'Space') {
        e.preventDefault();
        setRunning((r) => !r);
      } else if (e.key === 'ArrowLeft') adjust(-1);
      else if (e.key === 'ArrowRight') adjust(1);
      else if ((e.key === 'n' || e.key === 'N' || e.key === 'PageDown') && nextTime !== null) {
        e.preventDefault();
        seek(nextTime);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setShowMode, adjust, seek, nextTime]);

  // Keep the upcoming cue visible in the list.
  useEffect(() => {
    listRef.current?.querySelector(`[data-cue-idx="${nextIdx}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [nextIdx]);

  const posNames = (ids: string[]) => ids.map((id) => show.positions.find((p) => p.id === id)?.name).join(' + ');
  const hasDistricts = cues.some((c) => c.district);
  const remoteOn = current?.district ?? null;
  const needSwitch = !!next?.district && current?.district?.key !== next.district.key;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white" data-testid="show-mode">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-6 py-3">
        <span className="font-bold text-amber-400">SHOW MODE</span>
        <span className="text-slate-400">{show.meta.name}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant={running ? 'secondary' : 'primary'} onClick={() => setRunning((r) => !r)}>
            {running ? '❚❚ Pause (Space)' : '▶ Start (Space)'}
          </Button>
          <Button onClick={() => next && seek(next.time)} disabled={!next} title="Jump the clock to the next cue">
            ⏭ Next cue (N)
          </Button>
          <Button onClick={() => adjust(-1)}>−1s</Button>
          <Button onClick={() => adjust(1)}>+1s</Button>
          <Button
            variant="ghost"
            onClick={() => {
              setRunning(false);
              seek(-LEAD_IN);
            }}
          >
            Reset
          </Button>
          <Button variant="danger" onClick={() => setShowMode(false)}>
            Exit (Esc)
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_380px]">
        <div className="flex min-h-0 flex-col items-center gap-4 overflow-y-auto">
          <div className="flex w-full max-w-5xl flex-wrap items-center justify-center gap-6">
            <div className="font-mono text-6xl text-slate-300 tabular-nums" data-testid="show-clock">
              {elapsed < 0 ? `T${formatTime(elapsed)}` : formatTime(elapsed)}
            </div>
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
          {current && next && (
            <div className="text-xl text-slate-500">
              Last: {current.label} at {formatTime(current.time)}
            </div>
          )}

          {hasDistricts && <DistrictTrack cues={cues} nextIdx={nextIdx} />}

          <div className="w-full max-w-5xl">
            <div className="mb-1 text-xs tracking-widest text-slate-500 uppercase">Going off now</div>
            <NowFiring positions={show.positions} effects={timing.effects} t={elapsed} />
          </div>
        </div>

        <ol ref={listRef} className="min-h-0 overflow-y-auto rounded-xl border border-slate-800" data-testid="show-cue-list">
          {cues.map((c, i) => {
            const past = c.time <= elapsed;
            const color = c.district ? districtColor(c.district) : undefined;
            const switchHere = c.district && cues[i - 1]?.district?.key !== c.district.key;
            return (
              <Fragment key={c.addressId}>
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
                    'flex items-baseline gap-3 border-b border-slate-900 px-4 py-2',
                    i === nextIdx && 'bg-amber-500/20',
                    past && 'text-slate-600',
                  )}
                  style={color ? { borderLeft: `4px solid ${color}` } : undefined}
                >
                  <span className="w-16 font-mono tabular-nums">{formatTime(c.time)}</span>
                  <span className="font-semibold">{c.label}</span>
                  <span className="truncate text-sm text-slate-500">{posNames(c.positionIds)}</span>
                  {c.district && (
                    <span
                      className={clsx('ml-auto rounded px-1.5 text-[11px] font-bold text-slate-950', past && 'opacity-50')}
                      style={{ background: color }}
                    >
                      {c.district.short}
                    </span>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ol>
      </div>
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
function NowFiring({ positions, effects, t }: { positions: Position[]; effects: EffectTiming[]; t: number }) {
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
                      <span className="truncate font-semibold text-white">{effectName(e)}</span>
                      <span className="ml-auto shrink-0 font-mono text-xs text-slate-400 tabular-nums">
                        {Math.ceil(e.endSec - t)}s
                      </span>
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
                <li key={e.key} className="truncate text-xs text-slate-500">
                  Fuse lit: {effectName(e)} in {(e.startSec - t).toFixed(1)}s
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
