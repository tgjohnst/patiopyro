import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Field, Modal, NumberInput, Select } from '../../components/ui';
import { endpointNamer } from '../../engine/chains';
import { displayToInches, formatTime, inchesToDisplay, smallUnit } from '../../lib/format';
import { KIND_ICON, isTubeLoadable } from '../../model/catalog';
import { tubeKey } from '../../model/endpoints';
import type { Rack } from '../../model/schema';
import {
  clearTubeFuse,
  deleteElements,
  fillEmptyTubes,
  fuseTubesSeries,
  setTubeShell,
} from '../../store/actions';
import { useDerived, useShow } from '../../store/showStore';
import { DND_CATALOG, useUi } from '../../store/uiStore';

const CELL = 64;

function shellHue(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function RackEditor({ placedId }: { placedId: string }) {
  const openRack = useUi((u) => u.openRack);
  const show = useShow((s) => s);
  const { timing, totals } = useDerived();
  const placed = show.placed.find((p) => p.id === placedId);
  const rack = show.catalog.find((c) => c.id === placed?.catalogId) as Rack | undefined;
  const shells = show.catalog.filter(isTubeLoadable);
  const [mode, setMode] = useState<'load' | 'fuse'>('load');
  const [brush, setBrush] = useState<string | null>(shells[0]?.id ?? null);
  const [path, setPath] = useState<number[]>([]);
  const [fuseTypeId, setFuseTypeId] = useState(show.settings.defaultFuseTypeId);
  const [lengthIn, setLengthIn] = useState(rack?.tubeSpacingIn ?? 2.5);
  const close = () => openRack(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode !== 'fuse') return;
      if (e.key === 'Enter' && path.length > 1) {
        fuseTubesSeries(placedId, path, fuseTypeId, lengthIn);
        setPath([]);
      }
      if (e.key === 'Backspace') setPath((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, path, placedId, fuseTypeId, lengthIn]);

  const name = useMemo(() => endpointNamer(show, placed?.positionId ?? ''), [show, placed?.positionId]);

  if (!placed || rack?.kind !== 'rack') return null;
  const tubes = placed.tubes ?? [];
  const u = show.settings.units;
  const fuse = new Map(show.fuseTypes.map((f) => [f.id, f]));
  const cx = (i: number) => (i % rack.cols) * CELL + CELL / 2;
  const cy = (i: number) => Math.floor(i / rack.cols) * CELL + CELL / 2;

  const internal = show.fuseSegments.flatMap((s) => {
    const a = /^t:(.+):(\d+)$/.exec(s.from);
    const b = /^t:(.+):(\d+)$/.exec(s.to);
    return a && b && a[1] === placedId && b[1] === placedId ? [{ seg: s, a: Number(a[2]), b: Number(b[2]) }] : [];
  });
  const external = new Map<number, string[]>();
  for (const s of show.fuseSegments) {
    for (const [k, other] of [
      [s.from, s.to],
      [s.to, s.from],
    ]) {
      const m = /^t:(.+):(\d+)$/.exec(k);
      if (m && m[1] === placedId && !other.startsWith(`t:${placedId}:`)) {
        const i = Number(m[2]);
        external.set(i, [...(external.get(i) ?? []), name(other)]);
      }
    }
  }

  const clickTube = (i: number, e: React.MouseEvent) => {
    if (mode === 'load') {
      setTubeShell(placedId, i, e.altKey || e.button === 2 ? null : brush);
    } else {
      setPath((p) => (p[p.length - 1] === i ? p.slice(0, -1) : p.includes(i) ? p : [...p, i]));
    }
  };

  const snake = () => {
    const order: number[] = [];
    for (let r = 0; r < rack.rows; r++) {
      const row = Array.from({ length: rack.cols }, (_, c) => r * rack.cols + c);
      order.push(...(r % 2 ? row.reverse() : row));
    }
    return order;
  };

  const width = rack.cols * CELL;
  const height = rack.rows * CELL;
  const pathPts = path.map((i) => `${cx(i)},${cy(i)}`).join(' ');

  return (
    <Modal
      wide="full"
      onClose={close}
      title={
        <span className="flex items-center gap-2">
          Rack editor: {name(`in:${placedId}`).replace(/ lead fuse$/, '')}
          <Badge>
            {rack.rows}×{rack.cols}
          </Badge>
        </span>
      }
    >
      <div className="flex h-full min-h-0 gap-4">
        <div className="flex w-60 shrink-0 flex-col gap-3 overflow-y-auto">
          <div className="flex rounded-lg border border-slate-700 p-0.5">
            {(['load', 'fuse'] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setPath([]);
                }}
                className={clsx(
                  'flex-1 rounded-md py-1.5 text-sm font-medium',
                  mode === m ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800',
                )}
              >
                {m === 'load' ? 'Load tubes' : 'Lay fuse'}
              </button>
            ))}
          </div>

          {mode === 'load' ? (
            <>
              <p className="text-xs text-slate-400">
                Pick a shell, rocket or roman candle, then click tubes to load them. Alt-click or right-click empties a tube. You can also drag them onto tubes.
              </p>
              <div className="flex flex-col gap-1">
                {shells.length === 0 && <p className="text-sm text-slate-500">No shells, rockets or roman candles in inventory.</p>}
                {shells.map((s) => {
                  const use = totals.inventory.find((x) => x.catalogId === s.id);
                  const left = s.qtyOwned - (use?.used ?? 0);
                  return (
                    <button
                      key={s.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData(DND_CATALOG, s.id)}
                      onClick={() => setBrush(s.id)}
                      className={clsx(
                        'flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm',
                        brush === s.id ? 'border-amber-400 bg-amber-500/10' : 'border-slate-800 hover:border-slate-600',
                      )}
                    >
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: `hsl(${shellHue(s.id)} 80% 55%)` }} />
                      <span className="w-3 text-center text-xs text-slate-500" title={s.kind}>
                        {KIND_ICON[s.kind]}
                      </span>
                      <span className="flex-1 truncate">{s.name}</span>
                      <span className={clsx('text-xs tabular-nums', left < 0 ? 'text-rose-400' : 'text-slate-500')}>{left}</span>
                    </button>
                  );
                })}
                <button
                  onClick={() => setBrush(null)}
                  className={clsx(
                    'rounded-md border px-2 py-1.5 text-left text-sm',
                    brush === null ? 'border-amber-400 bg-amber-500/10' : 'border-slate-800 hover:border-slate-600',
                  )}
                >
                  ○ Empty tube
                </button>
              </div>
              <Button disabled={!brush} onClick={() => brush && fillEmptyTubes(placedId, brush)}>
                Fill empty tubes
              </Button>
              <Button variant="ghost" onClick={() => tubes.forEach((_, i) => setTubeShell(placedId, i, null))}>
                Unload all
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-400">
                Click tubes in firing order to build a run, then apply it (or press Enter). Backspace removes the last tube. Click a fuse line to delete it.
              </p>
              <Field label="Fuse type">
                <Select value={fuseTypeId} onChange={setFuseTypeId} options={show.fuseTypes.map((f) => ({ value: f.id, label: f.name }))} />
              </Field>
              <Field label="Length between tubes" hint={`Burn ${(((lengthIn / 12) * (fuse.get(fuseTypeId)?.burnRateSecPerFt ?? 0))).toFixed(1)} s per link`}>
                <NumberInput
                  min={0}
                  suffix={smallUnit(u)}
                  value={inchesToDisplay(lengthIn, u)}
                  onChange={(v) => setLengthIn(displayToInches(v, u))}
                />
              </Field>
              <div className="text-xs text-slate-400">
                Run: {path.length ? path.map((i) => i + 1).join(' → ') : '—'}
              </div>
              <Button
                variant="primary"
                disabled={path.length < 2}
                onClick={() => {
                  fuseTubesSeries(placedId, path, fuseTypeId, lengthIn);
                  setPath([]);
                }}
              >
                Apply fuse run
              </Button>
              <Button variant="ghost" disabled={!path.length} onClick={() => setPath([])}>
                Clear selection
              </Button>
              <hr className="border-slate-800" />
              <Button onClick={() => fuseTubesSeries(placedId, snake(), fuseTypeId, lengthIn)}>Series: all tubes (snake)</Button>
              <Button
                onClick={() => {
                  for (let r = 0; r < rack.rows; r++) {
                    fuseTubesSeries(placedId, Array.from({ length: rack.cols }, (_, c) => r * rack.cols + c), fuseTypeId, lengthIn);
                  }
                }}
              >
                Series: each row
              </Button>
              <Button
                variant="ghost"
                className="text-rose-300"
                onClick={() => window.confirm('Remove all tube-to-tube fuse in this rack?') && clearTubeFuse(placedId)}
              >
                Clear rack fuse
              </Button>
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-6">
          <svg width={width + 40} height={height + 40} className="mx-auto select-none" onContextMenu={(e) => e.preventDefault()} data-testid="rack-grid">
            <g transform="translate(20 20)">
              <rect x={-8} y={-8} width={width + 16} height={height + 16} rx={10} fill="#0f172a" stroke="#334155" />
              {internal.map(({ seg, a, b }) => (
                <g key={seg.id} className="cursor-pointer" onClick={() => deleteElements([], [], [seg.id])}>
                  <line x1={cx(a)} y1={cy(a)} x2={cx(b)} y2={cy(b)} stroke="transparent" strokeWidth={14} />
                  <line x1={cx(a)} y1={cy(a)} x2={cx(b)} y2={cy(b)} stroke={fuse.get(seg.fuseTypeId)?.color ?? '#64748b'} strokeWidth={4} strokeLinecap="round">
                    <title>
                      {fuse.get(seg.fuseTypeId)?.name} · {inchesToDisplay(seg.lengthIn, u)} {smallUnit(u)} (click to delete)
                    </title>
                  </line>
                </g>
              ))}
              {path.length > 1 && <polyline points={pathPts} fill="none" stroke="#f59e0b" strokeWidth={3} strokeDasharray="6 4" />}
              {tubes.map((shellId, i) => {
                const shell = shellId ? show.catalog.find((c) => c.id === shellId) : null;
                const eff = timing.effects.find((e) => e.placedId === placedId && e.tubeIndex === i);
                const arrived = timing.arrivals.get(tubeKey(placedId, i));
                const inPath = path.indexOf(i);
                return (
                  <g
                    key={i}
                    className="cursor-pointer"
                    data-testid={`tube-${i + 1}`}
                    onMouseDown={(e) => clickTube(i, e)}
                    onDragOver={(e) => e.dataTransfer.types.includes(DND_CATALOG) && e.preventDefault()}
                    onDrop={(e) => {
                      const id = e.dataTransfer.getData(DND_CATALOG);
                      if (isTubeLoadable(show.catalog.find((c) => c.id === id))) setTubeShell(placedId, i, id);
                    }}
                  >
                    <circle
                      cx={cx(i)}
                      cy={cy(i)}
                      r={CELL * 0.36}
                      fill={shell ? `hsl(${shellHue(shell.id)} 70% 35%)` : '#020617'}
                      stroke={inPath >= 0 ? '#f59e0b' : external.has(i) ? '#38bdf8' : '#475569'}
                      strokeWidth={inPath >= 0 || external.has(i) ? 3 : 1.5}
                    />
                    <text x={cx(i)} y={cy(i) - 6} fontSize={10} fill="#e2e8f0" textAnchor="middle" fontWeight={600}>
                      {inPath >= 0 ? `▶${inPath + 1}` : i + 1}
                    </text>
                    <text x={cx(i)} y={cy(i) + 6} fontSize={8} fill="#cbd5e1" textAnchor="middle">
                      {shell ? shell.name.slice(0, 9) : 'empty'}
                    </text>
                    <text x={cx(i)} y={cy(i) + 16} fontSize={8} fill={eff ? '#fcd34d' : '#64748b'} textAnchor="middle">
                      {eff ? formatTime(eff.startSec) : arrived ? `lit ${formatTime(arrived.t)}` : ''}
                    </text>
                    <title>
                      Tube {i + 1}: {shell?.name ?? 'empty'}
                      {external.has(i) ? `\nConnected to: ${external.get(i)!.join(', ')}` : ''}
                    </title>
                  </g>
                );
              })}
            </g>
          </svg>
          <div className="mx-auto flex flex-wrap gap-3 text-xs text-slate-500">
            <span>
              <span className="text-sky-400">●</span> connected to an igniter or fuse outside the rack
            </span>
            <span>Gold time = burst time</span>
            <span>Tip: connect the first tube to an igniter on the position canvas.</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
