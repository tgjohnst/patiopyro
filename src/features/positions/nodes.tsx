import clsx from 'clsx';
import { memo, type DragEvent } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position as HandlePos,
  getBezierPath,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import type { EffectTiming } from '../../engine/timing';
import { formatTime } from '../../lib/format';
import type { Cake, PlacedItem, Rack } from '../../model/schema';
import { setTubeShell } from '../../store/actions';
import { getShow } from '../../store/showStore';
import { DND_CATALOG, useUi } from '../../store/uiStore';

export type CakeNodeData = {
  placed: PlacedItem;
  cake: Cake;
  timing?: EffectTiming;
  cueLabel?: string;
  displayName: string;
};
export type RackNodeData = {
  placed: PlacedItem;
  rack: Rack;
  shellNames: (string | null)[];
  tubeTimes: (number | null)[];
  /** Tube-to-tube runs drawn inside the rack. */
  runs: { a: number; b: number; color: string }[];
  displayName: string;
};
export type IgniterNodeData = { title: string; subtitle: string; ok: boolean; kind: 'ematch' | 'talon' };
export type JunctionNodeData = { label: string };

export type CakeNodeT = Node<CakeNodeData, 'cake'>;
export type RackNodeT = Node<RackNodeData, 'rack'>;
export type IgniterNodeT = Node<IgniterNodeData, 'igniter'>;
export type JunctionNodeT = Node<JunctionNodeData, 'junction'>;
export type CanvasNode = CakeNodeT | RackNodeT | IgniterNodeT | JunctionNodeT;

const handleCls = '!h-3 !w-3 !border-2 !border-slate-900 !bg-amber-400';

export const CakeNode = memo(function CakeNode({ data, selected }: NodeProps<CakeNodeT>) {
  const { cake, timing } = data;
  return (
    <div
      className={clsx(
        'relative w-48 rounded-lg border bg-slate-900 px-3 py-2 shadow-lg',
        selected ? 'border-amber-400' : 'border-slate-700',
      )}
      data-testid={`node-${data.displayName}`}
    >
      <Handle id="in" type="source" position={HandlePos.Left} className={handleCls} title="Lead fuse" />
      {cake.hasExitFuse && (
        <Handle id="out" type="source" position={HandlePos.Right} className={clsx(handleCls, '!bg-rose-400')} title="Exit fuse" />
      )}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-500">▦</span>
        <span className="truncate text-sm font-semibold text-slate-100">{data.displayName}</span>
      </div>
      <div className="text-[11px] text-slate-400">
        {cake.shots} shots · {cake.durationSec}s{cake.grade === '1.4G Pro-line' ? ' · Pro' : ''}
      </div>
      {timing ? (
        <div className="mt-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-200 tabular-nums">
          {formatTime(timing.startSec)} – {formatTime(timing.endSec)} · {data.cueLabel}
        </div>
      ) : (
        <div className="mt-1 rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-500">Not on a timed cue</div>
      )}
      <div className="pointer-events-none absolute top-1/2 -left-7 -translate-y-1/2 text-[9px] text-slate-500">lead</div>
      {cake.hasExitFuse && (
        <div className="pointer-events-none absolute top-1/2 -right-7 -translate-y-1/2 text-[9px] text-slate-500">exit</div>
      )}
    </div>
  );
});

const TUBE = 26;

