import { Fragment, useEffect } from 'react';
import { buildPositionSheets } from '../../engine/chains';
import { buildCueList } from '../../engine/cues';
import { formatLengthIn, formatTime } from '../../lib/format';
import type { Show } from '../../model/schema';
import { useDerived, useShow } from '../../store/showStore';
import { useUi } from '../../store/uiStore';

/** Hidden on screen; becomes the whole page when printing. */
export function PrintView() {
  const printView = useUi((u) => u.printView);
  const setPrintView = useUi((u) => u.setPrintView);

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

function SiteThumb({ show }: { show: Show }) {
  const { siteMap: s, positions } = show;
  const pad = 4;
  return (
    <svg viewBox={`${-pad} ${-pad} ${s.widthFt + pad * 2} ${s.heightFt + pad * 2}`} className="h-64 w-full">
      <rect x={0} y={0} width={s.widthFt} height={s.heightFt} fill="none" stroke="#999" strokeWidth={0.3} />
      <line x1={s.audience.x1} y1={s.audience.y1} x2={s.audience.x2} y2={s.audience.y2} stroke="#000" strokeWidth={0.6} strokeDasharray="2 1" />
      <text x={(s.audience.x1 + s.audience.x2) / 2} y={s.audience.y1 + 4} fontSize={2.4} textAnchor="middle">
        Audience line
      </text>
      {positions.map((p) => (
        <g key={p.id}>
          <circle cx={p.x} cy={p.y} r={p.safetyRadiusFt} fill="none" stroke={p.color} strokeWidth={0.3} strokeDasharray="1 1" />
          <circle cx={p.x} cy={p.y} r={2} fill={p.color} />
          <text x={p.x} y={p.y - 3} fontSize={3} textAnchor="middle" fontWeight={700}>
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

          <h3 className="mt-2 font-bold">1. Place items</h3>
          <ul className="columns-2 text-xs">
            {sh.items.map(({ placed, item, label }) => (
              <li key={placed.id} className="flex py-0.5">
                {box}
                <span>
                  {label}{' '}
                  <span className="text-gray-500">
                    ({item.kind}
                    {item.kind === 'cake' ? `, ${item.shots} shots` : ''}
                    {item.kind === 'rack' ? `, ${placed.tubes?.filter(Boolean).length ?? 0} shells` : ''})
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {sh.racks.length > 0 && (
            <>
              <h3 className="mt-3 font-bold">2. Load racks</h3>
              {sh.racks.map((r) => (
                <div key={r.placed.id} className="avoid-break mb-2">
                  <div className="text-xs font-semibold">{sh.items.find((i) => i.placed.id === r.placed.id)?.label}</div>
                  <table className="border-collapse text-[10px]">
                    <tbody>
                      {Array.from({ length: r.rack.rows }, (_, row) => (
                        <tr key={row}>
                          {r.tubes
                            .filter((t) => t.row === row)
                            .map((t) => (
                              <td key={t.index} className="h-12 w-20 border border-gray-400 p-0.5 align-top">
                                <div className="font-bold">{t.index + 1}</div>
                                <div className="truncate">{t.shellName ?? '— empty —'}</div>
                                {t.startSec !== null && <div className="text-gray-500">{formatTime(t.startSec)}</div>}
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                      {s.kind === 'fuse' ? (
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
            return (
              <tr key={c.addressId} className="avoid-break border-b border-gray-400 align-top">
                <td className="py-2 pr-2">{box}</td>
                <td className="pr-3 font-mono text-xl font-bold tabular-nums">{c.time !== null ? formatTime(c.time) : '—'}</td>
                <td className="pr-3 font-mono text-sm text-gray-600 tabular-nums">{delta !== null ? `+${delta.toFixed(1)}s` : ''}</td>
                <td className="pr-3">
                  <div className="text-xl font-bold whitespace-nowrap">{c.label}</div>
                  <div className="text-[11px] text-gray-500">{c.pins.map((p) => `${p.moduleName} #${p.pin}`).join(' + ')}</div>
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
