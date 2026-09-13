import clsx from 'clsx';
import { useState } from 'react';
import { Button, Checkbox, Field, Modal, NumberInput, Select, TextInput } from '../../components/ui';
import {
  CATEGORY_CLASS,
  KIND_LABEL,
  PIECE_NOUNS,
  costPerSecond,
  costPerShot,
  isCompound,
  normalizeCake,
  normalizeUrl,
  sequenceSubCakes,
  shellUnitCost,
  subCakeEndSec,
  tubeCount,
  type CakeCategory,
} from '../../model/catalog';
import { CAKE_CATEGORIES, CAKE_WEIGHT_CLASSES } from '../../model/constants';
import { uid } from '../../model/defaults';
import type { Cake, Candle, CatalogItem, Rack, Rocket, Shell, SubCake } from '../../model/schema';
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
        subCakes: [],
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
    case 'rocket':
      return {
        ...base,
        qtyOwned: 12,
        kind,
        brand: '',
        effect: '',
        leadDelaySec: 3,
        burstDurationSec: 2,
        pricing: { mode: 'case', caseQty: 12, caseCost: 0 },
      } satisfies Rocket;
    case 'candle':
      return {
        ...base,
        qtyOwned: 6,
        kind,
        brand: '',
        effect: '',
        shots: 10,
        durationSec: 15,
        leadDelaySec: 3,
        pricing: { mode: 'case', caseQty: 6, caseCost: 0 },
      } satisfies Candle;
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

type Patch = Partial<Cake> | Partial<Shell> | Partial<Rocket> | Partial<Candle> | Partial<Rack>;

function costHint(item: CatalogItem): string | undefined {
  const shot = costPerShot(item);
  const sec = costPerSecond(item);
  const parts = [shot !== null && `${formatMoney(shot)} per shot`, sec !== null && `${formatMoney(sec)} per second`];
  return parts.filter(Boolean).join(' · ') || undefined;
}

