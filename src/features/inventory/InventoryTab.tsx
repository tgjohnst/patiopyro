import clsx from 'clsx';
import { Fragment, useState, type ReactNode } from 'react';
import { Badge, Button, NumberInput, Panel, TextInput } from '../../components/ui';
import {
  COLOR_CLASS,
  EFFECT_CLASS,
  TAG_CLASS,
  PIECE_NOUNS,
  assortmentStats,
  cakeAssortment,
  costPerSecond,
  costPerShot,
  itemUnitCost,
  safeHref,
  shellUnitCost,
  subCakeEndSec,
  tubeCount,
  type TubeItem,
} from '../../model/catalog';
import { uid } from '../../model/defaults';
import { LEGACY_DEFAULT_WORKSHEET_SUPPLIES } from '../../model/constants';
import type { Assortment, CatalogItem, FuseType, Supply } from '../../model/schema';
import {
  addSupplies,
  deleteAssortment,
  deleteCatalogItem,
  deleteFuseType,
  deleteSupply,
  updateSettings,
  upsertCatalogItem,
  upsertFuseType,
  upsertSupply,
} from '../../store/actions';
import { getShow, useDerived, useShow } from '../../store/showStore';
import { formatMoney, formatTime } from '../../lib/format';
import { AssortmentDialog, newAssortment } from './AssortmentDialog';
import { ItemDialog, newCatalogItem } from './ItemDialog';
import { exportInventoryCsv, exportInventoryXlsx } from './inventoryExport';

function UseBadge({ used, owned }: { used: number; owned: number }) {
  return (
    <Badge tone={used > owned ? 'rose' : used === owned && used > 0 ? 'amber' : 'slate'}>
      {used} / {owned}
    </Badge>
  );
}

function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
            {head.map((h, i) => (
              <th key={i} className="px-2 py-1.5 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">{children}</tbody>
      </table>
    </div>
  );
}

function RowActions({ item, onEdit }: { item: CatalogItem; onEdit: () => void }) {
  return (
    <td className="px-2 py-1 text-right whitespace-nowrap">
      <Button size="sm" variant="ghost" onClick={onEdit}>
        Edit
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => upsertCatalogItem({ ...item, id: uid('cat'), name: `${item.name} (copy)` })}
      >
        Duplicate
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-rose-300"
        onClick={() =>
          window.confirm(`Delete ${item.name}? Any placed copies and their fuse are removed too.`) &&
          deleteCatalogItem(item.id)
        }
      >
        Delete
      </Button>
    </td>
  );
}

const td = 'px-2 py-1.5 whitespace-nowrap';

function NotesCell({ notes }: { notes: string }) {
  return (
    <td className="max-w-64 truncate px-2 py-1.5 text-slate-400" title={notes || undefined}>
      {notes}
    </td>
  );
}

function Labels<T extends string>({ values, classes, square }: { values: T[]; classes: Record<T, string>; square?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((v) => (
        <span
          key={v}
          className={clsx(
            'px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ring-1',
            square ? 'rounded' : 'rounded-full',
            classes[v],
          )}
        >
          {v}
        </span>
      ))}
    </div>
  );
}

function NameCell({
  item,
  badge,
  onEdit,
}: {
  item: Pick<CatalogItem, 'name' | 'url'>;
  badge?: ReactNode;
  onEdit?: () => void;
}) {
  const href = safeHref(item.url);
  return (
    <td className={clsx(td, 'font-medium')}>
      {item.name}
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="ml-1.5 rounded px-0.5 text-xs text-slate-500 hover:bg-slate-800 hover:text-amber-300"
          title="Edit"
          aria-label={`Edit ${item.name}`}
        >
          ✎
        </button>
      )}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-1.5 text-xs text-sky-400 hover:text-sky-300"
          title={href}
          aria-label={`Open link for ${item.name}`}
        >
          ↗
        </a>
      )}
      {badge}
    </td>
  );
}

const money = (n: number | null) => (n === null ? '—' : formatMoney(n));

