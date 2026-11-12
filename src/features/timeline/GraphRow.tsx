import type { IntensityBin } from '../../engine/intensity';
import { formatTime } from '../../lib/format';

export const GRAPH_H = 36;
const PAD_TOP = 4;

/**
 * One compact bar graph across the timeline, sticky under the ruler: a value per time
 * bin, scaled to the busiest bin. Hovering a bin names its time range and value.
 */
export function GraphRow({
  label,
  unit,
  color,
  bins,
  value,
  format,
  top,
  headerW,
  width,
  x,
  w,
  playhead,
  onSeek,
  onHide,
  testId,
}: {
  label: string;
  unit: string;
  color: string;
  bins: IntensityBin[];
  value: (b: IntensityBin) => number;
  format: (n: number) => string;
  top: number;
  headerW: number;
  width: number;
  x: (t: number) => number;
  w: (dt: number) => number;
  playhead: number;
  onSeek: (t: number) => void;
  onHide: () => void;
  testId: string;
}) {
  const values = bins.map(value);
  const peak = Math.max(0, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const plotH = GRAPH_H - PAD_TOP - 1;
  const gap = w(bins[0]?.endSec - bins[0]?.startSec || 0) >= 6 ? 2 : 0;

  return (
    <div className="sticky z-20 flex" style={{ top, height: GRAPH_H }} data-testid={testId}>
      <div
        className="sticky left-0 z-30 flex items-center gap-2 border-r border-b border-slate-800 bg-slate-950 px-3 text-xs"
        style={{ width: headerW, minWidth: headerW }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-slate-300">
            {label} <span className="text-slate-500">{unit}</span>
          </div>
          <div className="truncate text-[10px] text-slate-500 tabular-nums">
            peak {format(peak)} · total {format(total)}
          </div>
        </div>
        <button
          type="button"
          className="rounded px-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          title={`Hide the ${label.toLowerCase()} graph`}
          aria-label={`Hide ${label} graph`}
          onClick={onHide}
        >
          ×
        </button>
      </div>
      <div
        className="relative cursor-pointer border-b border-slate-800 bg-slate-950"
        style={{ width }}
        onPointerDown={(e) => {
          e.stopPropagation();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          onSeek(Math.max(0, (e.clientX - r.left - x(0)) / (w(1) || 1)));
        }}
      >
        <svg width={width} height={GRAPH_H} className="absolute inset-0" aria-label={`${label} ${unit}`} role="img">
          {bins.map((b, i) => {
            const v = values[i];
            const h = peak > 0 ? (v / peak) * plotH : 0;
            const bx = x(b.startSec);
            const bw = Math.max(1, w(b.endSec - b.startSec) - gap);
            const r = Math.min(2, bw / 2, h);
            const y = GRAPH_H - 1 - h;
            return (
              <g key={b.startSec}>
                {h > 0 && (
                  <path
                    d={`M${bx},${GRAPH_H - 1} V${y + r} Q${bx},${y} ${bx + r},${y} H${bx + bw - r} Q${bx + bw},${y} ${bx + bw},${y + r} V${GRAPH_H - 1} Z`}
                    fill={color}
                    opacity={playhead >= b.startSec && playhead < b.endSec ? 1 : 0.8}
                  />
                )}
                {/* Full-height hit target, bigger than the bar */}
                <rect x={bx} y={0} width={bw + gap} height={GRAPH_H} fill="transparent">
                  <title>
                    {formatTime(b.startSec, 0)}–{formatTime(b.endSec, 0)}: {format(v)} {label.toLowerCase()}
                  </title>
                </rect>
              </g>
            );
          })}
          <line x1={0} x2={width} y1={GRAPH_H - 0.5} y2={GRAPH_H - 0.5} className="stroke-slate-700" />
        </svg>
        <div className="pointer-events-none absolute top-0 h-full w-px bg-rose-500" style={{ left: x(playhead) }} />
      </div>
    </div>
  );
}
