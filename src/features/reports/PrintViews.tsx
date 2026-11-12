import { Fragment, useEffect } from 'react';
import { buildPositionSheets, type RackSheet } from '../../engine/chains';
import { buildCueList } from '../../engine/cues';
import { sceneChangeAt } from '../../engine/scenes';
import { positionLayout, type PositionLayout } from '../../engine/layout';
import { formatLengthIn, formatTime } from '../../lib/format';
import type { CatalogItem, PlacedItem, Show } from '../../model/schema';
import { useDerived, useShow } from '../../store/showStore';
import { useUi } from '../../store/uiStore';
import { Overview } from './Overview';
import { overviewPageCss } from './overviewPage';

/** Hidden on screen; becomes the whole page when printing. */
export function PrintView() {
  const printView = useUi((u) => u.printView);
  const setPrintView = useUi((u) => u.setPrintView);
  const overview = useUi((u) => u.overview);
  const show = useShow((s) => s);

  useEffect(() => {
    if (!printView) return;
    const done = () => setPrintView(null);
    window.addEventListener('afterprint', done);
    const t = setTimeout(() => window.print(), 150);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', done);
    };
  }, [printView, setPrintView]);

  return (
    <div className="print-root bg-white text-black">
      {printView === 'worksheet' && <Worksheet />}
      {printView === 'plan' && <ShowPlan />}
      {printView === 'overview' && (
        <>
          {/* Only while printing the overview, so the other documents keep their portrait pages. */}
          <style>{overviewPageCss(show, overview)}</style>
          <Overview options={overview} />
        </>
      )}
    </div>
  );
}

function DocHeader({ show, title }: { show: Show; title: string }) {
  return (
    <header className="mb-4 border-b-2 border-black pb-2">
      <div className="text-xs tracking-widest text-gray-500 uppercase">PatioPyro · {title}</div>
      <h1 className="text-2xl font-bold">{show.meta.name}</h1>
      <div className="text-sm text-gray-600">
        {[show.meta.date, show.meta.location, show.firing.controller.name].filter(Boolean).join(' · ')}
      </div>
    </header>
  );
}

const box = <span className="mr-2 inline-block h-3.5 w-3.5 shrink-0 translate-y-0.5 border border-black" />;

