import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Badge, Button, EmptyState, Field, NumberInput, Select, TextInput } from '../../components/ui';
import { buildCueList, type CueEntry } from '../../engine/cues';
import { MIN_SCENE_SEC, clampSceneRange, moveSceneIn, sceneAt, sceneGap, sceneRangeForCues } from '../../engine/scenes';
import { binIntensity } from '../../engine/intensity';
import { computeTiming, type EffectTiming } from '../../engine/timing';
import { formatMoney, formatTime } from '../../lib/format';
import type { Show } from '../../model/schema';
import {
  addScene,
  moveAddressPins,
  moveScene,
  removeScene,
  setCueNote,
  setCueTime,
  setCueTimes,
  setSceneRange,
  updateScene,
  updateSettings,
} from '../../store/actions';
import { useShow } from '../../store/showStore';
import { useUi, type TimelineGraph } from '../../store/uiStore';
import { GRAPH_H, GraphRow } from './GraphRow';

const HEADER_W = 200;
const RULER_H = 30;
const SCENE_STRIP_H = 26;
const LANE_H = 14;
const ROW_PAD = 8;
const BIN_OPTIONS = [1, 2, 5, 10, 15, 30, 60];
const GRAPH_COLORS: Record<TimelineGraph, string> = { shots: '#f97316', cost: '#10b981' };
const formatShots = (n: number) => (n > 0 && n < 10 ? n.toFixed(1).replace(/\.0$/, '') : String(Math.round(n)));

/** Gutter before 0:00 so markers at the start aren't clipped. */
const GUTTER = 16;

interface Row {
  id: string;
  label: string;
  sublabel: string;
  color?: string;
  cues: CueEntry[];
  effects: EffectTiming[];
  lanes: number;
  laneOf: Map<string, number>;
  height: number;
}

function laneify(effects: EffectTiming[]) {
  const ends: number[] = [];
  const laneOf = new Map<string, number>();
  for (const e of [...effects].sort((a, b) => a.startSec - b.startSec)) {
    let lane = ends.findIndex((end) => end <= e.startSec + 0.01);
    if (lane === -1) {
      lane = ends.length;
      ends.push(0);
    }
    ends[lane] = e.endSec;
    laneOf.set(e.key, lane);
  }
  return { lanes: Math.max(1, ends.length), laneOf };
}

interface DragState {
  addrs: string[];
  startX: number;
  startY: number;
  orig: Record<string, number>;
  dt: number;
  targetRow: string | null;
  moved: boolean;
}

interface SceneDrag {
  /** move: whole scene with its cues; start/end: an edge; draw: a new scene on the strip. */
  mode: 'move' | 'start' | 'end' | 'draw';
  sceneId: string | null;
  startX: number;
  /** Draw only: the time the pointer went down. */
  originSec: number;
  dt: number;
}

/** The span a start or end edge drag gives its scene. */
function resizedRange(show: Show, d: SceneDrag) {
  const s = show.scenes.find((x) => x.id === d.sceneId);
  if (!s) return null;
  return d.mode === 'start'
    ? clampSceneRange(show.scenes, s.id, s.startSec + d.dt, s.endSec)
    : clampSceneRange(show.scenes, s.id, s.startSec, s.endSec + d.dt);
}

/** The new scene a draw drag has marked out, kept inside the empty stretch it started in. */
function drawnRange(show: Show, d: SceneDrag, snap: number) {
  const { lo, hi } = sceneGap(show.scenes, d.originSec);
  const bound = (t: number) => Math.min(hi, Math.max(lo, t));
  const anchor = bound(snapTo(d.originSec, snap));
  const other = bound(anchor + d.dt);
  return { startSec: Math.min(anchor, other), endSec: Math.max(anchor, other) };
}

/** Round to the snap grid, without float noise like 10.600000000000001. */
function snapTo(t: number, snap: number) {
  return Math.round((Math.round(t / snap) * snap) * 1000) / 1000;
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
}