function CategoryPicker({
  legend,
  value,
  onChange,
  small,
}: {
  legend: string;
  value: CakeCategory[];
  onChange: (categories: CakeCategory[]) => void;
  small?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-1 text-xs">
      <legend className="mb-1 font-medium text-slate-400">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {CAKE_CATEGORIES.map((cat) => {
          const on = value.includes(cat);
          return (
            <button
              key={cat}
              type="button"
              aria-pressed={on}
              onClick={() =>
                onChange(on ? value.filter((c) => c !== cat) : CAKE_CATEGORIES.filter((c) => c === cat || value.includes(c)))
              }
              className={clsx(
                'rounded-full font-medium ring-1 transition-colors',
                small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
                on ? CATEGORY_CLASS[cat] : 'bg-transparent text-slate-500 ring-slate-700 hover:text-slate-300',
              )}
            >
              {cat}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Breaks a compound cake into its fused sub cakes. */
function SubCakesEditor({ cake, onChange }: { cake: Cake; onChange: (subCakes: SubCake[]) => void }) {
  const subs = cake.subCakes;
  const update = (i: number, patch: Partial<SubCake>) =>
    onChange(subs.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...subs];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  const add = () => {
    const last = subs[subs.length - 1];
    onChange([
      ...subs,
      // The first sub cake starts from the cake as entered so far.
      {
        id: uid('sub'),
        name: `Sub cake ${subs.length + 1}`,
        shots: last ? 25 : cake.shots,
        offsetSec: last ? subCakeEndSec(last) : 0,
        durationSec: last ? 20 : cake.durationSec,
        effectNotes: last ? '' : cake.effectNotes,
        categories: last ? [] : cake.categories,
      },
    ]);
  };

  return (
    <fieldset
      className="col-span-2 flex flex-col gap-2 rounded-lg border border-slate-800 p-3 md:col-span-4"
      data-testid="sub-cakes"
    >
      <legend className="px-1 text-xs font-medium text-slate-400">Compound cake</legend>
      <p className="text-[11px] text-slate-500">
        {subs.length
          ? 'Shots and duration come from the sub cakes. Start times are seconds after the first shot.'
          : 'A compound cake is several cakes fused together on one lead fuse. Add each sub cake to break it down.'}
      </p>
      {subs.map((sub, i) => (
        <div
          key={sub.id}
          className="flex flex-col gap-2 rounded-md border border-slate-800 bg-slate-950/60 p-2"
          data-testid={`sub-cake-${i + 1}`}
        >
          <div className="grid grid-cols-2 items-end gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <Field label="Sub cake name">
              <TextInput value={sub.name} onChange={(name) => update(i, { name })} />
            </Field>
            <Field label="Shots">
              <NumberInput integer min={0} value={sub.shots} onChange={(shots) => update(i, { shots })} />
            </Field>
            <Field label="Starts at">
              <NumberInput min={0} suffix="s" value={sub.offsetSec} onChange={(offsetSec) => update(i, { offsetSec })} />
            </Field>
            <Field label="Duration">
              <NumberInput
                min={0}
                suffix="s"
                value={sub.durationSec}
                onChange={(durationSec) => update(i, { durationSec })}
              />
            </Field>
            <div className="flex gap-0.5 pb-0.5">
              <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${sub.name} up`}>
                ↑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={i === subs.length - 1}
                onClick={() => move(i, 1)}
                aria-label={`Move ${sub.name} down`}
              >
                ↓
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-rose-300"
                onClick={() => onChange(subs.filter((_, j) => j !== i))}
                aria-label={`Remove ${sub.name}`}
              >
                ✕
              </Button>
            </div>
          </div>
          <Field label="Effect">
            <TextInput value={sub.effectNotes} onChange={(effectNotes) => update(i, { effectNotes })} />
          </Field>
          <CategoryPicker
            small
            legend="Sub cake categories"
            value={sub.categories}
            onChange={(categories) => update(i, { categories })}
          />
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={add}>
          + Sub cake
        </Button>
        {subs.length > 1 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange(sequenceSubCakes(subs))}
            title="Start each sub cake when the previous one ends"
          >
            Lay end to end
          </Button>
        )}
      </div>
    </fieldset>
  );
}

/** Per-piece or case/pack pricing shared by shells, rockets and roman candles. */
function PackPricingFields({
  item,
  set,
}: {
  item: Shell | Rocket | Candle;
  set: (patch: Partial<Shell> | Partial<Rocket> | Partial<Candle>) => void;
}) {
  const n = PIECE_NOUNS[item.kind];
  const Pack = n.pack[0].toUpperCase() + n.pack.slice(1);
  const perPiece = `${formatMoney(shellUnitCost(item))} per ${n.one}`;
  return (
    <>
      <Field label="Pricing">
        <Select
          value={item.pricing.mode}
          onChange={(mode) =>
            set({
              pricing:
                mode === 'unit'
                  ? { mode: 'unit', unitCost: shellUnitCost(item) }
                  : { mode: 'case', caseQty: n.defaultPack, caseCost: shellUnitCost(item) * n.defaultPack },
            })
          }
          options={[
            { value: 'case', label: `By the ${n.pack}` },
            { value: 'unit', label: `Per ${n.one}` },
          ]}
        />
      </Field>
      {item.pricing.mode === 'unit' ? (
        <Field label="Cost (each)" hint={costHint(item)}>
          <NumberInput
            min={0}
            suffix="$"
            value={item.pricing.unitCost}
            onChange={(unitCost) => set({ pricing: { mode: 'unit', unitCost } })}
          />
        </Field>
      ) : (
        <>
          <Field label={`${n.many} per ${n.pack}`}>
            <NumberInput
              integer
              min={1}
              value={item.pricing.caseQty}
              onChange={(caseQty) => item.pricing.mode === 'case' && set({ pricing: { ...item.pricing, caseQty } })}
            />
          </Field>
          <Field label={`${Pack} cost`} hint={[perPiece, costHint(item)].filter(Boolean).join(' · ')}>
            <NumberInput
              min={0}
              suffix="$"
              value={item.pricing.caseCost}
              onChange={(caseCost) => item.pricing.mode === 'case' && set({ pricing: { ...item.pricing, caseCost } })}
            />
          </Field>
          <Field label={`${Pack}s owned`} hint={`Sets ${n.many.toLowerCase()} owned`}>
            <NumberInput
              min={0}
              value={Math.round((item.qtyOwned / item.pricing.caseQty) * 100) / 100}
              onChange={(packs) =>
                item.pricing.mode === 'case' && set({ qtyOwned: Math.round(packs * item.pricing.caseQty) })
              }
            />
          </Field>
        </>
      )}
    </>
  );
}

export function ItemDialog({ initial, onClose }: { initial: CatalogItem; onClose: () => void }) {
  const [item, setItem] = useState<CatalogItem>(initial);
  const set = (patch: Patch) => setItem((i) => ({ ...i, ...patch }) as CatalogItem);
  const kindLabel = KIND_LABEL[item.kind].toLowerCase();
  const title = `${initial.name ? 'Edit' : 'New'} ${kindLabel}`;

  const save = () => {
    upsertCatalogItem({
      ...item,
      name: item.name.trim() || `Unnamed ${kindLabel}`,
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
            <Field label="Shots" hint={isCompound(item) ? 'Total of the sub cakes' : undefined}>
              <NumberInput
                integer
                min={0}
                disabled={isCompound(item)}
                value={normalizeCake(item).shots}
                onChange={(shots) => set({ shots })}
              />
            </Field>
            <Field label="Duration" hint={isCompound(item) ? 'Through the last sub cake' : undefined}>
              <NumberInput
                min={0}
                suffix="s"
                disabled={isCompound(item)}
                value={normalizeCake(item).durationSec}
                onChange={(durationSec) => set({ durationSec })}
              />
            </Field>
            <Field label="Lead fuse delay" hint="Light to first shot">
              <NumberInput min={0} suffix="s" value={item.leadDelaySec} onChange={(leadDelaySec) => set({ leadDelaySec })} />
            </Field>
            <Field label="Cost (each)" hint={costHint(normalizeCake(item))}>
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
            <div className="col-span-2 md:col-span-4">
              <CategoryPicker legend="Categories" value={item.categories} onChange={(categories) => set({ categories })} />
            </div>
            <SubCakesEditor cake={item} onChange={(subCakes) => set({ subCakes })} />
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
            <PackPricingFields item={item} set={set} />
          </>
        )}

        {item.kind === 'rocket' && (
          <>
            <Field label="Brand">
              <TextInput value={item.brand} onChange={(brand) => set({ brand })} />
            </Field>
            <Field label="Effect" className="col-span-2 md:col-span-1">
              <TextInput value={item.effect} onChange={(effect) => set({ effect })} />
            </Field>
            <Field label="Light to burst" hint="Lead fuse + flight">
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
            <PackPricingFields item={item} set={set} />
          </>
        )}

        {item.kind === 'candle' && (
          <>
            <Field label="Brand">
              <TextInput value={item.brand} onChange={(brand) => set({ brand })} />
            </Field>
            <Field label="Effect" className="col-span-2 md:col-span-1">
              <TextInput value={item.effect} onChange={(effect) => set({ effect })} />
            </Field>
            <Field label="Shots" hint="Balls / stars">
              <NumberInput integer min={0} value={item.shots} onChange={(shots) => set({ shots })} />
            </Field>
            <Field label="Duration">
              <NumberInput min={0} suffix="s" value={item.durationSec} onChange={(durationSec) => set({ durationSec })} />
            </Field>
            <Field label="Lead fuse delay" hint="Light to first shot">
              <NumberInput min={0} suffix="s" value={item.leadDelaySec} onChange={(leadDelaySec) => set({ leadDelaySec })} />
            </Field>
            <PackPricingFields item={item} set={set} />
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

        <Field label={'pricing' in item ? `${PIECE_NOUNS[item.kind].many} owned` : 'Quantity owned'}>
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
