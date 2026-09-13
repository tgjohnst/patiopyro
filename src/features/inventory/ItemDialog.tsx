import clsx from 'clsx';
import { useState } from 'react';
import { Button, Checkbox, Field, Modal, NumberInput, Select, TextInput } from '../../components/ui';
import { CATEGORY_CLASS, normalizeUrl, shellUnitCost, tubeCount } from '../../model/catalog';
import { CAKE_CATEGORIES, CAKE_WEIGHT_CLASSES } from '../../model/constants';
import { uid } from '../../model/defaults';
import type { Cake, CatalogItem, Rack, Shell } from '../../model/schema';
import { upsertCatalogItem } from '../../store/actions';
import { formatMoney } from '../../lib/format';

export function newCatalogItem(kind: CatalogItem['kind']): CatalogItem {
  const base = { id: uid('cat'), name: '', qtyOwned: 1, notes: '', url: '' };
  switch (kind) {
    case 'cake':
      return {
        ...base,
        kind,
        brand: '',
        shots: 25,
        durationSec: 25,
        effectNotes: '',
        grade: '1.4G',
        unitCost: 0,
        leadDelaySec: 4,
        hasExitFuse: true,
        weightClass: null,
        categories: [],
      } satisfies Cake;
    case 'shell':
      return {
        ...base,
        qtyOwned: 24,
        kind,
        brand: '',
        effect: '',
        sizeIn: 1.75,
        leadDelaySec: 3,
        burstDurationSec: 3,
        pricing: { mode: 'case', caseQty: 24, caseCost: 0 },
      } satisfies Shell;
    case 'rack':
      return {
        ...base,
        kind,
        rows: 1,
        cols: 6,
        tubeSizeIn: 1.75,
        tubeSpacingIn: 2.5,
        unitCost: 0,
      } satisfies Rack;
  }
}