export function TimelineTab() {
  const show = useShow((s) => s);
  const snap = show.settings.snapSec;
  const [pps, setPps] = useState(14);
  const [groupBy, setGroupBy] = useState<'cue' | 'position'>('cue');
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [sceneDrag, setSceneDrag] = useState<SceneDrag | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const binSec = useUi((s) => s.graphBinSec);
  const graphs = useUi((s) => s.graphs);
  const setGraphBinSec = useUi((s) => s.setGraphBinSec);
  const toggleGraph = useUi((s) => s.toggleGraph);
  const rowsRef = useRef<HTMLDivElement>(null);

  // Live preview while dragging: recompute timing with the dragged cue times.
  const preview = useMemo(() => {
    if (sceneDrag?.sceneId && sceneDrag.dt !== 0) {
      if (sceneDrag.mode === 'move') return { ...show, ...moveSceneIn(show, sceneDrag.sceneId, sceneDrag.dt) };
      const range = resizedRange(show, sceneDrag);
      return { ...show, scenes: show.scenes.map((s) => (s.id === sceneDrag.sceneId ? { ...s, ...range } : s)) };
    }
    if (!drag || drag.dt === 0) return show;
    const cueTimes = { ...show.cueTimes };
    for (const a of drag.addrs) cueTimes[a] = Math.max(0, drag.orig[a] + drag.dt);
    return { ...show, cueTimes };
  }, [show, drag, sceneDrag]);
  const timing = useMemo(() => computeTiming(preview), [preview]);
  const cues = useMemo(() => buildCueList(preview, timing), [preview, timing]);

  const rows: Row[] = useMemo(() => {
    if (groupBy === 'cue') {
      return [...cues]
        .sort((a, b) => a.order - b.order)
        .map((c) => {
          const { lanes, laneOf } = laneify(c.effects);
          return {
            id: c.addressId,
            label: c.label,
            sublabel: [c.district?.label, c.pins.map((p) => `${p.moduleName} #${p.pin}`).join(', ')]
              .filter(Boolean)
              .join(' · '),
            color: preview.positions.find((p) => p.id === c.positionIds[0])?.color,
            cues: [c],
            effects: c.effects,
            lanes,
            laneOf,
            height: Math.max(40, ROW_PAD * 2 + lanes * LANE_H),
          };
        });
    }
    return preview.positions.map((p) => {
      const effects = timing.effects.filter((e) => e.positionId === p.id);
      const { lanes, laneOf } = laneify(effects);
      return {
        id: p.id,
        label: p.name,
        sublabel: `${effects.length} effects`,
        color: p.color,
        cues: cues.filter((c) => c.positionIds.includes(p.id)),
        effects,
        lanes,
        laneOf,
        height: Math.max(48, ROW_PAD * 2 + lanes * LANE_H),
      };
    });
  }, [groupBy, cues, timing, preview.positions]);

  const maxCue = cues.reduce((m, c) => Math.max(m, c.time ?? 0), 0);
  const maxScene = preview.scenes.reduce((m, s) => Math.max(m, s.endSec), 0);
  const duration = Math.max(90, Math.ceil(Math.max(timing.showEndSec, maxCue, maxScene) / 10) * 10 + 30);
  const width = duration * pps + GUTTER * 2;
  const x = (t: number) => GUTTER + t * pps;
  const w = (dt: number) => dt * pps;
  const bins = useMemo(
    () => binIntensity(timing.effects, preview, binSec, duration),
    [timing.effects, preview, binSec, duration],
  );
  const shownGraphs = (['shots', 'cost'] as const).filter((g) => graphs[g]);

  // Playback
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      setPlayhead((p) => {
        const next = p + (now - last) / 1000;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration]);

  // Follow the playhead
  useEffect(() => {
    const el = scrollRef.current;
    if (!playing || !el) return;
    const px = HEADER_W + x(playhead);
    if (px > el.scrollLeft + el.clientWidth - 80 || px < el.scrollLeft + HEADER_W) {
      el.scrollLeft = px - HEADER_W - 80;
    }
  });

  // Keyboard: space = play/pause, arrows nudge the selected scene or cues
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (selected.length || selectedSceneId)) {
        e.preventDefault();
        const d = (e.key === 'ArrowLeft' ? -1 : 1) * snap * (e.shiftKey ? 10 : 1);
        if (selectedSceneId) moveScene(selectedSceneId, d);
        else setCueTimes(Object.fromEntries(selected.map((a) => [a, (show.cueTimes[a] ?? 0) + d])));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, selectedSceneId, snap, show.cueTimes]);

  // Dragging on the scene strip
  useEffect(() => {
    if (!sceneDrag) return;
    const onMove = (e: PointerEvent) => {
      const dt = snapTo((e.clientX - sceneDrag.startX) / pps, snap);
      if (dt !== sceneDrag.dt) setSceneDrag({ ...sceneDrag, dt });
    };
    const onUp = (e: PointerEvent) => {
      // Measure from this event: the last move may not have rendered into state yet.
      const final = { ...sceneDrag, dt: snapTo((e.clientX - sceneDrag.startX) / pps, snap) };
      if (final.mode === 'draw') {
        const { startSec, endSec } = drawnRange(show, final, snap);
        if (endSec - startSec >= MIN_SCENE_SEC) setSelectedSceneId(addScene(startSec, endSec));
      } else if (final.sceneId && final.dt !== 0) {
        if (final.mode === 'move') {
          moveScene(final.sceneId, final.dt);
        } else {
          const range = resizedRange(show, final);
          if (range) setSceneRange(final.sceneId, range.startSec, range.endSec);
        }
      }
      setSceneDrag(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [sceneDrag, pps, snap, show]);

  const beginSceneDrag = (e: ReactPointerEvent, sceneId: string, mode: 'move' | 'start' | 'end') => {
    e.stopPropagation();
    setSelected([]);
    setSelectedSceneId(sceneId);
    setSceneDrag({ mode, sceneId, startX: e.clientX, originSec: 0, dt: 0 });
  };

  const beginSceneDraw = (e: ReactPointerEvent) => {
    e.stopPropagation();
    setSelected([]);
    setSelectedSceneId(null);
    const left = (e.currentTarget as HTMLElement).getBoundingClientRect().left;
    const originSec = Math.max(0, (e.clientX - left - GUTTER) / pps);
    setSceneDrag({ mode: 'draw', sceneId: null, startX: e.clientX, originSec, dt: 0 });
  };

  // Dragging cues
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const dt = Math.round(dx / pps / snap) * snap;
      let targetRow: string | null = null;
      const canRetarget =
        groupBy === 'cue' && drag.addrs.length === 1 && show.firing.controller.addressing !== 'module';
      if (canRetarget && rowsRef.current && Math.abs(dy) > 12) {
        const top = rowsRef.current.getBoundingClientRect().top;
        let y = e.clientY - top;
        for (const r of rows) {
          if (y < r.height) {
            targetRow = r.id;
            break;
          }
          y -= r.height;
        }
        if (targetRow === drag.addrs[0]) targetRow = null;
      }
      const moved = drag.moved || Math.abs(dx) > 3 || Math.abs(dy) > 3;
      if (dt !== drag.dt || targetRow !== drag.targetRow || moved !== drag.moved) {
        setDrag({ ...drag, dt, targetRow, moved });
      }
    };
    const onUp = (e: PointerEvent) => {
      // Measure from this event: the last move may not have rendered into state yet.
      const dt = snapTo((e.clientX - drag.startX) / pps, snap);
      if (drag.targetRow) {
        const from = drag.addrs[0];
        if (window.confirm('Link these module cues to the other controller cue? They will fire together at that cue\'s time.')) {
          moveAddressPins(from, drag.targetRow);
          setSelected([drag.targetRow]);
        }
      } else if (dt !== 0) {
        setCueTimes(Object.fromEntries(drag.addrs.map((a) => [a, drag.orig[a] + dt])));
      }
      setDrag(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, pps, snap, rows, groupBy, show.firing.controller.addressing]);

  const beginDrag = (e: ReactPointerEvent, addr: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedSceneId(null);
    let sel = selected;
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      sel = selected.includes(addr) ? selected.filter((a) => a !== addr) : [...selected, addr];
    } else if (!selected.includes(addr)) {
      sel = [addr];
    }
    setSelected(sel);
    const addrs = sel.includes(addr) ? sel : [addr];
    setDrag({
      addrs,
      startX: e.clientX,
      startY: e.clientY,
      orig: Object.fromEntries(addrs.map((a) => [a, show.cueTimes[a] ?? 0])),
      dt: 0,
      targetRow: null,
      moved: false,
    });
  };

  const tickStep = pps >= 40 ? 1 : pps >= 16 ? 5 : pps >= 6 ? 10 : 30;
  const ticks = Array.from({ length: Math.floor(duration / tickStep) + 1 }, (_, i) => i * tickStep);
  const colorOf = (posId: string) => preview.positions.find((p) => p.id === posId)?.color ?? '#64748b';
  const selectedCue = selected.length === 1 ? cues.find((c) => c.addressId === selected[0]) : null;
  const selectedScene = preview.scenes.find((s) => s.id === selectedSceneId) ?? null;
  const sceneCues = selectedScene ? cues.filter((c) => sceneAt([selectedScene], c.time)) : [];
  const newSceneRange = selected.length ? sceneRangeForCues(show, timing, selected) : null;
  const draftScene = sceneDrag?.mode === 'draw' && sceneDrag.dt !== 0 ? drawnRange(show, sceneDrag, snap) : null;

  if (cues.length === 0) {
    return (
      <div className="p-8">
        <EmptyState title="No cues to arrange yet">
          Add igniters on the Positions tab and wire them to your cakes and racks. Every wired module cue
          shows up here as a row you can drag in time.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-800 px-4 py-2">
        <Button variant={playing ? 'secondary' : 'primary'} onClick={() => setPlaying((p) => !p)}>
          {playing ? '❚❚ Pause' : '▶ Play'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setPlaying(false);
            setPlayhead(0);
            if (scrollRef.current) scrollRef.current.scrollLeft = 0;
          }}
        >
          ■ Stop
        </Button>
        <span className="mb-1.5 font-mono text-lg text-amber-300 tabular-nums">{formatTime(playhead)}</span>
        <Field label="Rows">
          <Select
            value={groupBy}
            onChange={(v) => setGroupBy(v as 'cue' | 'position')}
            options={[
              { value: 'cue', label: 'By cue' },
              { value: 'position', label: 'By position' },
            ]}
          />
        </Field>
        <Field label="Snap">
          <Select
            value={String(snap)}
            onChange={(v) => updateSettings({ snapSec: Number(v) })}
            options={[0.1, 0.25, 0.5, 1, 5].map((v) => ({ value: String(v), label: `${v}s` }))}
          />
        </Field>
        <Field label={`Zoom (${pps}px/s)`}>
          <input
            type="range"
            min={3}
            max={80}
            value={pps}
            onChange={(e) => setPps(Number(e.target.value))}
            className="mt-2 w-40 accent-amber-500"
          />
        </Field>
        <div role="group" aria-label="Graphs" className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-400">Graphs</span>
          <div className="flex gap-1">
            {(['shots', 'cost'] as const).map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={graphs[g]}
                onClick={() => toggleGraph(g)}
                className={clsx(
                  'flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs',
                  graphs[g]
                    ? 'border-slate-600 bg-slate-800 text-slate-100'
                    : 'border-slate-800 text-slate-500 hover:text-slate-300',
                )}
                title={graphs[g] ? `Hide the ${g} graph` : `Show the ${g} graph`}
              >
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ background: graphs[g] ? GRAPH_COLORS[g] : 'transparent', outline: `1px solid ${GRAPH_COLORS[g]}` }}
                />
                {g === 'shots' ? 'Shots' : 'Cost'}
              </button>
            ))}
          </div>
        </div>
        {shownGraphs.length > 0 && (
          <Field label="Bin">
            <Select
              value={String(binSec)}
              onChange={(v) => setGraphBinSec(Number(v))}
              options={BIN_OPTIONS.map((v) => ({ value: String(v), label: `${v}s` }))}
            />
          </Field>
        )}
        <Button
          disabled={!newSceneRange}
          title={
            selected.length === 0
              ? 'Select cues first, or drag across the Scenes strip to draw a scene'
              : newSceneRange
                ? 'Create a scene around the selected cues'
                : 'Those cues overlap an existing scene'
          }
          onClick={() => {
            if (!newSceneRange) return;
            setSelectedSceneId(addScene(newSceneRange.startSec, newSceneRange.endSec));
            setSelected([]);
          }}
        >
          ＋ Scene from selection
        </Button>
        <div className="mb-1 ml-auto flex flex-wrap gap-2 text-xs text-slate-400">
          <Badge>{cues.length} cues</Badge>
          <Badge>{timing.effects.length} effects</Badge>
          <Badge tone="amber">Show length {formatTime(timing.showEndSec, 0)}</Badge>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-auto select-none"
        onWheel={(e) => {
          if (e.ctrlKey) {
            e.preventDefault();
            setPps((p) => Math.max(3, Math.min(80, Math.round(p * (e.deltaY < 0 ? 1.15 : 0.87)))));
          }
        }}
        onPointerDown={() => {
          setSelected([]);
          setSelectedSceneId(null);
        }}
        data-testid="timeline"
      >
        <div style={{ width: HEADER_W + width, minHeight: '100%' }} className="relative">
          {/* Ruler */}
          <div className="sticky top-0 z-20 flex" style={{ height: RULER_H }}>
            <div
              className="sticky left-0 z-30 flex items-center border-r border-b border-slate-800 bg-slate-950 px-3 text-xs text-slate-500"
              style={{ width: HEADER_W, minWidth: HEADER_W }}
            >
              {groupBy === 'cue' ? 'Controller cue' : 'Position'}
            </div>
            <div
              className="relative cursor-pointer border-b border-slate-800 bg-slate-950"
              style={{ width }}
              onPointerDown={(e) => {
                e.stopPropagation();
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setPlayhead(Math.max(0, (e.clientX - r.left - GUTTER) / pps));
              }}
            >
              {ticks.map((t) => (
                <div key={t} className="absolute top-0 h-full border-l border-slate-700" style={{ left: x(t) }}>
                  <span className="absolute top-1 left-1 text-[10px] text-slate-400 tabular-nums">{formatTime(t, 0)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Scene strip */}
          <div className="sticky z-20 flex" style={{ top: RULER_H, height: SCENE_STRIP_H }}>
            <div
              className="sticky left-0 z-30 flex items-center border-r border-b border-slate-800 bg-slate-950 px-3 text-xs text-slate-500"
              style={{ width: HEADER_W, minWidth: HEADER_W }}
            >
              Scenes
            </div>
            <div
              className="relative cursor-crosshair border-b border-slate-800 bg-slate-950"
              style={{ width }}
              title="Drag here to draw a new scene"
              onPointerDown={beginSceneDraw}
              data-testid="scene-strip"
            >
              {preview.scenes.map((s) => (
                <div
                  key={s.id}
                  className={clsx(
                    'absolute top-0.5 bottom-0.5 cursor-grab overflow-hidden rounded-sm px-2 text-xs leading-[20px] font-semibold whitespace-nowrap text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.8)]',
                    selectedSceneId === s.id && 'outline outline-2 outline-amber-300',
                  )}
                  style={{ left: x(s.startSec), width: w(s.endSec - s.startSec), background: s.color }}
                  title={`${s.name} · ${formatTime(s.startSec)}–${formatTime(s.endSec)}\nDrag to move it with its cues, drag an edge to resize, double-click to rename`}
                  onPointerDown={(e) => beginSceneDrag(e, s.id, 'move')}
                  onDoubleClick={() => document.getElementById('scene-name')?.focus()}
                  data-testid={`scene-${s.name}`}
                >
                  {s.name}
                  <div
                    className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize"
                    onPointerDown={(e) => beginSceneDrag(e, s.id, 'start')}
                    data-testid={`scene-${s.name}-start`}
                  />
                  <div
                    className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize"
                    onPointerDown={(e) => beginSceneDrag(e, s.id, 'end')}
                    data-testid={`scene-${s.name}-end`}
                  />
                </div>
              ))}
              {draftScene && (
                <div
                  className="pointer-events-none absolute top-0.5 bottom-0.5 rounded-sm border border-dashed border-amber-300 bg-amber-300/20"
                  style={{ left: x(draftScene.startSec), width: w(draftScene.endSec - draftScene.startSec) }}
                />
              )}
            </div>
          </div>

          {/* Shots and cost over time */}
          {shownGraphs.map((g, i) => (
            <GraphRow
              key={g}
              label={g === 'shots' ? 'Shots' : 'Cost'}
              unit={`per ${binSec}s`}
              color={GRAPH_COLORS[g]}
              bins={bins}
              value={(b) => b[g]}
              format={g === 'shots' ? formatShots : formatMoney}
              top={RULER_H + SCENE_STRIP_H + i * GRAPH_H}
              headerW={HEADER_W}
              width={width}
              x={x}
              w={w}
              playhead={playhead}
              onSeek={setPlayhead}
              onHide={() => toggleGraph(g)}
              testId={`graph-${g}`}
            />
          ))}

          {/* Rows */}
          <div ref={rowsRef} className="relative">
            {/* Scene bands, behind the rows */}
            {preview.scenes.map((s) => (
              <div
                key={s.id}
                className="pointer-events-none absolute top-0 h-full border-x"
                style={{
                  left: HEADER_W + x(s.startSec),
                  width: w(s.endSec - s.startSec),
                  background: `${s.color}33`,
                  borderColor: `${s.color}aa`,
                }}
              />
            ))}
            {rows.map((row) => {
              const isTarget = drag?.targetRow === row.id;
              const rowSelected = groupBy === 'cue' && selected.includes(row.id);
              return (
                <div key={row.id} className="flex" style={{ height: row.height }}>
                  <div
                    className={clsx(
                      'sticky left-0 z-10 flex flex-col justify-center border-r border-b border-slate-800 px-3',
                      rowSelected ? 'bg-slate-800' : 'bg-slate-950',
                    )}
                    style={{ width: HEADER_W, minWidth: HEADER_W, borderLeft: `3px solid ${row.color ?? 'transparent'}` }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedSceneId(null);
                      if (groupBy === 'cue') setSelected([row.id]);
                    }}
                  >
                    <span className="truncate text-sm font-medium text-slate-100">{row.label}</span>
                    <span className="truncate text-[11px] text-slate-500">{row.sublabel}</span>
                  </div>
                  <div
                    className={clsx('relative border-b border-slate-800/70', isTarget && 'bg-amber-500/10')}
                    style={{ width }}
                  >
                    {ticks.map((t) => (
                      <div key={t} className="absolute top-0 h-full border-l border-slate-800/60" style={{ left: x(t) }} />
                    ))}
                    {row.effects.map((e) => {
                      const lane = row.laneOf.get(e.key) ?? 0;
                      const active = playhead >= e.startSec && playhead <= e.endSec;
                      const dragging = drag?.addrs.includes(e.addressId);
                      return (
                        <div
                          key={e.key}
                          className={clsx(
                            'absolute cursor-grab overflow-hidden rounded-sm px-1 text-[10px] leading-[12px] whitespace-nowrap text-white',
                            active && 'ring-2 ring-white/80',
                            dragging && 'opacity-80',
                            selected.includes(e.addressId) && 'outline outline-1 outline-amber-300',
                          )}
                          style={{
                            left: x(e.startSec),
                            width: Math.max(4, w(e.endSec - e.startSec)),
                            top: ROW_PAD + lane * LANE_H,
                            height: LANE_H - 2,
                            background: colorOf(e.positionId),
                            opacity: active ? 1 : 0.75,
                          }}
                          title={`${e.name}${e.tubeIndex !== null ? ` (tube ${e.tubeIndex + 1})` : ''}\nLit ${formatTime(e.igniteSec)} · effect ${formatTime(e.startSec)}–${formatTime(e.endSec)}${e.sections.map((s) => `\n  ${s.name}: ${formatTime(s.startSec)}–${formatTime(s.endSec)}`).join('')}`}
                          onPointerDown={(ev) => beginDrag(ev, e.addressId)}
                        >
                          {e.name}
                          {e.tubeIndex !== null ? ` #${e.tubeIndex + 1}` : ''}
                          {e.sections.slice(1).map((s) => (
                            <span
                              key={`${s.name}-${s.startSec}`}
                              className="absolute top-0 h-full w-px bg-slate-950/70"
                              style={{ left: w(s.startSec - e.startSec) }}
                            />
                          ))}
                        </div>
                      );
                    })}
                    {row.cues.map((c) =>
                      c.time === null ? null : (
                        <div
                          key={c.addressId}
                          className="absolute top-0 z-[5] h-full cursor-ew-resize"
                          style={{ left: x(c.time) - 6, width: 12 }}
                          onPointerDown={(ev) => beginDrag(ev, c.addressId)}
                          title={`${c.label} @ ${formatTime(c.time)} (drag to move${groupBy === 'cue' ? ', drag onto another row to link' : ''})`}
                          data-testid={`cue-${c.label}`}
                        >
                          <div
                            className={clsx(
                              'absolute top-0 left-1/2 h-full w-0.5 -translate-x-1/2',
                              selected.includes(c.addressId) ? 'bg-amber-300' : 'bg-sky-400',
                            )}
                          />
                          <div
                            className={clsx(
                              'absolute top-0.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border border-slate-950',
                              selected.includes(c.addressId) ? 'bg-amber-300' : 'bg-sky-400',
                            )}
                          />
                          {groupBy === 'position' && (
                            <span className="absolute bottom-0.5 left-2 text-[9px] whitespace-nowrap text-sky-300">{c.label}</span>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                </div>
              );
            })}
            {/* Playhead */}
            <div
              className="pointer-events-none absolute top-0 z-[15] h-full w-px bg-rose-500"
              style={{ left: HEADER_W + x(playhead) }}
            />
          </div>
          {drag?.moved && (
            <div className="pointer-events-none fixed right-6 bottom-24 z-50 rounded-md bg-slate-800 px-3 py-1.5 text-sm text-amber-200 shadow-lg">
              {drag.targetRow
                ? `Link to ${rows.find((r) => r.id === drag.targetRow)?.label}`
                : `${drag.dt >= 0 ? '+' : ''}${drag.dt.toFixed(2)} s${drag.addrs.length === 1 ? ` → ${formatTime(Math.max(0, drag.orig[drag.addrs[0]] + drag.dt), 2)}` : ` (${drag.addrs.length} cues)`}`}
            </div>
          )}
          {sceneDrag?.sceneId && sceneDrag.dt !== 0 && selectedScene && (
            <div className="pointer-events-none fixed right-6 bottom-24 z-50 rounded-md bg-slate-800 px-3 py-1.5 text-sm text-amber-200 shadow-lg">
              {selectedScene.name}: {formatTime(selectedScene.startSec)}–{formatTime(selectedScene.endSec)}
              {sceneDrag.mode === 'move' && ` (${sceneCues.length} cues)`}
            </div>
          )}
        </div>
      </div>

      <div className="flex min-h-[92px] flex-wrap items-start gap-4 border-t border-slate-800 bg-slate-950 px-4 py-2 text-sm">
        {selectedScene ? (
          <div key={selectedScene.id} className="contents">
            <Field label="Scene name" className="w-56">
              <TextInput
                id="scene-name"
                value={selectedScene.name}
                onChange={(name) => updateScene(selectedScene.id, { name })}
                onFocus={(e) => e.target.select()}
              />
            </Field>
            <Field label="Color">
              <input
                type="color"
                aria-label="Scene color"
                value={selectedScene.color}
                onChange={(e) => updateScene(selectedScene.id, { color: e.target.value })}
                className="h-8 w-12 cursor-pointer rounded border border-slate-700 bg-slate-900"
              />
            </Field>
            <Field label="Start (s)" className="w-24">
              <NumberInput
                min={0}
                value={selectedScene.startSec}
                onChange={(t) => setSceneRange(selectedScene.id, t, selectedScene.endSec)}
              />
            </Field>
            <Field label="End (s)" className="w-24">
              <NumberInput
                min={0}
                value={selectedScene.endSec}
                onChange={(t) => setSceneRange(selectedScene.id, selectedScene.startSec, t)}
              />
            </Field>
            <Field label="Note" className="w-72" hint="Printed on the show overview">
              <TextInput
                value={selectedScene.note}
                onChange={(note) => updateScene(selectedScene.id, { note })}
                placeholder="What this part of the show is like"
              />
            </Field>
            <div className="max-w-xl text-xs text-slate-400" data-testid="scene-cues">
              <div className="mb-1 font-medium text-slate-300">
                {sceneCues.length} {sceneCues.length === 1 ? 'cue' : 'cues'} in this scene
              </div>
              {sceneCues.map((c) => c.label).join(' · ') || 'Drag cues into this time range to add them.'}
            </div>
            <Button
              variant="danger"
              className="mt-4 ml-auto"
              title="Delete the scene. Its cues stay where they are."
              onClick={() => {
                removeScene(selectedScene.id);
                setSelectedSceneId(null);
              }}
            >
              Remove scene
            </Button>
          </div>
        ) : selectedCue ? (
          <>
            <div>
              <div className="font-semibold text-slate-100">{selectedCue.label}</div>
              <div className="text-xs text-slate-500">
                {selectedCue.pins.map((p) => `${p.moduleName} #${p.pin}`).join(' + ')}
                {selectedCue.pins.length > 1 && ' (linked)'}
              </div>
            </div>
            <Field label="Time (s)" className="w-28">
              <NumberInput min={0} value={selectedCue.time ?? 0} onChange={(t) => setCueTime(selectedCue.addressId, t)} />
            </Field>
            <Field label="Operator note" className="w-72">
              <TextInput
                value={show.cueNotes[selectedCue.addressId] ?? ''}
                onChange={(v) => setCueNote(selectedCue.addressId, v)}
                placeholder="e.g. wait for music hit"
              />
            </Field>
            <div className="max-w-xl text-xs text-slate-400">
              <div className="mb-1 font-medium text-slate-300">Fires</div>
              {selectedCue.effects.length === 0
                ? 'Nothing timed yet.'
                : selectedCue.effects
                    .map((e) => `${e.name}${e.tubeIndex !== null ? ` #${e.tubeIndex + 1}` : ''} @ ${formatTime(e.startSec)}`)
                    .join(' · ')}
            </div>
          </>
        ) : selected.length > 1 ? (
          <p className="text-slate-400">
            {selected.length} cues selected. Drag to move them together, use ← → to nudge (Shift for 10×), or
            make them a scene.
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            Drag a cue marker or effect bar to change its time. Shift-click selects several. By cue, drag
            onto another row to link module cues. Click the ruler to move the playhead. Space plays,
            Ctrl+scroll zooms. Bar color = position. Drag across the Scenes strip to draw a scene; any cue in
            its time range belongs to it and moves with it. Drag a scene to move it, or its edges to resize.
          </p>
        )}
      </div>
    </div>
  );
}