export function SiteThumb({ show, className = 'h-64 w-full' }: { show: Show; className?: string }) {
  const { siteMap: s, positions } = show;
  const pad = 4;
  // Frame the site and every position's safety circle, so nothing is cut off at the edges.
  const minX = Math.min(0, ...positions.map((p) => p.x - p.safetyRadiusFt)) - pad;
  const minY = Math.min(0, ...positions.map((p) => p.y - p.safetyRadiusFt)) - pad;
  const maxX = Math.max(s.widthFt, ...positions.map((p) => p.x + p.safetyRadiusFt)) + pad;
  const maxY = Math.max(s.heightFt, ...positions.map((p) => p.y + p.safetyRadiusFt)) + pad;
  // Text sized to the site, so labels stay readable in a small thumbnail of a big yard.
  const f = Math.max(3, Math.max(s.widthFt, s.heightFt) / 24);
  // Labels get a white outline so they stay readable over a background photo.
  const halo = { stroke: '#fff', strokeWidth: f * 0.3, strokeLinejoin: 'round', paintOrder: 'stroke' } as const;
  return (
    <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} className={className} data-testid="site-thumb">
      {s.backgroundDataUrl && (
        <image
          href={s.backgroundDataUrl}
          x={0}
          y={0}
          width={s.widthFt}
          height={s.heightFt}
          preserveAspectRatio="none"
          opacity={s.backgroundOpacity}
        />
      )}
      <rect x={0} y={0} width={s.widthFt} height={s.heightFt} fill="none" stroke="#999" strokeWidth={0.3} />
      <line x1={s.audience.x1} y1={s.audience.y1} x2={s.audience.x2} y2={s.audience.y2} stroke="#000" strokeWidth={0.6} strokeDasharray="2 1" />
      <text x={(s.audience.x1 + s.audience.x2) / 2} y={s.audience.y1 + f * 1.3} fontSize={f * 0.8} textAnchor="middle" {...halo}>
        Audience line
      </text>
      {positions.map((p) => (
        <g key={p.id}>
          <circle cx={p.x} cy={p.y} r={p.safetyRadiusFt} fill="none" stroke={p.color} strokeWidth={0.3} strokeDasharray="1 1" />
          <circle cx={p.x} cy={p.y} r={f * 0.6} fill={p.color} stroke="#fff" strokeWidth={f * 0.12} />
          <text x={p.x} y={p.y - f * 0.9} fontSize={f} textAnchor="middle" fontWeight={700} {...halo}>
            {p.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function Worksheet() {
  const show = useShow((s) => s);
  const d = useDerived();
  const sheets = buildPositionSheets(show, d.timing);
  const u = show.settings.units;
  const { totals } = d;

  return (
    <div className="mx-auto max-w-[800px] p-6 text-[13px] leading-snug">
      <DocHeader show={show} title="Setup worksheet" />

      <section className="avoid-break mb-4 grid grid-cols-2 gap-4">
        <div>
          <h2 className="mb-1 font-bold">Shopping &amp; prep</h2>
          <table className="w-full border-collapse text-xs">
            <tbody>
              {totals.fuse.map((f) => (
                <tr key={f.fuseTypeId} className="border-b border-gray-300">
                  <td className="py-0.5">{box}{f.name}</td>
                  <td className="text-right">
                    {formatLengthIn(f.totalIn, u)} ({f.rolls} roll{f.rolls === 1 ? '' : 's'})
                  </td>
                </tr>
              ))}
              <tr className="border-b border-gray-300">
                <td className="py-0.5">{box}{totals.igniters.kind === 'talon' ? 'Talon igniters' : 'E-matches'}</td>
                <td className="text-right">
                  {totals.igniters.total} ({totals.igniters.count} + {totals.igniters.spares} spare)
                </td>
              </tr>
              <tr className="border-b border-gray-300">
                <td className="py-0.5">{box}Firing modules</td>
                <td className="text-right">{show.firing.modules.length}</td>
              </tr>
              {show.supplies
                .filter((sup) => sup.qtyNeeded > 0)
                .map((sup) => (
                  <tr key={sup.id} className="border-b border-gray-300">
                    <td className="py-0.5">
                      {box}
                      {sup.name}
                    </td>
                    <td className="text-right">
                      {sup.qtyNeeded}
                      {sup.qtyOwned < sup.qtyNeeded && (
                        <span className="text-gray-500"> (buy {sup.qtyNeeded - sup.qtyOwned})</span>
                      )}
                    </td>
                  </tr>
                ))}
              <tr className="border-b border-gray-300">
                <td className="py-0.5">Cues used</td>
                <td className="text-right">
                  {totals.cues.used.length} of {totals.cues.capacity}
                </td>
              </tr>
              <tr>
                <td className="py-0.5">Show length</td>
                <td className="text-right">{formatTime(d.timing.showEndSec, 0)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-gray-500">
            Fuse totals include {formatLengthIn(show.settings.connectionAllowanceIn, u)} per run and {show.settings.fuseWastePct}% waste.
          </p>
        </div>
        <div>
          <h2 className="mb-1 font-bold">Site</h2>
          <SiteThumb show={show} />
        </div>
      </section>

      <section className="avoid-break mb-4">
        <h2 className="mb-1 font-bold">Modules</h2>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th>Module</th>
              <th>Model</th>
              <th>Position</th>
              <th>Setting</th>
              <th>Cues wired</th>
            </tr>
          </thead>
          <tbody>
            {show.firing.modules.map((m) => (
              <tr key={m.id} className="border-b border-gray-300">
                <td className="py-0.5">{box}{m.name}</td>
                <td>{m.modelName}</td>
                <td>{show.positions.find((p) => p.id === m.positionId)?.name ?? '—'}</td>
                <td>
                  {show.firing.controller.addressing === 'flat'
                    ? `Cues ${m.startCue}–${m.startCue + m.cueCount - 1}`
                    : show.firing.controller.addressing === 'channels'
                      ? `Channel ${m.bankChannels.join(' / ')}`
                      : '—'}
                  {Object.keys(m.pinOverrides).length > 0 && ` (${Object.keys(m.pinOverrides).length} remapped)`}
                </td>
                <td>
                  {totals.modules.find((x) => x.moduleId === m.id)?.used ?? 0} / {m.cueCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {sheets.map((sh) => (
        <section key={sh.position.id} className="break-before pt-2">
          <h2 className="mb-2 flex items-center gap-2 border-b border-black text-xl font-bold">
            <span className="inline-block h-4 w-4 rounded-full" style={{ background: sh.position.color }} />
            {sh.position.name}
            <span className="ml-auto text-sm font-normal text-gray-600">
              Modules: {sh.modules.map((m) => m.name).join(', ') || 'none'}
            </span>
          </h2>

          <h3 className="mt-2 font-bold">Layout</h3>
          <LayoutDiagram layout={positionLayout(show, sh.position.id, d.timing)} units={u} />

          {show.boards.some((b) => b.positionId === sh.position.id) && (
            <>
              <h3 className="mt-3 font-bold">Boards</h3>
              <ul className="text-xs">
                {show.boards
                  .filter((b) => b.positionId === sh.position.id)
                  .map((b) => {
                    const on = sh.items.filter((i) => i.placed.boardId === b.id);
                    return (
                      <li key={b.id} className="avoid-break flex py-0.5">
                        {box}
                        <span>
                          <b>{b.name}</b>: {formatLengthIn(b.widthIn, u)} wide × {formatLengthIn(b.depthIn, u)} deep
                          <span className="text-gray-500">
                            {on.length ? ` · holds ${on.map((i) => i.label).join(', ')}` : ' · nothing on it yet'}
                          </span>
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </>
          )}

          <h3 className="mt-3 font-bold">1. Place items</h3>
          <ul className="columns-2 text-xs">
            {sh.items.map(({ placed, item, label }) => (
              <li key={placed.id} className="avoid-break flex py-0.5">
                {box}
                <span>
                  {label} <span className="text-gray-500">({itemBrief(item, placed)})</span>
                  {placed.boardId && show.boards.some((b) => b.id === placed.boardId) && (
                    <span className="text-gray-500"> on {show.boards.find((b) => b.id === placed.boardId)!.name}</span>
                  )}
                  {item.kind === 'cake' && item.subCakes.length > 0 && (
                    <ol className="text-[11px] text-gray-600">
                      {item.subCakes.map((sub, i) => (
                        <li key={sub.id}>
                          ↳ {i + 1}. {sub.name}: {sub.shots} shots, +{sub.offsetSec}s for {sub.durationSec}s
                          {sub.effectNotes && ` · ${sub.effectNotes}`}
                        </li>
                      ))}
                    </ol>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {sh.racks.length > 0 && (
            <>
              <h3 className="mt-3 font-bold">2. Load and fuse racks</h3>
              {sh.racks.map((r) => (
                <div key={r.placed.id} className="avoid-break mb-2">
                  <div className="text-xs font-semibold">{sh.items.find((i) => i.placed.id === r.placed.id)?.label}</div>
                  <RackDiagram sheet={r} units={u} />
                  {r.runs.length > 0 && (
                    <div className="mt-0.5 text-[11px] text-gray-600">
                      Tube fuse:{' '}
                      {r.runs.map((run, i) => (
                        <Fragment key={i}>
                          {i > 0 && '; '}
                          {run.a + 1}→{run.b + 1} {formatLengthIn(run.lengthIn, u)} {run.fuseName}
                        </Fragment>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          <h3 className="mt-3 font-bold">{sh.racks.length ? '3' : '2'}. Fuse chains, in cue order</h3>
          {sh.chains.length === 0 && <p className="text-xs text-gray-500">No igniters at this position.</p>}
          {sh.chains.map((c) => (
            <div key={c.igniterId} className="avoid-break mb-3 border-l-4 border-gray-800 pl-2">
              <div className="font-semibold">
                {c.addressLabel} · {c.moduleName} #{c.pin}
                <span className="ml-2 font-normal text-gray-600">
                  fires at {c.cueTime !== null ? formatTime(c.cueTime) : 'no time set'}
                </span>
              </div>
              <ol className="mt-0.5 text-xs">
                {c.steps.length === 0 && <li className="text-gray-500">Igniter not connected to anything.</li>}
                {c.steps.map((s, i) => (
                  <li key={i} className="flex py-0.5">
                    {box}
                    <span>
                      <span className="mr-1 text-gray-500">{i + 1}.</span>
                      {s.kind === 'ignite' ? (
                        <>
                          Attach the {(s.fuseName ?? 'igniter').replace(/ lead$/, '').toLowerCase()} to <b>{s.to}</b>; it lights instantly
                        </>
                      ) : s.kind === 'fuse' ? (
                        <>
                          {s.from} → <b>{formatLengthIn(s.lengthIn ?? 0, u)} {s.fuseName}</b> → {s.to}
                        </>
                      ) : (
                        <>
                          {s.from} burns, then lights <b>{s.to}</b>
                        </>
                      )}
                      {s.arriveSec !== null && <span className="ml-1 text-gray-500">({formatTime(s.arriveSec)})</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
          {sh.orphanSteps.length > 0 && (
            <div className="mt-2 border border-black p-2 text-xs">
              <b>⚠ Fuse runs not connected to any igniter:</b>
              <ul>
                {sh.orphanSteps.map((s, i) => (
                  <li key={i}>
                    {s.from} → {s.kind === 'fuse' ? `${formatLengthIn(s.lengthIn ?? 0, u)} ${s.fuseName} → ` : ''}
                    {s.to}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ))}

      <section className="break-before avoid-break pt-2">
        <h2 className="mb-2 border-b border-black text-xl font-bold">Final checks</h2>
        <ul className="text-sm">
          {[
            'Every item is anchored or staked and aimed as planned',
            'All fuse runs are covered and protected from sparks and moisture',
            'Igniters are connected per the chains above, with modules disarmed',
            'Continuity check passes on every wired cue',
            'Audience is behind the audience line and the fallout area is clear',
            'Water, extinguisher and first-aid kit on hand',
            'Operators are wearing PPE',
            'Operator designated for firewatch',
            'Controller armed only when the area is clear',
          ].map((t) => (
            <li key={t} className="flex py-1">
              {box}
              {t}
            </li>
          ))}
        </ul>
        {d.issues.filter((i) => i.level !== 'info').length > 0 && (
          <div className="mt-3 border border-black p-2 text-xs">
            <b>Open warnings at print time:</b>
            <ul className="list-disc pl-4">
              {d.issues
                .filter((i) => i.level !== 'info')
                .map((i, n) => (
                  <li key={n}>{i.message}</li>
                ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function itemBrief(item: CatalogItem, placed: PlacedItem) {
  switch (item.kind) {
    case 'cake':
      return `cake, ${item.shots} shots${item.subCakes.length ? `, compound of ${item.subCakes.length}` : ''}`;
    case 'candle':
      return `roman candle, ${item.shots} shots`;
    case 'rocket':
      return 'rocket';
    case 'shell':
      return 'shell';
    case 'rack':
      return `rack, ${placed.tubes?.filter(Boolean).length ?? 0} tubes loaded`;
  }
}

/** A position as laid out on its canvas: boards, items, igniters and the fuse between them. */
function LayoutDiagram({ layout, units }: { layout: PositionLayout; units: Show['settings']['units'] }) {
  const { boards, boxes, lines, bounds } = layout;
  if (!bounds) return <p className="text-xs text-gray-500">Nothing placed at this position.</p>;
  const pad = 20;
  const vb = [bounds.x - pad, bounds.y - pad, bounds.w + pad * 2, bounds.h + pad * 2];
  const fuses = [...new Map(lines.filter((l) => !l.igniter).map((l) => [l.fuseName, l.color])).entries()];
  const dash = (name: string) => DASHES[fuses.findIndex(([n]) => n === name) % DASHES.length];
  const lead = lines.find((l) => l.igniter);
  return (
    <div className="avoid-break">
      <svg viewBox={vb.join(' ')} className="block max-h-[420px] w-full" data-testid="position-layout">
        {boards.map((b) => (
          <g key={b.id}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill="#f5efe4" stroke="#78716c" strokeWidth={2} />
            <text x={b.x + 8} y={b.y + 16} fontSize={13} fontWeight={700} fill="#57534e">
              {b.name} · {formatLengthIn(b.widthIn, units)} × {formatLengthIn(b.depthIn, units)}
            </text>
          </g>
        ))}
        {lines.map((l, i) => (
          <line
            key={i}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke={l.color}
            strokeWidth={l.igniter ? 2 : 3}
            strokeDasharray={l.igniter ? LEAD_DASH : dash(l.fuseName)}
          />
        ))}
        {boxes.map((b) => {
          if (b.kind === 'junction') {
            return (
              <g key={b.id}>
                <rect x={b.x + 3} y={b.y + 3} width={14} height={14} fill="#fff" stroke="#000" strokeWidth={1.5} transform={`rotate(45 ${b.x + 10} ${b.y + 10})`} />
                <text x={b.x + 10} y={b.y + 32} fontSize={11} textAnchor="middle">
                  {b.label}
                </text>
              </g>
            );
          }
          const igniter = b.kind === 'igniter';
          return (
            <g key={b.id}>
              <rect
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx={igniter ? b.h / 2 : 6}
                fill="#fff"
                stroke="#000"
                strokeWidth={igniter ? 1 : 1.5}
                strokeDasharray={igniter ? '4 2' : undefined}
              />
              <text x={b.x + (igniter ? b.w / 2 : 8)} y={b.y + 16} fontSize={igniter ? 12 : 13} fontWeight={700} textAnchor={igniter ? 'middle' : 'start'}>
                {igniter ? '⚡ ' : ''}
                {clip(b.label, igniter ? 14 : 24)}
              </text>
              <text x={b.x + (igniter ? b.w / 2 : 8)} y={b.y + 31} fontSize={11} fill="#4b5563" textAnchor={igniter ? 'middle' : 'start'}>
                {clip(b.detail, igniter ? 16 : 30)}
              </text>
              {b.rack &&
                b.rack.loaded.map((loaded, i) => (
                  <circle
                    key={i}
                    cx={b.x + 26 + (i % b.rack!.cols) * 26}
                    cy={b.y + 47 + Math.floor(i / b.rack!.cols) * 26}
                    r={9}
                    fill={loaded ? '#d1d5db' : '#fff'}
                    stroke="#000"
                    strokeWidth={1}
                  />
                ))}
            </g>
          );
        })}
      </svg>
      {(fuses.length > 0 || lead) && (
        <div className="mt-0.5 flex flex-wrap gap-x-4 text-[11px] text-gray-700">
          {lead && (
            <span className="inline-flex items-center gap-1">
              <svg width={26} height={6} aria-hidden>
                <line x1={0} y1={3} x2={26} y2={3} stroke={lead.color} strokeWidth={2} strokeDasharray={LEAD_DASH} />
              </svg>
              {lead.fuseName} (instant, no fuse)
            </span>
          )}
          {fuses.map(([name, color]) => (
            <span key={name} className="inline-flex items-center gap-1">
              <svg width={26} height={6} aria-hidden>
                <line x1={0} y1={3} x2={26} y2={3} stroke={color} strokeWidth={3} strokeDasharray={dash(name)} />
              </svg>
              {name}
            </span>
          ))}
          <span>Drawn as laid out on the Positions tab; boards to scale.</span>
        </div>
      )}
    </div>
  );
}

/** Igniter leads are drawn dotted so they never read as a fuse run. */
const LEAD_DASH = '1 4';

/** Dash patterns so fuse types stay distinguishable on a black-and-white printout. */
const DASHES = [undefined, '7 3', '2 2.5', '9 3 2 3'];
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Top-down rack drawing: what loads in each tube, the fuse between tubes, and where fuse joins from outside. */
function RackDiagram({ sheet, units }: { sheet: RackSheet; units: Show['settings']['units'] }) {
  const { rack, tubes, runs, links } = sheet;
  const C = 80;
  const pad = 12;
  const r = 27;
  const cx = (i: number) => pad + (i % rack.cols) * C + C / 2;
  const cy = (i: number) => pad + Math.floor(i / rack.cols) * C + C / 2;
  const w = pad * 2 + rack.cols * C;
  const h = pad * 2 + rack.rows * C;
  const fuses = [...new Map([...runs, ...links.filter((l) => !l.igniter)].map((f) => [f.fuseName, f.color])).entries()];
  const dash = (name: string) => DASHES[fuses.findIndex(([n]) => n === name) % DASHES.length];
  const letter = (n: number) => String.fromCharCode(65 + (n % 26));
  const tubeLetters = new Map<number, string>();
  links.forEach((l, n) => tubeLetters.set(l.index, (tubeLetters.get(l.index) ?? '') + letter(n)));

  return (
    <div className="avoid-break">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        style={{ width: Math.min(w * 1.1, 740), maxWidth: '100%' }}
        className="block"
        data-testid="rack-fuse-diagram"
      >
        <rect x={2} y={2} width={w - 4} height={h - 4} rx={8} fill="none" stroke="#9ca3af" />
        {runs.map((run, i) => {
          const [x1, y1, x2, y2] = [cx(run.a), cy(run.a), cx(run.b), cy(run.b)];
          const len = Math.hypot(x2 - x1, y2 - y1) || 1;
          const [ux, uy] = [(x2 - x1) / len, (y2 - y1) / len];
          const [mx, my] = [(x1 + x2) / 2, (y1 + y2) / 2];
          const s = 5;
          return (
            <g key={i}>
              <line
                x1={x1 + ux * r}
                y1={y1 + uy * r}
                x2={x2 - ux * r}
                y2={y2 - uy * r}
                stroke={run.color}
                strokeWidth={3}
                strokeDasharray={dash(run.fuseName)}
              />
              {run.directed && (
                <polygon
                  points={`${mx + ux * s},${my + uy * s} ${mx - ux * s - uy * s},${my - uy * s + ux * s} ${mx - ux * s + uy * s},${my - uy * s - ux * s}`}
                  fill="#000"
                />
              )}
            </g>
          );
        })}
        {tubes.map((t) => {
          const [x, y] = [cx(t.index), cy(t.index)];
          const letters = tubeLetters.get(t.index);
          return (
            <g key={t.index}>
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={t.shellName ? '#fff' : '#f3f4f6'}
                stroke="#000"
                strokeWidth={letters ? 2.5 : 1}
                strokeDasharray={t.shellName ? undefined : '2 2'}
              />
              <text x={x} y={y - 9} fontSize={10} fontWeight={700} textAnchor="middle">
                {t.index + 1}
              </text>
              <text x={x} y={y + 3} fontSize={6.5} textAnchor="middle">
                {t.shellName ? clip(t.shellName, 11) : 'empty'}
              </text>
              {t.startSec !== null && (
                <text x={x} y={y + 12} fontSize={7} fill="#4b5563" textAnchor="middle">
                  {formatTime(t.startSec)}
                </text>
              )}
              {letters && (
                <g>
                  <circle cx={x - r * 0.75} cy={y - r * 0.75} r={7} fill="#000" />
                  <text x={x - r * 0.75} y={y - r * 0.75 + 3} fontSize={8} fontWeight={700} fill="#fff" textAnchor="middle">
                    {letters}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-gray-700">
        {fuses.map(([name, color]) => (
          <span key={name} className="inline-flex items-center gap-1">
            <svg width={26} height={6} aria-hidden>
              <line x1={0} y1={3} x2={26} y2={3} stroke={color} strokeWidth={3} strokeDasharray={dash(name)} />
            </svg>
            {name}
          </span>
        ))}
        {runs.some((run) => run.directed) && <span>▶ direction the fire travels</span>}
        {fuses.length === 0 && <span>No fuse on this rack yet.</span>}
      </div>
      {links.length > 0 && (
        <ul className="mt-0.5 text-[11px]">
          {links.map((l, n) => (
            <li key={n} className="flex">
              {box}
              <span>
                <b>{letter(n)}</b>: tube {l.index + 1}{' '}
                {l.igniter ? (
                  <>← {l.other} (attached directly; it lights the tube instantly)</>
                ) : (
                  <>
                    {l.entering === false ? '→' : '←'} {formatLengthIn(l.lengthIn, units)} {l.fuseName}{' '}
                    {l.entering === false ? '→' : '←'} {l.other}
                  </>
                )}
                {!l.igniter && l.entering !== null && (
                  <span className="text-gray-500"> ({l.entering ? 'fire enters the rack here' : 'fire leaves the rack here'})</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ShowPlan() {
  const show = useShow((s) => s);
  const d = useDerived();
  const cues = buildCueList(show, d.timing);
  const deltas = cues.map((c, i) => {
    if (c.time === null) return null;
    const prior = cues.slice(0, i).reverse().find((p) => p.time !== null);
    return c.time - (prior?.time ?? 0);
  });

  return (
    <div className="mx-auto max-w-[800px] p-6">
      <DocHeader show={show} title="Show plan (cue sheet)" />
      <p className="mb-2 text-sm text-gray-600">
        Press each controller cue at its time. Δ is the wait since the previous cue. Show length{' '}
        {formatTime(d.timing.showEndSec, 0)}.
      </p>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-black text-left text-xs uppercase">
            <th className="py-1">✓</th>
            <th>Time</th>
            <th>Δ</th>
            <th>Cue</th>
            <th>Where / what fires</th>
          </tr>
        </thead>
        <tbody>
          {cues.map((c, i) => {
            const delta = deltas[i];
            const switchTo = c.district && cues[i - 1]?.district?.key !== c.district.key ? c.district : null;
            const sceneChange = sceneChangeAt(show.scenes, cues, i);
            return (
              <Fragment key={c.addressId}>
              {sceneChange !== undefined && (
                <tr className="avoid-break" data-testid="plan-scene">
                  <td
                    colSpan={5}
                    className="border-b-2 border-black pt-4 pb-1 pl-2 text-lg font-bold"
                    style={sceneChange ? { borderLeft: `6px solid ${sceneChange.color}` } : undefined}
                  >
                    {sceneChange ? (
                      <>
                        {sceneChange.name}{' '}
                        <span className="text-sm font-normal text-gray-600">
                          {formatTime(sceneChange.startSec)}–{formatTime(sceneChange.endSec)}
                        </span>
                      </>
                    ) : (
                      'No scene'
                    )}
                  </td>
                </tr>
              )}
              {switchTo && (
                <tr className="avoid-break">
                  <td />
                  <td colSpan={4} className="pt-2 pb-1 text-sm font-bold">
                    {i === 0 ? '▶ Start the remote on' : '↔ Switch the remote to'} {switchTo.label}
                    {switchTo.range && <span className="font-normal text-gray-600"> ({switchTo.range})</span>}
                  </td>
                </tr>
              )}
              <tr className="avoid-break border-b border-gray-400 align-top">
                <td className="py-2 pr-2">{box}</td>
                <td className="pr-3 font-mono text-xl font-bold tabular-nums">{c.time !== null ? formatTime(c.time) : '—'}</td>
                <td className="pr-3 font-mono text-sm text-gray-600 tabular-nums">{delta !== null ? `+${delta.toFixed(1)}s` : ''}</td>
                <td className="pr-3">
                  <div className="text-xl font-bold whitespace-nowrap">{c.label}</div>
                  <div className="text-[11px] text-gray-500">{c.pins.map((p) => `${p.moduleName} #${p.pin}`).join(' + ')}</div>
                  {c.district && <div className="text-[11px] font-semibold">{c.district.label}</div>}
                </td>
                <td className="text-sm">
                  <div className="font-semibold">
                    {c.positionIds.map((id) => show.positions.find((p) => p.id === id)?.name).join(' + ')}
                  </div>
                  <div className="text-gray-700">
                    {summarize(c.effects.map((e) => e.name))}
                    {c.effects.length > 0 &&
                      ` · effects ${formatTime(Math.min(...c.effects.map((e) => e.startSec)))}–${formatTime(Math.max(...c.effects.map((e) => e.endSec)))}`}
                  </div>
                  {c.note && <div className="mt-0.5 font-semibold">Note: {c.note}</div>}
                </td>
              </tr>
              </Fragment>
            );
          })}
          <tr>
            <td />
            <td className="py-2 font-mono text-xl font-bold">{formatTime(d.timing.showEndSec)}</td>
            <td />
            <td colSpan={2} className="text-lg font-bold">
              End of show
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function summarize(names: string[]) {
  const counts = new Map<string, number>();
  names.forEach((n) => counts.set(n, (counts.get(n) ?? 0) + 1));
  return [...counts].map(([n, c]) => (c > 1 ? `${c}× ${n}` : n)).join(', ') || 'Nothing connected';
}
