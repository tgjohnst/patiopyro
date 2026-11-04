import { useState } from 'react';
import { Button, Field, Modal, NumberInput, TextInput } from '../../components/ui';
import { assortmentStats, normalizeUrl } from '../../model/catalog';
import { uid } from '../../model/defaults';
import type { Assortment } from '../../model/schema';
import { upsertAssortment } from '../../store/actions';
import { useShow } from '../../store/showStore';
import { formatMoney, formatTime } from '../../lib/format';

export function newAssortment(): Assortment {
  return { id: uid('asst'), name: '', brand: '', cost: 0, notes: '', url: '' };
}

const money = (n: number | null) => (n === null ? '—' : formatMoney(n));

export function AssortmentDialog({ initial, onClose }: { initial: Assortment; onClose: () => void }) {
  const [a, setA] = useState(initial);
  const set = (patch: Partial<Assortment>) => setA((x) => ({ ...x, ...patch }));
  const catalog = useShow((s) => s.catalog);
  const stats = assortmentStats(a, catalog);

  const save = () => {
    upsertAssortment({ ...a, name: a.name.trim() || 'Unnamed assortment', url: normalizeUrl(a.url) });
    onClose();
  };

  return (
    <Modal
      title={`${initial.name ? 'Edit' : 'New'} assortment`}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Name" className="col-span-2">
          <TextInput autoFocus value={a.name} onChange={(name) => set({ name })} />
        </Field>
        <Field label="Brand">
          <TextInput value={a.brand} onChange={(brand) => set({ brand })} />
        </Field>
        <Field
          label="Cost (each assortment)"
          hint={[
            stats.perShot !== null && `${formatMoney(stats.perShot)} per shot`,
            stats.perSec !== null && `${formatMoney(stats.perSec)} per second`,
          ]
            .filter(Boolean)
            .join(' · ') || undefined}
        >
          <NumberInput min={0} suffix="$" value={a.cost} onChange={(cost) => set({ cost })} />
        </Field>
        <Field label="Web link" hint="Product page, retailer or video" className="col-span-2">
          <TextInput type="url" inputMode="url" placeholder="https://" value={a.url} onChange={(url) => set({ url })} />
        </Field>
        <Field label="Notes" className="col-span-2">
          <TextInput value={a.notes} onChange={(notes) => set({ notes })} />
        </Field>
        <div className="col-span-2 rounded-lg border border-slate-800 p-3 text-sm md:col-span-4" data-testid="assortment-members">
          <p className="mb-2 text-xs font-medium text-slate-400">Cakes in this assortment</p>
          {stats.cakes.length === 0 ? (
            <p className="text-xs text-slate-500">
              None yet. Add cakes and pick this assortment on each one. Shots and duration come from its cakes, so
              cost per shot and per second are worked out across the whole assortment.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1 font-medium">Cake</th>
                  <th className="py-1 font-medium">Per assortment</th>
                  <th className="py-1 font-medium">Shots</th>
                  <th className="py-1 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {stats.cakes.map((c) => (
                  <tr key={c.id}>
                    <td className="py-0.5">{c.name}</td>
                    <td className="py-0.5">×{c.assortmentQty}</td>
                    <td className="py-0.5">{c.shots}</td>
                    <td className="py-0.5">{formatTime(c.durationSec, 0)}</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-800 font-medium">
                  <td className="py-1">Total</td>
                  <td className="py-1">{stats.pieces} cakes</td>
                  <td className="py-1">{stats.shots}</td>
                  <td className="py-1">{formatTime(stats.durationSec, 0)}</td>
                </tr>
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-slate-500">
            {money(stats.perShot)} per shot · {money(stats.perSec)} per second
          </p>
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