export const RackNode = memo(function RackNode({ data, selected }: NodeProps<RackNodeT>) {
  const { rack, placed } = data;
  const openRack = useUi((u) => u.openRack);
  const cx = (i: number) => (i % rack.cols) * TUBE + TUBE / 2;
  const cy = (i: number) => Math.floor(i / rack.cols) * TUBE + TUBE / 2;

  const onDrop = (e: DragEvent, index: number) => {
    const id = e.dataTransfer.getData(DND_CATALOG);
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    if (getShow().catalog.find((c) => c.id === id)?.kind === 'shell') setTubeShell(placed.id, index, id);
  };

  return (
    <div
      className={clsx(
        'rounded-lg border bg-slate-900 px-3 py-2 shadow-lg',
        selected ? 'border-amber-400' : 'border-slate-700',
      )}
      onDoubleClick={() => openRack(placed.id)}
      data-testid={`node-${data.displayName}`}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="truncate text-sm font-semibold text-slate-100">{data.displayName}</span>
        <button
          className="nodrag ml-auto rounded bg-slate-800 px-1.5 text-[11px] text-amber-300 hover:bg-slate-700"
          onClick={() => openRack(placed.id)}
        >
          Open
        </button>
      </div>
      <div className="relative" style={{ width: rack.cols * TUBE, height: rack.rows * TUBE }}>
        <svg className="pointer-events-none absolute inset-0" width={rack.cols * TUBE} height={rack.rows * TUBE}>
          {data.runs.map((r, i) => (
            <line key={i} x1={cx(r.a)} y1={cy(r.a)} x2={cx(r.b)} y2={cy(r.b)} stroke={r.color} strokeWidth={3} strokeLinecap="round" />
          ))}
        </svg>
        {data.shellNames.map((shell, i) => {
          const t = data.tubeTimes[i];
          return (
            <div
              key={i}
              className="absolute flex items-center justify-center"
              style={{ left: cx(i) - TUBE / 2, top: cy(i) - TUBE / 2, width: TUBE, height: TUBE }}
              title={`Tube ${i + 1}: ${shell ?? 'empty'}${t !== null ? ` @ ${formatTime(t)}` : ''}`}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(DND_CATALOG)) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              onDrop={(e) => onDrop(e, i)}
            >
              <div
                className={clsx(
                  'h-5 w-5 rounded-full border-2',
                  shell ? (t !== null ? 'border-amber-400 bg-amber-500/40' : 'border-rose-400/70 bg-rose-500/20') : 'border-slate-600 bg-slate-950',
                )}
              />
              <Handle
                id={`t${i}`}
                type="source"
                position={HandlePos.Top}
                className="!absolute !top-1/2 !left-1/2 !h-2.5 !w-2.5 !-translate-x-1/2 !-translate-y-1/2 !border-0 !bg-amber-300/0 hover:!bg-amber-300"
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 text-[10px] text-slate-500">
        {data.shellNames.filter(Boolean).length}/{data.shellNames.length} loaded · double-click to open
      </div>
    </div>
  );
});

export const IgniterNode = memo(function IgniterNode({ data, selected }: NodeProps<IgniterNodeT>) {
  return (
    <div
      className={clsx(
        'relative rounded-full border px-3 py-1 text-xs shadow-lg',
        data.ok ? 'bg-sky-950' : 'bg-rose-950',
        selected ? 'border-amber-400' : data.ok ? 'border-sky-500/60' : 'border-rose-500/60',
      )}
    >
      <div className="font-semibold whitespace-nowrap text-sky-100">⚡ {data.title}</div>
      <div className="whitespace-nowrap text-[10px] text-sky-300/80">{data.subtitle}</div>
      <Handle id="f" type="source" position={HandlePos.Bottom} className={clsx(handleCls, '!bg-sky-400')} />
    </div>
  );
});

export const JunctionNode = memo(function JunctionNode({ data, selected }: NodeProps<JunctionNodeT>) {
  return (
    <div className="relative flex flex-col items-center">
      <div
        className={clsx(
          'h-5 w-5 rotate-45 border-2 bg-slate-800',
          selected ? 'border-amber-400' : 'border-slate-400',
        )}
      />
      <Handle
        id="f"
        type="source"
        position={HandlePos.Top}
        className="!absolute !top-2.5 !left-1/2 !h-3 !w-3 !-translate-x-1/2 !-translate-y-1/2 !border-2 !border-slate-900 !bg-amber-400"
      />
      <span className="mt-1 text-[10px] text-slate-400">{data.label}</span>
    </div>
  );
});

export const nodeTypes = { cake: CakeNode, rack: RackNode, igniter: IgniterNode, junction: JunctionNode };

export type FuseEdgeData = { color: string; label: string };

export function FuseEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps & { data?: FuseEdgeData }) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const color = data?.color ?? '#64748b';
  return (
    <>
      <BaseEdge id={id} path={path} style={{ stroke: color, strokeWidth: selected ? 5 : 3, opacity: selected ? 1 : 0.85 }} />
      <EdgeLabelRenderer>
        <div
          className={clsx(
            'nodrag nopan pointer-events-auto absolute rounded px-1 py-px text-[10px] whitespace-nowrap',
            selected ? 'bg-amber-400 text-slate-950' : 'bg-slate-900/90 text-slate-300',
          )}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, borderLeft: `3px solid ${color}` }}
        >
          {data?.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const edgeTypes = { fuse: FuseEdge };