export function ItemDialog({ initial, onClose }: { initial: CatalogItem; onClose: () => void }) {
  const [item, setItem] = useState<CatalogItem>(initial);
  const set = (patch: Partial<Cake> | Partial<Shell> | Partial<Rack>) =>
    setItem((i) => ({ ...i, ...patch }) as CatalogItem);
  const title = `${initial.name ? 'Edit' : 'New'} ${item.kind}`;

  const save = () => {
    upsertCatalogItem({
      ...item,
      name: item.name.trim() || `Unnamed ${item.kind}`,
      url: normalizeUrl(item.url),
    });
    onClose();
  };

  return (
    <Modal
      title={title}
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
          <TextInput autoFocus value={item.name} onChange={(name) => set({ name })} />
        </Field>

        {item.kind === 'cake' && (
          <>
            <Field label="Brand">
              <TextInput value={item.brand} onChange={(brand) => set({ brand })} />
            </Field>
            <Field label="Grade">
              <Select
                value={item.grade}
                onChange={(g) => set({ grade: g as Cake['grade'] })}
                options={[
                  { value: '1.4G', label: '1.4G consumer' },
                  { value: '1.4G Pro-line', label: '1.4G Pro-line' },
                ]}
              />
            </Field>
            <Field label="Weight class" hint="Net explosive weight">
              <Select
                value={item.weightClass ?? ''}
                onChange={(v) => set({ weightClass: (v || null) as Cake['weightClass'] })}
                options={[
                  { value: '', label: 'Unclassified' },
                  ...CAKE_WEIGHT_CLASSES.map((w) => ({ value: w, label: w })),
                ]}
              />
            </Field>
            <Field label="Shots">
              <NumberInput integer min={0} value={item.shots} onChange={(shots) => set({ shots })} />
            </Field>
            <Field label="Duration">
              <NumberInput min={0} suffix="s" value={item.durationSec} onChange={(durationSec) => set({ durationSec })} />
            </Field>
            <Field label="Lead fuse delay" hint="Light to first shot">
              <NumberInput min={0} suffix="s" value={item.leadDelaySec} onChange={(leadDelaySec) => set({ leadDelaySec })} />
            </Field>
            <Field label="Cost (each)">
              <NumberInput min={0} suffix="$" value={item.unitCost} onChange={(unitCost) => set({ unitCost })} />
            </Field>
            <Field label="Effect notes" className="col-span-2 md:col-span-3">
              <TextInput value={item.effectNotes} onChange={(effectNotes) => set({ effectNotes })} />
            </Field>
            <div className="flex items-end pb-1.5">
              <Checkbox
                label="Has exit fuse"
                checked={item.hasExitFuse}
                onChange={(hasExitFuse) => set({ hasExitFuse })}
              />
            </div>
            <fieldset className="col-span-2 flex flex-col gap-1 text-xs md:col-span-4">
              <legend className="mb-1 font-medium text-slate-400">Categories</legend>
              <div className="flex flex-wrap gap-1.5">
                {CAKE_CATEGORIES.map((cat) => {
                  const on = item.categories.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        set({
                          categories: on
                            ? item.categories.filter((c) => c !== cat)
                            : CAKE_CATEGORIES.filter((c) => c === cat || item.categories.includes(c)),
                        })
                      }
                      className={clsx(
                        'rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors',
                        on ? CATEGORY_CLASS[cat] : 'bg-transparent text-slate-500 ring-slate-700 hover:text-slate-300',
                      )}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </>
        )}

        {item.kind === 'shell' && (
          <>
            <Field label="Brand">
              <TextInput value={item.brand} onChange={(brand) => set({ brand })} />
            </Field>
            <Field label="Size">
              <NumberInput min={0} suffix="in" value={item.sizeIn} onChange={(sizeIn) => set({ sizeIn })} />
            </Field>
            <Field label="Effect" className="col-span-2">
              <TextInput value={item.effect} onChange={(effect) => set({ effect })} />
            </Field>
            <Field label="Light to burst" hint="Lead fuse + lift">
              <NumberInput min={0} suffix="s" value={item.leadDelaySec} onChange={(leadDelaySec) => set({ leadDelaySec })} />
            </Field>
            <Field label="Burst duration">
              <NumberInput
                min={0}
                suffix="s"
                value={item.burstDurationSec}
                onChange={(burstDurationSec) => set({ burstDurationSec })}
              />
            </Field>
            <Field label="Pricing">
              <Select
                value={item.pricing.mode}
                onChange={(mode) =>
                  set({
                    pricing:
                      mode === 'unit'
                        ? { mode: 'unit', unitCost: shellUnitCost(item) }
                        : { mode: 'case', caseQty: 24, caseCost: shellUnitCost(item) * 24 },
                  })
                }
                options={[
                  { value: 'case', label: 'By the case' },
                  { value: 'unit', label: 'Per shell' },
                ]}
              />
            </Field>
            {item.pricing.mode === 'unit' ? (
              <Field label="Cost (each)">
                <NumberInput
                  min={0}
                  suffix="$"
                  value={item.pricing.unitCost}
                  onChange={(unitCost) => set({ pricing: { mode: 'unit', unitCost } })}
                />
              </Field>
            ) : (
              <>
                <Field label="Shells per case">
                  <NumberInput
                    integer
                    min={1}
                    value={item.pricing.caseQty}
                    onChange={(caseQty) =>
                      item.pricing.mode === 'case' && set({ pricing: { ...item.pricing, caseQty } })
                    }
                  />
                </Field>
                <Field label="Case cost" hint={`${formatMoney(shellUnitCost(item))} per shell`}>
                  <NumberInput
                    min={0}
                    suffix="$"
                    value={item.pricing.caseCost}
                    onChange={(caseCost) =>
                      item.pricing.mode === 'case' && set({ pricing: { ...item.pricing, caseCost } })
                    }
                  />
                </Field>
                <Field label="Cases owned" hint="Sets shells owned">
                  <NumberInput
                    min={0}
                    value={Math.round((item.qtyOwned / item.pricing.caseQty) * 100) / 100}
                    onChange={(cases) =>
                      item.pricing.mode === 'case' &&
                      set({ qtyOwned: Math.round(cases * item.pricing.caseQty) })
                    }
                  />
                </Field>
              </>
            )}
          </>
        )}

        {item.kind === 'rack' && (
          <>
            <Field label="Rows">
              <NumberInput integer min={1} max={20} value={item.rows} onChange={(rows) => set({ rows })} />
            </Field>
            <Field label="Tubes per row" hint={`${tubeCount(item)} tubes total`}>
              <NumberInput integer min={1} max={30} value={item.cols} onChange={(cols) => set({ cols })} />
            </Field>
            <Field label="Tube size">
              <NumberInput min={0} suffix="in" value={item.tubeSizeIn} onChange={(tubeSizeIn) => set({ tubeSizeIn })} />
            </Field>
            <Field label="Tube spacing" hint="Default fuse length between tubes">
              <NumberInput min={0} suffix="in" value={item.tubeSpacingIn} onChange={(tubeSpacingIn) => set({ tubeSpacingIn })} />
            </Field>
            <Field label="Cost (each)">
              <NumberInput min={0} suffix="$" value={item.unitCost} onChange={(unitCost) => set({ unitCost })} />
            </Field>
          </>
        )}

        <Field label={item.kind === 'shell' ? 'Shells owned' : 'Quantity owned'}>
          <NumberInput integer min={0} value={item.qtyOwned} onChange={(qtyOwned) => set({ qtyOwned })} />
        </Field>
        <Field label="Web link" hint="Product page, retailer or video" className="col-span-2 md:col-span-3">
          <TextInput
            type="url"
            inputMode="url"
            placeholder="https://"
            value={item.url}
            onChange={(url) => set({ url })}
          />
        </Field>
        <Field label="Notes" className="col-span-2 md:col-span-4">
          <TextInput value={item.notes} onChange={(notes) => set({ notes })} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
