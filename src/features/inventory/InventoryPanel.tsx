import clsx from 'clsx';
import { useState } from 'react';
import { KIND_LABEL, tubeCount } from '../../model/catalog';
import type { CatalogItem } from '../../model/schema';
import { useDerived, useShow } from '../../store/showStore';
import { DND_CATALOG, useUi } from '../../store/uiStore';

const KIND_ICON: Record<CatalogItem['kind'], string> = { cake: '▦', shell: '●', rack: '⋮⋮' };

function describe(item: CatalogItem) {
  switch (item.kind) {
    case 'cake':
      return `${item.shots} shots · ${item.durationSec}s${item.grade === '1.4G Pro-line' ? ' · Pro-line' : ''}`;
    case 'shell':
      return `${item.sizeIn}" · ${item.effect}`;
    case 'rack':
      return `${item.rows}×${item.cols} · ${tubeCount(item)} tubes`;
  }
}

/** Drag source listing inventory with remaining quantities. */
export function InventoryPanel() {
  const catalog = useShow((s) => s.catalog);
  const { totals } = useDerived();
  const tab = useUi((u) => u.tab);
  const rackOpen = useUi((u) => u.rackPlacedId !== null);
  const [q, setQ] = useState('');

  const filtered = catalog.filter((c) =>
    `${c.name} ${'brand' in c ? c.brand : ''}`.toLowerCase().includes(q.toLowerCase()),
  );
  const order: CatalogItem['kind'][] = rackOpen ? ['shell', 'cake', 'rack'] : ['cake', 'rack', 'shell'];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-slate-800 p-2">
        <input
          className="h-8 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-sm focus:border-amber-500 focus:outline-none"
          placeholder="Search inventory…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <p className="mt-2 text-[11px] leading-snug text-slate-500">
          {tab === 'site'
            ? 'Drag cakes and racks onto a position marker.'
            : 'Drag cakes and racks onto the canvas. Drag shells onto rack tubes, or into an open rack.'}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {catalog.length === 0 && (
          <p className="p-2 text-sm text-slate-500">Inventory is empty. Add items on the Inventory tab.</p>
        )}
        {order.map((kind) => {
          const items = filtered.filter((c) => c.kind === kind);
          if (!items.length) return null;
          return (
            <div key={kind} className="mb-3">
              <h4 className="mb-1 px-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                {KIND_LABEL[kind]}s
              </h4>
              <ul className="flex flex-col gap-1">
                {items.map((item) => {
                  const use = totals.inventory.find((u) => u.catalogId === item.id);
                  const left = item.qtyOwned - (use?.used ?? 0);
                  return (
                    <li
                      key={item.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DND_CATALOG, item.id);
                        e.dataTransfer.setData('text/plain', item.name);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      className="cursor-grab rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 hover:border-amber-500/60 active:cursor-grabbing"
                      data-testid={`inv-${item.name}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-4 text-center text-xs text-slate-500">{KIND_ICON[kind]}</span>
                        <span className="flex-1 truncate text-sm font-medium">{item.name}</span>
                        <span
                          className={clsx(
                            'text-xs tabular-nums',
                            left < 0 ? 'text-rose-400' : left === 0 ? 'text-slate-600' : 'text-emerald-400',
                          )}
                          title="Remaining"
                        >
                          {left}
                        </span>
                      </div>
                      <div className="truncate pl-6 text-[11px] text-slate-500">{describe(item)}</div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
