import clsx from 'clsx';
import { useState, type ReactNode } from 'react';
import { Badge, Button, Panel } from '../../components/ui';
import { saveShowFile } from '../../lib/file';
import { formatLengthIn, formatMoney, formatTime } from '../../lib/format';
import { useDerived, useShow } from '../../store/showStore';
import { useUi } from '../../store/uiStore';
import { exportCostCsv, exportCostXlsx } from './exports';
import { ShowPlan, Worksheet } from './PrintViews';

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-100 tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function ReportsTab() {
  const show = useShow((s) => s);
  const d = useDerived();
  const { setPrintView, setShowMode } = useUi();
  const [view, setView] = useState<'summary' | 'worksheet' | 'plan'>('summary');
  const { totals, cost, issues, timing } = d;
  const u = show.settings.units;
  const fuseTotalIn = totals.fuse.reduce((n, f) => n + f.totalIn, 0);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto flex rounded-lg border border-slate-800 p-0.5">
          {(
            [
              ['summary', 'Summary'],
              ['worksheet', 'Setup worksheet'],
              ['plan', 'Show plan'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={clsx(
                'rounded-md px-3 py-1.5 text-sm font-medium',
                view === id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Button onClick={() => setPrintView('worksheet')}>🖨 Worksheet PDF</Button>
        <Button onClick={() => setPrintView('plan')}>🖨 Show plan PDF</Button>
        <Button onClick={() => void exportCostXlsx(show, d)}>⬇ Cost spreadsheet (.xlsx)</Button>
        <Button onClick={() => exportCostCsv(show, d)}>⬇ Cost .csv</Button>
        <Button variant="ghost" onClick={() => saveShowFile(show)}>
          ⬇ Show file
        </Button>
        <Button variant="primary" onClick={() => setShowMode(true)}>
          ▶ Show mode
        </Button>
      </div>

      {view === 'worksheet' && (
        <div className="overflow-hidden rounded-xl bg-white text-black shadow-xl">
          <Worksheet />
        </div>
      )}
      {view === 'plan' && (
        <div className="overflow-hidden rounded-xl bg-white text-black shadow-xl">
          <ShowPlan />
        </div>
      )}

      {view === 'summary' && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Stat label="Show length" value={formatTime(timing.showEndSec, 0)} sub={`${timing.effects.length} effects`} />
            <Stat label="Cues used" value={totals.cues.used.length} sub={`of ${totals.cues.capacity} available`} />
            <Stat
              label={totals.igniters.kind === 'talon' ? 'Talon igniters' : 'E-matches'}
              value={totals.igniters.total}
              sub={`${totals.igniters.count} wired + ${totals.igniters.spares} spare`}
            />
            <Stat label="Fuse needed" value={formatLengthIn(fuseTotalIn, u)} sub={`${show.fuseSegments.length} runs`} />
            <Stat label="Firing modules" value={show.firing.modules.length} sub={show.firing.controller.name} />
            <Stat label="Show cost" value={formatMoney(cost.total)} sub={`Inventory value ${formatMoney(cost.inventoryValue)}`} />
          </div>

          <Panel title={`Checks (${issues.length})`}>
            {issues.length === 0 ? (
              <p className="text-sm text-emerald-400">No problems found.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm" data-testid="issues">
                {issues.map((i, n) => (
                  <li key={n} className="flex items-start gap-2">
                    <Badge tone={i.level === 'error' ? 'rose' : i.level === 'warning' ? 'amber' : 'sky'} className="mt-0.5 w-16 justify-center">
                      {i.level}
                    </Badge>
                    <span className="text-slate-300">{i.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Fuse & igniters">
              <table className="w-full text-sm" data-testid="fuse-totals">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="py-1">Type</th>
                    <th>Runs</th>
                    <th>Drawn</th>
                    <th>Needed</th>
                    <th>Rolls</th>
                    <th className="text-right">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {totals.fuse.map((f) => (
                    <tr key={f.fuseTypeId}>
                      <td className="py-1">
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: f.color }} />
                        {f.name}
                      </td>
                      <td>{f.segments}</td>
                      <td>{formatLengthIn(f.rawIn, u)}</td>
                      <td>{formatLengthIn(f.totalIn, u)}</td>
                      <td>{f.rolls}</td>
                      <td className="text-right">{formatMoney(f.rolls * f.rollCost)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-1">{totals.igniters.kind === 'talon' ? 'Talon igniters' : 'E-matches'}</td>
                    <td colSpan={3}>
                      {totals.igniters.count} wired + {totals.igniters.spares} spare
                    </td>
                    <td>{totals.igniters.total}</td>
                    <td className="text-right">{formatMoney(totals.igniters.total * show.settings.igniterUnitCost)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-xs text-slate-500">
                "Needed" adds {formatLengthIn(show.settings.connectionAllowanceIn, u)} per run for tie-ins plus{' '}
                {show.settings.fuseWastePct}% waste. Change this in Settings.
              </p>
            </Panel>

            <Panel title="Modules & cues">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="py-1">Module</th>
                    <th>Model</th>
                    <th>Position</th>
                    <th className="text-right">Cues wired</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {totals.modules.map((m) => (
                    <tr key={m.moduleId}>
                      <td className="py-1">{m.name}</td>
                      <td>{show.firing.modules.find((x) => x.id === m.moduleId)?.modelName}</td>
                      <td>{show.positions.find((p) => p.id === m.positionId)?.name ?? '—'}</td>
                      <td className="text-right">
                        {m.used} / {m.cueCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>

          <Panel title="Show cost" actions={<Badge tone="amber">{formatMoney(cost.total)}</Badge>}>
            <table className="w-full text-sm" data-testid="cost-table">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-1">Category</th>
                  <th>Item</th>
                  <th>Detail</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Unit cost</th>
                  <th className="text-right" title="Cakes and roman candles">Cost / shot</th>
                  <th className="text-right" title="Cakes and roman candles">Cost / sec</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {cost.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="py-1 text-slate-400">{l.category}</td>
                    <td>{l.name}</td>
                    <td className="text-xs text-slate-500">{l.detail}</td>
                    <td className="text-right">
                      {l.qty} <span className="text-xs text-slate-500">{l.unit}</span>
                    </td>
                    <td className="text-right">{formatMoney(l.unitCost)}</td>
                    <td className="text-right text-slate-400">{l.perShot !== null ? formatMoney(l.perShot) : '—'}</td>
                    <td className="text-right text-slate-400">{l.perSec !== null ? formatMoney(l.perSec) : '—'}</td>
                    <td className="text-right">{formatMoney(l.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {cost.subtotals.map((s) => (
                  <tr key={s.category} className="text-slate-400">
                    <td colSpan={7} className="pt-1 text-right">
                      {s.category}
                    </td>
                    <td className="text-right">{formatMoney(s.total)}</td>
                  </tr>
                ))}
                <tr className="font-semibold text-slate-100">
                  <td colSpan={7} className="pt-2 text-right">
                    Total
                  </td>
                  <td className="pt-2 text-right">{formatMoney(cost.total)}</td>
                </tr>
              </tfoot>
            </table>
            {!show.settings.includeRacksInCost && (
              <p className="mt-2 text-xs text-slate-500">
                Racks count as reusable equipment and are left out. Include them in Settings.
              </p>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
