import { Button, Checkbox, Field, Modal, NumberInput, Select, TextInput } from '../../components/ui';
import { displayToInches, inchesToDisplay, smallUnit } from '../../lib/format';
import { updateMeta, updateSettings } from '../../store/actions';
import { useShow } from '../../store/showStore';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const meta = useShow((s) => s.meta);
  const settings = useShow((s) => s.settings);
  const fuseTypes = useShow((s) => s.fuseTypes);
  const u = settings.units;

  return (
    <Modal
      title="Show settings"
      onClose={onClose}
      wide
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <h3 className="col-span-full text-xs font-semibold tracking-wide text-slate-500 uppercase">Show</h3>
        <Field label="Show name" className="col-span-2">
          <TextInput value={meta.name} onChange={(name) => updateMeta({ name })} />
        </Field>
        <Field label="Date">
          <TextInput type="date" value={meta.date} onChange={(date) => updateMeta({ date })} />
        </Field>
        <Field label="Location">
          <TextInput value={meta.location} onChange={(location) => updateMeta({ location })} />
        </Field>
        <Field label="Notes" className="col-span-full">
          <textarea
            className="min-h-16 w-full rounded-md border border-slate-700 bg-slate-900 p-2 text-sm focus:border-amber-500 focus:outline-none"
            value={meta.notes}
            onChange={(e) => updateMeta({ notes: e.target.value })}
          />
        </Field>

        <h3 className="col-span-full mt-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Show overview
        </h3>
        <p className="col-span-full -mt-2 text-xs text-slate-500">
          Printed on the show overview PDF (Reports) for people you share the show with. Leave any of these blank to
          leave it out.
        </p>
        <Field label="Start time">
          <TextInput type="time" value={meta.startTime} onChange={(startTime) => updateMeta({ startTime })} />
        </Field>
        <Field label="Designed by" className="col-span-1 md:col-span-3">
          <TextInput value={meta.designer} onChange={(designer) => updateMeta({ designer })} placeholder="Your name" />
        </Field>
        <Field label="Description" className="col-span-full" hint="A few lines under the title">
          <textarea
            className="min-h-16 w-full rounded-md border border-slate-700 bg-slate-900 p-2 text-sm focus:border-amber-500 focus:outline-none"
            value={meta.description}
            onChange={(e) => updateMeta({ description: e.target.value })}
            placeholder="What to expect, where to sit, when it starts…"
          />
        </Field>
        <Field label="Crew" className="col-span-2">
          <TextInput value={meta.crew} onChange={(crew) => updateMeta({ crew })} placeholder="e.g. 2 people: remote and spotter" />
        </Field>
        <Field label="Contact on the night" className="col-span-2">
          <TextInput value={meta.contact} onChange={(contact) => updateMeta({ contact })} placeholder="Name and phone" />
        </Field>
        <Field label="Safety equipment on hand" className="col-span-full">
          <TextInput
            value={meta.safetyEquipment}
            onChange={(safetyEquipment) => updateMeta({ safetyEquipment })}
            placeholder="e.g. hose, extinguisher, first aid kit"
          />
        </Field>

        <h3 className="col-span-full mt-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Fuse &amp; igniters
        </h3>
        <Field label="Units">
          <Select
            value={u}
            onChange={(units) => updateSettings({ units: units as typeof u })}
            options={[
              { value: 'imperial', label: 'Imperial (ft / in)' },
              { value: 'metric', label: 'Metric (m / cm)' },
            ]}
          />
        </Field>
        <Field label="Default fuse type" hint="Used for new fuse runs">
          <Select
            value={settings.defaultFuseTypeId}
            onChange={(defaultFuseTypeId) => updateSettings({ defaultFuseTypeId })}
            options={fuseTypes.map((f) => ({ value: f.id, label: f.name }))}
          />
        </Field>
        <Field label="Default run length">
          <NumberInput
            min={0}
            suffix={smallUnit(u)}
            value={inchesToDisplay(settings.defaultSegmentLengthIn, u)}
            onChange={(v) => updateSettings({ defaultSegmentLengthIn: displayToInches(v, u) })}
          />
        </Field>
        <Field label="Allowance per run" hint="Extra for tie-ins at both ends">
          <NumberInput
            min={0}
            suffix={smallUnit(u)}
            value={inchesToDisplay(settings.connectionAllowanceIn, u)}
            onChange={(v) => updateSettings({ connectionAllowanceIn: displayToInches(v, u) })}
          />
        </Field>
        <Field label="Fuse waste">
          <NumberInput min={0} suffix="%" value={settings.fuseWastePct} onChange={(fuseWastePct) => updateSettings({ fuseWastePct })} />
        </Field>
        <Field label="Spare igniters">
          <NumberInput
            min={0}
            suffix="%"
            value={settings.igniterSparePct}
            onChange={(igniterSparePct) => updateSettings({ igniterSparePct })}
          />
        </Field>
        <Field label="Igniter cost (each)">
          <NumberInput
            min={0}
            suffix="$"
            value={settings.igniterUnitCost}
            onChange={(igniterUnitCost) => updateSettings({ igniterUnitCost })}
          />
        </Field>
        <Field label="Timeline snap">
          <Select
            value={String(settings.snapSec)}
            onChange={(v) => updateSettings({ snapSec: Number(v) })}
            options={[0.1, 0.25, 0.5, 1, 5].map((v) => ({ value: String(v), label: `${v} s` }))}
          />
        </Field>
        <div className="col-span-full">
          <Checkbox
            label="Include racks in show cost (otherwise treated as reusable equipment)"
            checked={settings.includeRacksInCost}
            onChange={(includeRacksInCost) => updateSettings({ includeRacksInCost })}
          />
        </div>

      </div>
    </Modal>
  );
}