function pricingText(item: TubeItem) {
  const n = PIECE_NOUNS[item.kind];
  return item.pricing.mode === 'case'
    ? `${formatMoney(item.pricing.caseCost)} / ${n.pack} of ${item.pricing.caseQty}`
    : `Per ${n.one}`;
}

function PackUse({ item, used }: { item: TubeItem; used: number }) {
  const packs = item.pricing.mode === 'case' ? Math.round((item.qtyOwned / item.pricing.caseQty) * 10) / 10 : 0;
  return (
    <td className={td}>
      <UseBadge used={used} owned={item.qtyOwned} />
      {item.pricing.mode === 'case' && (
        <span className="ml-1 text-xs text-slate-500">
          ({packs} {PIECE_NOUNS[item.kind].pack}
          {packs === 1 ? '' : 's'})
        </span>
      )}
    </td>
  );
}

export function InventoryTab() {
  const catalog = useShow((s) => s.catalog);
  const assortments = useShow((s) => s.assortments);
  const ctx = { catalog, assortments };
  const { totals } = useDerived();
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [editingAssortment, setEditingAssortment] = useState<Assortment | null>(null);
  const used = (id: string) => totals.inventory.find((u) => u.catalogId === id)?.used ?? 0;

  const cakes = catalog.filter((c) => c.kind === 'cake');
  const candles = catalog.filter((c) => c.kind === 'candle');
  const rockets = catalog.filter((c) => c.kind === 'rocket');
  const shells = catalog.filter((c) => c.kind === 'shell');
  const racks = catalog.filter((c) => c.kind === 'rack');

  const add = (kind: CatalogItem['kind']) => setEditing(newCatalogItem(kind));

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">Inventory</h1>
        <div className="mr-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => void exportInventoryXlsx(getShow(), used)} title="Every section on its own sheet">
            ⬇ Export .xlsx
          </Button>
          <Button size="sm" variant="ghost" onClick={() => exportInventoryCsv(getShow(), used)}>
            ⬇ .csv
          </Button>
        </div>
        <Button variant="primary" onClick={() => setEditingAssortment(newAssortment())}>
          + Assortment
        </Button>
        <Button variant="primary" onClick={() => add('cake')}>
          + Cake
        </Button>
        <Button variant="primary" onClick={() => add('candle')}>
          + Roman candle
        </Button>
        <Button variant="primary" onClick={() => add('rocket')}>
          + Rocket
        </Button>
        <Button variant="primary" onClick={() => add('shell')}>
          + Shells
        </Button>
        <Button variant="primary" onClick={() => add('rack')}>
          + Rack
        </Button>
      </div>

      {assortments.length > 0 && (
        <Panel title={`Assortments (${assortments.length})`}>
          <Table head={['Name', 'Brand', 'Cost', 'Cakes', 'Shots', 'Duration', 'Cost / shot', 'Cost / sec', 'Notes', '']}>
            {assortments.map((a) => {
              const st = assortmentStats(a, catalog);
              return (
                <tr key={a.id} className="hover:bg-slate-800/30">
                  <NameCell item={a} onEdit={() => setEditingAssortment(a)} />
                  <td className={td}>{a.brand}</td>
                  <td className={td}>{formatMoney(a.cost)}</td>
                  <td className={td} title={st.cakes.map((c) => `${c.assortmentQty}× ${c.name}`).join('\n') || undefined}>
                    {st.pieces}
                  </td>
                  <td className={td}>{st.shots}</td>
                  <td className={td}>{formatTime(st.durationSec, 0)}</td>
                  <td className={td}>{money(st.perShot)}</td>
                  <td className={td}>{money(st.perSec)}</td>
                  <NotesCell notes={a.notes} />
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(newCatalogItem('cake', { assortmentId: a.id }))}>
                      + Cake
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingAssortment(a)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-300"
                      onClick={() =>
                        window.confirm(
                          `Delete ${a.name}? Its cakes are kept, each priced at its share of the assortment cost.`,
                        ) && deleteAssortment(a.id)
                      }
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              );
            })}
          </Table>
        </Panel>
      )}

      <Panel title={`Cakes (${cakes.length})`}>
        {cakes.length === 0 ? (
          <p className="text-sm text-slate-500">No cakes yet.</p>
        ) : (
          <Table
            head={['Name', 'Brand', 'Grade', 'Weight', 'Tags', 'Effects', 'Colors', 'Shots', 'Duration', 'Lead', 'Exit fuse', 'Cost', 'Cost / shot', 'Cost / sec', 'Used / owned', 'Effect', 'Notes', '']}
          >
            {cakes.map((c) => (
              <Fragment key={c.id}>
                <tr className="hover:bg-slate-800/30">
                  <NameCell
                    item={c}
                    onEdit={() => setEditing(c)}
                    badge={
                      <>
                        {c.subCakes.length > 0 && (
                          <Badge tone="sky" className="ml-1.5">
                            Compound ×{c.subCakes.length}
                          </Badge>
                        )}
                        {cakeAssortment(c, ctx) && (
                          <Badge tone="amber" className="ml-1.5">
                            {cakeAssortment(c, ctx)!.name}
                            {c.assortmentQty > 1 && ` ×${c.assortmentQty}`}
                          </Badge>
                        )}
                      </>
                    }
                  />
                  <td className={td}>{c.brand}</td>
                  <td className={td}>
                    <Badge tone={c.grade === '1.4G Pro-line' ? 'sky' : 'slate'}>{c.grade}</Badge>
                  </td>
                  <td className={td}>{c.weightClass ?? '—'}</td>
                  <td className="min-w-32 px-2 py-1.5" data-testid="cake-tags">
                    <Labels values={c.tags} classes={TAG_CLASS} />
                  </td>
                  <td className="min-w-32 px-2 py-1.5" data-testid="cake-effects">
                    <Labels values={c.effects} classes={EFFECT_CLASS} square />
                  </td>
                  <td className="min-w-24 px-2 py-1.5" data-testid="cake-colors">
                    <Labels values={c.colors} classes={COLOR_CLASS} />
                  </td>
                  <td className={td}>{c.shots}</td>
                  <td className={td}>{formatTime(c.durationSec, 0)}</td>
                  <td className={td}>{c.leadDelaySec}s</td>
                  <td className={td}>{c.hasExitFuse ? 'Yes' : '—'}</td>
                  <td className={td} title={cakeAssortment(c, ctx) ? 'Share of the assortment cost' : undefined}>
                    {formatMoney(itemUnitCost(c, ctx))}
                    {cakeAssortment(c, ctx) && <span className="ml-1 text-xs text-slate-500">share</span>}
                  </td>
                  <td className={td}>{money(costPerShot(c, ctx))}</td>
                  <td className={td}>{money(costPerSecond(c, ctx))}</td>
                  <td className={td}>
                    <UseBadge used={used(c.id)} owned={c.qtyOwned} />
                  </td>
                  <td className="max-w-64 truncate px-2 py-1.5 text-slate-400">{c.effectNotes}</td>
                  <NotesCell notes={c.notes} />
                  <RowActions item={c} onEdit={() => setEditing(c)} />
                </tr>
                {c.subCakes.map((sub, i) => (
                  <tr key={sub.id} className="bg-slate-950/40 text-xs text-slate-400" data-testid={`sub-row-${c.name}-${i + 1}`}>
                    <td className={clsx(td, 'pl-5')}>↳ {sub.name}</td>
                    <td colSpan={3} className={td}>
                      {formatTime(sub.offsetSec)}–{formatTime(subCakeEndSec(sub))} after first shot
                    </td>
                    <td className="px-2 py-1">
                      <Labels values={sub.tags} classes={TAG_CLASS} />
                    </td>
                    <td className="px-2 py-1">
                      <Labels values={sub.effects} classes={EFFECT_CLASS} square />
                    </td>
                    <td className="px-2 py-1">
                      <Labels values={sub.colors} classes={COLOR_CLASS} />
                    </td>
                    <td className={td}>{sub.shots}</td>
                    <td className={td}>{formatTime(sub.durationSec, 0)}</td>
                    <td colSpan={6} />
                    <td className="max-w-64 truncate px-2 py-1">{sub.effectNotes}</td>
                    <td colSpan={2} />
                  </tr>
                ))}
              </Fragment>
            ))}
          </Table>
        )}
      </Panel>

      <Panel title={`Roman candles (${candles.length})`}>
        {candles.length === 0 ? (
          <p className="text-sm text-slate-500">No roman candles yet. Place them on their own or load them into rack tubes.</p>
        ) : (
          <Table head={['Name', 'Brand', 'Effect', 'Shots', 'Duration', 'Lead', 'Pricing', 'Per candle', 'Cost / shot', 'Cost / sec', 'Used / owned', 'Notes', '']}>
            {candles.map((c) => (
              <tr key={c.id} className="hover:bg-slate-800/30">
                <NameCell item={c} onEdit={() => setEditing(c)} />
                <td className={td}>{c.brand}</td>
                <td className="max-w-64 truncate px-2 py-1.5 text-slate-400">{c.effect}</td>
                <td className={td}>{c.shots}</td>
                <td className={td}>{formatTime(c.durationSec, 0)}</td>
                <td className={td}>{c.leadDelaySec}s</td>
                <td className={td}>{pricingText(c)}</td>
                <td className={td}>{formatMoney(shellUnitCost(c))}</td>
                <td className={td}>{money(costPerShot(c))}</td>
                <td className={td}>{money(costPerSecond(c))}</td>
                <PackUse item={c} used={used(c.id)} />
                <NotesCell notes={c.notes} />
                <RowActions item={c} onEdit={() => setEditing(c)} />
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Panel title={`Rockets (${rockets.length})`}>
        {rockets.length === 0 ? (
          <p className="text-sm text-slate-500">No rockets yet. Place them on their own or load them into a rocket rack.</p>
        ) : (
          <Table head={['Name', 'Brand', 'Effect', 'Light→burst', 'Burst', 'Pricing', 'Per rocket', 'Used / owned', 'Notes', '']}>
            {rockets.map((r) => (
              <tr key={r.id} className="hover:bg-slate-800/30">
                <NameCell item={r} onEdit={() => setEditing(r)} />
                <td className={td}>{r.brand}</td>
                <td className="max-w-64 truncate px-2 py-1.5 text-slate-400">{r.effect}</td>
                <td className={td}>{r.leadDelaySec}s</td>
                <td className={td}>{r.burstDurationSec}s</td>
                <td className={td}>{pricingText(r)}</td>
                <td className={td}>{formatMoney(shellUnitCost(r))}</td>
                <PackUse item={r} used={used(r.id)} />
                <NotesCell notes={r.notes} />
                <RowActions item={r} onEdit={() => setEditing(r)} />
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Panel title={`Shells (${shells.length})`}>
        {shells.length === 0 ? (
          <p className="text-sm text-slate-500">No shells yet. Add single shells or bulk cases.</p>
        ) : (
          <Table head={['Name', 'Brand', 'Effect', 'Size', 'Light→burst', 'Pricing', 'Per shell', 'Used / owned', 'Notes', '']}>
            {shells.map((s) => (
              <tr key={s.id} className="hover:bg-slate-800/30">
                <NameCell item={s} onEdit={() => setEditing(s)} />
                <td className={td}>{s.brand}</td>
                <td className="max-w-64 truncate px-2 py-1.5 text-slate-400">{s.effect}</td>
                <td className={td}>{s.sizeIn}"</td>
                <td className={td}>{s.leadDelaySec}s</td>
                <td className={td}>{s.pricing.mode === 'case' ? pricingText(s) : 'Per shell'}</td>
                <td className={td}>{formatMoney(shellUnitCost(s))}</td>
                <PackUse item={s} used={used(s.id)} />
                <NotesCell notes={s.notes} />
                <RowActions item={s} onEdit={() => setEditing(s)} />
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Panel title={`Racks (${racks.length})`}>
        {racks.length === 0 ? (
          <p className="text-sm text-slate-500">No racks yet.</p>
        ) : (
          <Table head={['Name', 'Layout', 'Tubes', 'Tube size', 'Spacing', 'Cost', 'Used / owned', 'Notes', '']}>
            {racks.map((r) => (
              <tr key={r.id} className="hover:bg-slate-800/30">
                <NameCell item={r} onEdit={() => setEditing(r)} />
                <td className={td}>
                  {r.rows} × {r.cols}
                </td>
                <td className={td}>{tubeCount(r)}</td>
                <td className={td}>{r.tubeSizeIn}"</td>
                <td className={td}>{r.tubeSpacingIn}"</td>
                <td className={td}>{formatMoney(r.unitCost)}</td>
                <td className={td}>
                  <UseBadge used={used(r.id)} owned={r.qtyOwned} />
                </td>
                <NotesCell notes={r.notes} />
                <RowActions item={r} onEdit={() => setEditing(r)} />
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Supplies />

      <FuseLibrary />

      {editing && <ItemDialog initial={editing} onClose={() => setEditing(null)} />}
      {editingAssortment && (
        <AssortmentDialog initial={editingAssortment} onClose={() => setEditingAssortment(null)} />
      )}
    </div>
  );
}

const newSupply = (name = ''): Supply => ({
  id: uid('supply'),
  name,
  qtyNeeded: 1,
  qtyOwned: 0,
  unitCost: 0,
  notes: '',
  url: '',
});

/** Setup supplies: printed on the worksheet's shopping list and costed with the show. */
function Supplies() {
  const supplies = useShow((s) => s.supplies);
  const set = (sup: Supply, patch: Partial<Supply>) => upsertSupply({ ...sup, ...patch });
  const total = supplies.reduce((n, x) => n + x.unitCost * x.qtyNeeded, 0);

  return (
    <Panel
      title={`Supplies (${supplies.length})`}
      actions={
        <Button size="sm" onClick={() => upsertSupply(newSupply('New supply'))}>
          + Supply
        </Button>
      }
    >
      <p className="mb-3 text-xs text-slate-500">
        Everything else the show needs: fuse tape, stakes, boards, PPE and so on. Supplies with a quantity needed go on
        the setup worksheet&apos;s shopping list and into the show cost.
      </p>
      {supplies.length === 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          No supplies yet.
          <Button
            size="sm"
            variant="ghost"
            onClick={() => addSupplies(LEGACY_DEFAULT_WORKSHEET_SUPPLIES.map((name) => newSupply(name)))}
            title={LEGACY_DEFAULT_WORKSHEET_SUPPLIES.join('\n')}
          >
            Add common supplies
          </Button>
        </div>
      ) : (
        <Table head={['Name', 'Needed', 'Owned', 'To buy', 'Cost (each)', 'Cost for show', 'Notes', '']}>
          {supplies.map((sup) => (
            <tr key={sup.id} data-testid={`supply-${sup.name}`}>
              <td className="px-2 py-1">
                <TextInput aria-label="Supply name" value={sup.name} onChange={(name) => set(sup, { name })} className="min-w-56" />
              </td>
              <td className="w-24 px-2 py-1">
                <NumberInput aria-label="Needed" integer min={0} value={sup.qtyNeeded} onChange={(qtyNeeded) => set(sup, { qtyNeeded })} />
              </td>
              <td className="w-24 px-2 py-1">
                <NumberInput aria-label="Owned" integer min={0} value={sup.qtyOwned} onChange={(qtyOwned) => set(sup, { qtyOwned })} />
              </td>
              <td className={td}>{Math.max(0, sup.qtyNeeded - sup.qtyOwned) || '—'}</td>
              <td className="w-28 px-2 py-1">
                <NumberInput aria-label="Cost each" min={0} suffix="$" value={sup.unitCost} onChange={(unitCost) => set(sup, { unitCost })} />
              </td>
              <td className={td}>{formatMoney(sup.unitCost * sup.qtyNeeded)}</td>
              <td className="px-2 py-1">
                <TextInput aria-label="Notes" value={sup.notes} onChange={(notes) => set(sup, { notes })} className="min-w-48" />
              </td>
              <td className="px-2 py-1">
                <Button size="sm" variant="ghost" className="text-rose-300" onClick={() => deleteSupply(sup.id)}>
                  Delete
                </Button>
              </td>
            </tr>
          ))}
          <tr className="text-slate-400">
            <td colSpan={5} className="px-2 py-1.5 text-right">
              Supplies for the show
            </td>
            <td className={clsx(td, 'font-medium text-slate-200')}>{formatMoney(total)}</td>
            <td colSpan={2} />
          </tr>
        </Table>
      )}
    </Panel>
  );
}

function FuseLibrary() {
  const fuseTypes = useShow((s) => s.fuseTypes);
  const defaultId = useShow((s) => s.settings.defaultFuseTypeId);
  const units = useShow((s) => s.settings.units);
  const set = (ft: FuseType, patch: Partial<FuseType>) => upsertFuseType({ ...ft, ...patch });
  const metric = units === 'metric';

  return (
    <Panel
      title="Fuse library"
      actions={
        <Button
          size="sm"
          onClick={() =>
            upsertFuseType({
              id: uid('fuse'),
              name: 'New fuse',
              burnRateSecPerFt: 30,
              rollLengthFt: 20,
              rollCost: 6,
              color: '#38bdf8',
              notes: '',
            })
          }
        >
          + Fuse type
        </Button>
      }
    >
      <p className="mb-3 text-xs text-slate-500">
        Burn rates are typical values. Fuse varies by batch and humidity, so time a measured length
        of your own stock and enter it here. The default type is used for new fuse runs.
      </p>
      <Table
        head={[
          'Default',
          '',
          'Name',
          metric ? 'Burn rate (s/m)' : 'Burn rate (s/ft)',
          metric ? 's/cm' : 's/in',
          metric ? 'Roll (m)' : 'Roll (ft)',
          'Roll cost',
          'Notes',
          '',
        ]}
      >
        {fuseTypes.map((ft) => (
          <tr key={ft.id}>
            <td className="px-2 py-1">
              <input
                type="radio"
                className="accent-amber-500"
                checked={ft.id === defaultId}
                onChange={() => updateSettings({ defaultFuseTypeId: ft.id })}
                aria-label={`Use ${ft.name} as default`}
              />
            </td>
            <td className="px-2 py-1">
              <input
                type="color"
                value={ft.color}
                onChange={(e) => set(ft, { color: e.target.value })}
                className="h-7 w-8 cursor-pointer rounded border border-slate-700 bg-transparent"
              />
            </td>
            <td className="px-2 py-1">
              <TextInput value={ft.name} onChange={(name) => set(ft, { name })} className="min-w-40" />
            </td>
            <td className="w-32 px-2 py-1">
              <NumberInput
                min={0}
                value={metric ? Math.round((ft.burnRateSecPerFt / 0.3048) * 100) / 100 : ft.burnRateSecPerFt}
                onChange={(v) => set(ft, { burnRateSecPerFt: metric ? v * 0.3048 : v })}
              />
            </td>
            <td className="px-2 py-1 text-slate-400">
              {metric
                ? (ft.burnRateSecPerFt / 30.48).toFixed(2)
                : (ft.burnRateSecPerFt / 12).toFixed(2)}
            </td>
            <td className="w-24 px-2 py-1">
              <NumberInput
                min={0.1}
                value={metric ? Math.round(ft.rollLengthFt * 0.3048 * 10) / 10 : ft.rollLengthFt}
                onChange={(v) => set(ft, { rollLengthFt: metric ? v / 0.3048 : v })}
              />
            </td>
            <td className="w-24 px-2 py-1">
              <NumberInput min={0} suffix="$" value={ft.rollCost} onChange={(rollCost) => set(ft, { rollCost })} />
            </td>
            <td className="px-2 py-1">
              <TextInput value={ft.notes} onChange={(notes) => set(ft, { notes })} className="min-w-48" />
            </td>
            <td className="px-2 py-1">
              <Button
                size="sm"
                variant="ghost"
                className="text-rose-300"
                disabled={fuseTypes.length <= 1}
                onClick={() =>
                  window.confirm(`Delete ${ft.name}? Fuse runs using it switch to the default type.`) &&
                  deleteFuseType(ft.id)
                }
              >
                Delete
              </Button>
            </td>
          </tr>
        ))}
      </Table>
    </Panel>
  );
}
