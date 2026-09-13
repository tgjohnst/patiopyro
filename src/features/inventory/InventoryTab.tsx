import clsx from 'clsx';
import { useState, type ReactNode } from 'react';
import { Badge, Button, NumberInput, Panel, TextInput } from '../../components/ui';
import { CATEGORY_CLASS, safeHref, shellUnitCost, tubeCount } from '../../model/catalog';
import { uid } from '../../model/defaults';
import type { Cake, CatalogItem, FuseType } from '../../model/schema';
import {
  deleteCatalogItem,
  deleteFuseType,
  updateSettings,
  upsertCatalogItem,
  upsertFuseType,
} from '../../store/actions';
import { useDerived, useShow } from '../../store/showStore';
import { formatMoney, formatTime } from '../../lib/format';
import { ItemDialog, newCatalogItem } from './ItemDialog';

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

function CategoryLabels({ categories }: { categories: Cake['categories'] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {categories.map((cat) => (
        <span
          key={cat}
          className={clsx('rounded-full px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ring-1', CATEGORY_CLASS[cat])}
        >
          {cat}
        </span>
      ))}
    </div>
  );
}

function NameCell({ item }: { item: CatalogItem }) {
  const href = safeHref(item.url);
  return (
    <td className={clsx(td, 'font-medium')}>
      {item.name}
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
    </td>
  );
}

export function InventoryTab() {
  const catalog = useShow((s) => s.catalog);
  const { totals } = useDerived();
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const used = (id: string) => totals.inventory.find((u) => u.catalogId === id)?.used ?? 0;

  const cakes = catalog.filter((c) => c.kind === 'cake');
  const shells = catalog.filter((c) => c.kind === 'shell');
  const racks = catalog.filter((c) => c.kind === 'rack');

  const add = (kind: CatalogItem['kind']) => setEditing(newCatalogItem(kind));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-semibold">Inventory</h1>
        <Button variant="primary" onClick={() => add('cake')}>
          + Cake
        </Button>
        <Button variant="primary" onClick={() => add('shell')}>
          + Shells
        </Button>
        <Button variant="primary" onClick={() => add('rack')}>
          + Rack
        </Button>
      </div>

      <Panel title={`Cakes (${cakes.length})`}>
        {cakes.length === 0 ? (
          <p className="text-sm text-slate-500">No cakes yet.</p>
        ) : (
          <Table head={['Name', 'Brand', 'Grade', 'Weight', 'Categories', 'Shots', 'Duration', 'Lead', 'Exit fuse', 'Cost', 'Used / owned', 'Effect', 'Notes', '']}>
            {cakes.map((c) => (
              <tr key={c.id} className="hover:bg-slate-800/30">
                <NameCell item={c} />
                <td className={td}>{c.brand}</td>
                <td className={td}>
                  <Badge tone={c.grade === '1.4G Pro-line' ? 'sky' : 'slate'}>{c.grade}</Badge>
                </td>
                <td className={td}>{c.weightClass ?? '—'}</td>
                <td className="min-w-40 px-2 py-1.5">
                  <CategoryLabels categories={c.categories} />
                </td>
                <td className={td}>{c.shots}</td>
                <td className={td}>{formatTime(c.durationSec, 0)}</td>
                <td className={td}>{c.leadDelaySec}s</td>
                <td className={td}>{c.hasExitFuse ? 'Yes' : '—'}</td>
                <td className={td}>{formatMoney(c.unitCost)}</td>
                <td className={td}>
                  <UseBadge used={used(c.id)} owned={c.qtyOwned} />
                </td>
                <td className="max-w-64 truncate px-2 py-1.5 text-slate-400">{c.effectNotes}</td>
                <NotesCell notes={c.notes} />
                <RowActions item={c} onEdit={() => setEditing(c)} />
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
                <NameCell item={s} />
                <td className={td}>{s.brand}</td>
                <td className="max-w-64 truncate px-2 py-1.5 text-slate-400">{s.effect}</td>
                <td className={td}>{s.sizeIn}"</td>
                <td className={td}>{s.leadDelaySec}s</td>
                <td className={td}>
                  {s.pricing.mode === 'case'
                    ? `${formatMoney(s.pricing.caseCost)} / case of ${s.pricing.caseQty}`
                    : 'Per shell'}
                </td>
                <td className={td}>{formatMoney(shellUnitCost(s))}</td>
                <td className={td}>
                  <UseBadge used={used(s.id)} owned={s.qtyOwned} />
                  {s.pricing.mode === 'case' && (
                    <span className="ml-1 text-xs text-slate-500">
                      ({Math.round((s.qtyOwned / s.pricing.caseQty) * 10) / 10} cases)
                    </span>
                  )}
                </td>
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
                <NameCell item={r} />
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

      <FuseLibrary />

      {editing && <ItemDialog initial={editing} onClose={() => setEditing(null)} />}
    </div>
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
