import clsx from 'clsx';
import { useRef, useState, type PointerEvent as ReactPointerEvent, type DragEvent } from 'react';
import { Badge, Button, Field, NumberInput, Panel, TextInput } from '../../components/ui';
import { pickFile, readAsDataUrl } from '../../lib/file';
import { MAX_POSITIONS } from '../../model/defaults';
import type { Position } from '../../model/schema';
import {
  addPosition,
  deletePosition,
  placeItem,
  updatePosition,
  updateSiteMap,
} from '../../store/actions';
import { getShow, useShow } from '../../store/showStore';
import { DND_CATALOG, useUi } from '../../store/uiStore';

type Drag =
  | { kind: 'pos'; id: string; x: number; y: number }
  | { kind: 'aud'; end: 1 | 2; x: number; y: number }
  | null;

function nearestOnSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2)) : 0;
  return { x: x1 + t * dx, y: y1 + t * dy };
}

function dropCatalog(e: DragEvent, positionId: string) {
  const catalogId = e.dataTransfer.getData(DND_CATALOG);
  if (!catalogId) return;
  e.preventDefault();
  const item = getShow().catalog.find((c) => c.id === catalogId);
  if (item?.kind === 'shell') {
    window.alert('Shells go into rack tubes. Place a rack, then open it on the Positions tab.');
    return;
  }
  placeItem(catalogId, positionId);
}

const allowCatalogDrop = (e: DragEvent) => {
  if (e.dataTransfer.types.includes(DND_CATALOG)) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
};

