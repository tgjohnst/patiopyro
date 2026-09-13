import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/ui';
import { buildCueList } from '../../engine/cues';
import { formatTime } from '../../lib/format';
import { useDerived, useShow } from '../../store/showStore';
import { useUi } from '../../store/uiStore';

const LEAD_IN = 10;

export function ShowMode() {
  const show = useShow((s) => s);
  const { timing } = useDerived();
  const setShowMode = useUi((u) => u.setShowMode);
  const cues = useMemo(() => buildCueList(show, timing).filter((c) => c.time !== null), [show, timing]);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(-LEAD_IN);
  const base = useRef({ at: 0, from: -LEAD_IN });

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

  const adjust = (d: number) => {
    base.current.from += d;
    setElapsed((e) => e + d);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMode(false);
      else if (e.code === 'Space') {
        e.preventDefault();
        setRunning((r) => !r);
      } else if (e.key === 'ArrowLeft') adjust(-1);
      else if (e.key === 'ArrowRight') adjust(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setShowMode]);

  const nextIdx = cues.findIndex((c) => (c.time as number) > elapsed);
  const next = nextIdx >= 0 ? cues[nextIdx] : null;
  const current = nextIdx === -1 ? cues[cues.length - 1] : cues[nextIdx - 1];
  const countdown = next ? (next.time as number) - elapsed : null;
  const posNames = (ids: string[]) => ids.map((id) => show.positions.find((p) => p.id === id)?.name).join(' + ');

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white" data-testid="show-mode">
      <div className="flex items-center gap-3 border-b border-slate-800 px-6 py-3">
        <span className="font-bold text-amber-400">SHOW MODE</span>
        <span className="text-slate-400">{show.meta.name}</span>
        <div className="ml-auto flex gap-2">
          <Button variant={running ? 'secondary' : 'primary'} onClick={() => setRunning((r) => !r)}>
            {running ? '❚❚ Pause (Space)' : '▶ Start (Space)'}
          </Button>
          <Button onClick={() => adjust(-1)}>−1s</Button>
          <Button onClick={() => adjust(1)}>+1s</Button>
          <Button
            variant="ghost"
            onClick={() => {
              setRunning(false);
              setElapsed(-LEAD_IN);
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
        <div className="flex flex-col items-center justify-center gap-6">
          <div className="font-mono text-7xl text-slate-300 tabular-nums">
            {elapsed < 0 ? `T${formatTime(elapsed)}` : formatTime(elapsed)}
          </div>
          {next ? (
            <div
              className={clsx(
                'w-full max-w-3xl rounded-3xl border-4 p-8 text-center transition-colors',
                countdown! <= 3 ? 'border-rose-500 bg-rose-950' : countdown! <= 10 ? 'border-amber-400 bg-amber-950/60' : 'border-slate-700 bg-slate-900',
              )}
            >
              <div className="text-lg tracking-widest text-slate-400 uppercase">Next</div>
              <div className="text-7xl font-black">{next.label}</div>
              <div className="mt-2 font-mono text-8xl font-bold tabular-nums">{countdown!.toFixed(1)}</div>
              <div className="mt-3 text-2xl text-slate-200">{posNames(next.positionIds)}</div>
              <div className="text-lg text-slate-400">
                {[...new Set(next.effects.map((e) => e.name))].join(', ')}
              </div>
              {next.note && <div className="mt-2 text-2xl font-semibold text-amber-300">{next.note}</div>}
            </div>
          ) : (
            <div className="text-5xl font-bold text-slate-400">
              {cues.length ? (elapsed >= timing.showEndSec ? 'Show complete' : 'All cues fired') : 'No timed cues'}
            </div>
          )}
          {current && next && (
            <div className="text-xl text-slate-500">
              Last: {current.label} at {formatTime(current.time as number)}
            </div>
          )}
        </div>

        <ol className="min-h-0 overflow-y-auto rounded-xl border border-slate-800">
          {cues.map((c, i) => {
            const past = (c.time as number) <= elapsed;
            return (
              <li
                key={c.addressId}
                className={clsx(
                  'flex items-baseline gap-3 border-b border-slate-900 px-4 py-2',
                  i === nextIdx && 'bg-amber-500/20',
                  past && 'text-slate-600',
                )}
              >
                <span className="w-16 font-mono tabular-nums">{formatTime(c.time as number)}</span>
                <span className="font-semibold">{c.label}</span>
                <span className="truncate text-sm text-slate-500">{posNames(c.positionIds)}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