export function SiteMapTab() {
  const site = useShow((s) => s.siteMap);
  const positions = useShow((s) => s.positions);
  const placed = useShow((s) => s.placed);
  const catalog = useShow((s) => s.catalog);
  const modules = useShow((s) => s.firing.modules);
  const { setTab, setPositionId } = useUi();
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [hoverDrop, setHoverDrop] = useState<string | null>(null);

  const pad = 6;
  const toSite = (e: ReactPointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return {
      x: Math.round(Math.max(0, Math.min(site.widthFt, p.x)) * 2) / 2,
      y: Math.round(Math.max(0, Math.min(site.heightFt, p.y)) * 2) / 2,
    };
  };

  const onMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    setDrag({ ...drag, ...toSite(e) });
  };
  const onUp = () => {
    if (!drag) return;
    if (drag.kind === 'pos') updatePosition(drag.id, { x: drag.x, y: drag.y });
    else {
      const a = { ...site.audience };
      if (drag.end === 1) Object.assign(a, { x1: drag.x, y1: drag.y });
      else Object.assign(a, { x2: drag.x, y2: drag.y });
      updateSiteMap({ audience: a });
    }
    setDrag(null);
  };

  const posXY = (p: Position) => (drag?.kind === 'pos' && drag.id === p.id ? drag : p);
  const aud = { ...site.audience };
  if (drag?.kind === 'aud') {
    if (drag.end === 1) Object.assign(aud, { x1: drag.x, y1: drag.y });
    else Object.assign(aud, { x2: drag.x, y2: drag.y });
  }

  const grid: number[] = [];
  for (let v = 0; v <= Math.max(site.widthFt, site.heightFt); v += 5) grid.push(v);
  const fontSize = Math.max(site.widthFt, site.heightFt) / 60;

  const counts = (posId: string) => {
    const items = placed.filter((p) => p.positionId === posId);
    const kindOf = (catalogId: string) => catalog.find((c) => c.id === catalogId)?.kind;
    const cakes = items.filter((p) => kindOf(p.catalogId) === 'cake').length;
    const racks = items.filter((p) => kindOf(p.catalogId) === 'rack').length;
    const singles = items.length - cakes - racks;
    const loaded = items.reduce((n, p) => n + (p.tubes?.filter(Boolean).length ?? 0), 0);
    return { cakes, racks, singles, loaded, modules: modules.filter((m) => m.positionId === posId).length };
  };

  const openPosition = (id: string) => {
    setPositionId(id);
    setTab('positions');
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 lg:flex-row">
      <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
        <svg
          ref={svgRef}
          data-testid="site-map"
          className="h-full w-full touch-none select-none"
          viewBox={`${-pad} ${-pad} ${site.widthFt + pad * 2} ${site.heightFt + pad * 2}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        >
          <rect x={0} y={0} width={site.widthFt} height={site.heightFt} fill="#0b1120" stroke="#334155" strokeWidth={0.2} />
          {site.backgroundDataUrl && (
            <image
              href={site.backgroundDataUrl}
              x={0}
              y={0}
              width={site.widthFt}
              height={site.heightFt}
              preserveAspectRatio="none"
              opacity={site.backgroundOpacity}
            />
          )}
          {grid.map((v) => (
            <g key={v}>
              {v <= site.widthFt && (
                <line x1={v} y1={0} x2={v} y2={site.heightFt} stroke="#1e293b" strokeWidth={v % 10 === 0 ? 0.15 : 0.06} />
              )}
              {v <= site.heightFt && (
                <line x1={0} y1={v} x2={site.widthFt} y2={v} stroke="#1e293b" strokeWidth={v % 10 === 0 ? 0.15 : 0.06} />
              )}
              {v % 10 === 0 && v <= site.widthFt && (
                <text x={v} y={-1.5} fontSize={fontSize} fill="#475569" textAnchor="middle">
                  {v}
                </text>
              )}
              {v % 10 === 0 && v <= site.heightFt && (
                <text x={-1.5} y={v + fontSize / 3} fontSize={fontSize} fill="#475569" textAnchor="end">
                  {v}
                </text>
              )}
            </g>
          ))}
          <text x={site.widthFt} y={site.heightFt + fontSize * 2} fontSize={fontSize} fill="#475569" textAnchor="end">
            feet
          </text>

          {/* Audience line */}
          <line x1={aud.x1} y1={aud.y1} x2={aud.x2} y2={aud.y2} stroke="#38bdf8" strokeWidth={0.6} strokeDasharray="2 1" />
          <text
            x={(aud.x1 + aud.x2) / 2}
            y={(aud.y1 + aud.y2) / 2 + fontSize * 1.8}
            fontSize={fontSize * 1.1}
            fill="#38bdf8"
            textAnchor="middle"
          >
            Audience line
          </text>
          {([1, 2] as const).map((end) => (
            <circle
              key={end}
              cx={end === 1 ? aud.x1 : aud.x2}
              cy={end === 1 ? aud.y1 : aud.y2}
              r={1.4}
              fill="#0ea5e9"
              className="cursor-move"
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture?.(e.pointerId);
                setDrag({ kind: 'aud', end, ...toSite(e) });
              }}
            />
          ))}

          {positions.map((p) => {
            const { x, y } = posXY(p);
            const near = nearestOnSegment(x, y, aud.x1, aud.y1, aud.x2, aud.y2);
            const dist = Math.hypot(x - near.x, y - near.y);
            const unsafe = dist < p.safetyRadiusFt;
            return (
              <g key={p.id}>
                <circle cx={x} cy={y} r={p.safetyRadiusFt} fill={p.color} fillOpacity={0.06} stroke={p.color} strokeOpacity={0.4} strokeWidth={0.25} strokeDasharray="1 1" />
                <line x1={x} y1={y} x2={near.x} y2={near.y} stroke={unsafe ? '#f43f5e' : '#64748b'} strokeWidth={0.2} strokeDasharray="0.8 0.8" />
                <text
                  x={(x + near.x) / 2 + 1}
                  y={(y + near.y) / 2}
                  fontSize={fontSize}
                  fill={unsafe ? '#fb7185' : '#94a3b8'}
                >
                  {dist.toFixed(0)} ft
                </text>
              </g>
            );
          })}
          {positions.map((p) => {
            const { x, y } = posXY(p);
            const c = counts(p.id);
            return (
              <g
                key={p.id}
                data-testid={`site-pos-${p.name}`}
                className="cursor-move"
                onPointerDown={(e) => {
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  setDrag({ kind: 'pos', id: p.id, x: p.x, y: p.y });
                }}
                onDoubleClick={() => openPosition(p.id)}
                onDragOver={(e) => {
                  allowCatalogDrop(e);
                  setHoverDrop(p.id);
                }}
                onDragLeave={() => setHoverDrop(null)}
                onDrop={(e) => {
                  setHoverDrop(null);
                  dropCatalog(e, p.id);
                }}
              >
                <circle cx={x} cy={y} r={hoverDrop === p.id ? 5 : 3.5} fill={p.color} stroke="#0f172a" strokeWidth={0.5} />
                <text x={x} y={y - 5} fontSize={fontSize * 1.3} fill="#f1f5f9" textAnchor="middle" fontWeight={600}>
                  {p.name}
                </text>
                <text x={x} y={y + 6.5} fontSize={fontSize * 0.9} fill="#94a3b8" textAnchor="middle">
                  {c.cakes} cakes · {c.racks} racks · {c.modules} mod
                </text>
              </g>
            );
          })}
        </svg>
        <div className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-slate-500">
          Drag positions and the audience line ends. Double-click a position to open it. Drop inventory on a position to place it.
        </div>
      </div>

      <div className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto lg:w-80">
        <Panel
          title={`Positions (${positions.length}/${MAX_POSITIONS})`}
          actions={
            <Button size="sm" onClick={addPosition} disabled={positions.length >= MAX_POSITIONS}>
              + Position
            </Button>
          }
        >
          <div className="flex flex-col gap-3">
            {positions.map((p) => {
              const c = counts(p.id);
              return (
                <div
                  key={p.id}
                  className={clsx(
                    'rounded-lg border bg-slate-900 p-3',
                    hoverDrop === p.id ? 'border-amber-500' : 'border-slate-800',
                  )}
                  onDragOver={(e) => {
                    allowCatalogDrop(e);
                    setHoverDrop(p.id);
                  }}
                  onDragLeave={() => setHoverDrop(null)}
                  onDrop={(e) => {
                    setHoverDrop(null);
                    dropCatalog(e, p.id);
                  }}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <input
                      type="color"
                      value={p.color}
                      onChange={(e) => updatePosition(p.id, { color: e.target.value })}
                      className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent"
                    />
                    <TextInput value={p.name} onChange={(name) => updatePosition(p.id, { name })} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="X (ft)">
                      <NumberInput value={p.x} min={0} max={site.widthFt} onChange={(x) => updatePosition(p.id, { x })} />
                    </Field>
                    <Field label="Y (ft)">
                      <NumberInput value={p.y} min={0} max={site.heightFt} onChange={(y) => updatePosition(p.id, { y })} />
                    </Field>
                    <Field label="Radius">
                      <NumberInput
                        value={p.safetyRadiusFt}
                        min={0}
                        onChange={(safetyRadiusFt) => updatePosition(p.id, { safetyRadiusFt })}
                      />
                    </Field>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge>{c.cakes} cakes</Badge>
                    <Badge>{c.racks} racks</Badge>
                    {c.singles > 0 && <Badge>{c.singles} rockets &amp; candles</Badge>}
                    <Badge>{c.loaded} tubes loaded</Badge>
                    <Badge tone="sky">{c.modules} modules</Badge>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="primary" onClick={() => openPosition(p.id)}>
                      Open layout
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-300"
                      disabled={positions.length <= 1}
                      onClick={() =>
                        window.confirm(`Delete ${p.name} and everything placed there?`) && deletePosition(p.id)
                      }
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            Safety radius is yours to set: follow the product labels, local rules and your site. PatioPyro
            flags positions whose radius reaches the audience line.
          </p>
        </Panel>

        <Panel title="Site">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Width (ft)">
              <NumberInput value={site.widthFt} min={10} max={2000} onChange={(widthFt) => updateSiteMap({ widthFt })} />
            </Field>
            <Field label="Depth (ft)">
              <NumberInput value={site.heightFt} min={10} max={2000} onChange={(heightFt) => updateSiteMap({ heightFt })} />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={async () => {
                const f = await pickFile('image/*');
                if (f) updateSiteMap({ backgroundDataUrl: await readAsDataUrl(f) });
              }}
            >
              {site.backgroundDataUrl ? 'Replace' : 'Add'} background image
            </Button>
            {site.backgroundDataUrl && (
              <Button size="sm" variant="ghost" onClick={() => updateSiteMap({ backgroundDataUrl: null })}>
                Remove
              </Button>
            )}
          </div>
          {site.backgroundDataUrl && (
            <Field label="Image opacity" className="mt-2">
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={site.backgroundOpacity}
                onChange={(e) => updateSiteMap({ backgroundOpacity: Number(e.target.value) })}
                className="accent-amber-500"
              />
            </Field>
          )}
          <p className="mt-2 text-[11px] text-slate-500">
            The image is stretched to the site width and depth. Set those to the real size of the area it shows.
          </p>
        </Panel>
      </div>
    </div>
  );
}
