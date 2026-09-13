import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { Badge, Button, Field, Modal, NumberInput, Panel, Select, TextInput } from '../../components/ui';
import {
  controllerCapacity,
  cueDistrict,
  describeAddress,
  districtColor,
  flatAddressId,
  pinAddress,
  selectableAddresses,
} from '../../model/addressing';
import { FIRING_SYSTEM_PRESETS, presetById } from '../../model/presets';
import type { FiringModule } from '../../model/schema';
import {
  addModule,
  deleteModule,
  setControllerPreset,
  setPinOverride,
  updateController,
  updateModule,
} from '../../store/actions';
import { useDerived, useShow } from '../../store/showStore';
import { formatTime } from '../../lib/format';

export function FiringTab() {
  const ctrl = useShow((s) => s.firing.controller);
  const modules = useShow((s) => s.firing.modules);
  const positions = useShow((s) => s.positions);
  const fuseNodes = useShow((s) => s.fuseNodes);
  const cueTimes = useShow((s) => s.cueTimes);
  const { totals } = useDerived();
  const preset = presetById(ctrl.presetId);
  const [customCues, setCustomCues] = useState(12);
  const [pinEdit, setPinEdit] = useState<{ moduleId: string; pin: number } | null>(null);

  /** address -> list of module pins resolving to it */
  const addressPins = useMemo(() => {
    const map = new Map<string, { moduleId: string; pin: number }[]>();
    for (const m of modules) {
      for (let pin = 1; pin <= m.cueCount; pin++) {
        const a = pinAddress(ctrl, m, pin);
        if (!map.has(a)) map.set(a, []);
        map.get(a)!.push({ moduleId: m.id, pin });
      }
    }
    return map;
  }, [ctrl, modules]);

  const wiredPins = useMemo(() => {
    const set = new Map<string, number>();
    for (const n of fuseNodes) {
      if (n.kind === 'igniter') set.set(`${n.moduleId}:${n.pin}`, (set.get(`${n.moduleId}:${n.pin}`) ?? 0) + 1);
    }
    return set;
  }, [fuseNodes]);

  const cueLabel = ctrl.addressing === 'channels' ? 'Cues per channel' : ctrl.addressing === 'flat' ? 'Controller cues' : 'Cues per module (max)';
  const linkedGroups = [...addressPins.entries()].filter(([, pins]) => pins.length > 1);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold">Firing system</h1>

      <Panel title="Controller">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          <Field label="System preset" className="col-span-2">
            <Select
              value={ctrl.presetId}
              onChange={(id) => {
                if (
                  modules.length === 0 ||
                  window.confirm(
                    'Switch systems? Modules are kept, pin links are reset, and cue times follow their wired pins.',
                  )
                ) {
                  setControllerPreset(id);
                }
              }}
              options={FIRING_SYSTEM_PRESETS.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>
          <Field label="Name">
            <TextInput value={ctrl.name} onChange={(name) => updateController({ name })} />
          </Field>
          {ctrl.addressing === 'channels' && (
            <Field label="Channels">
              <NumberInput integer min={1} max={999} value={ctrl.channels} onChange={(channels) => updateController({ channels })} />
            </Field>
          )}
          {ctrl.addressing !== 'module' && (
            <Field label={cueLabel}>
              <NumberInput
                integer
                min={1}
                max={999}
                value={ctrl.cuesPerChannel}
                onChange={(cuesPerChannel) => updateController({ cuesPerChannel })}
              />
            </Field>
          )}
          <Field label="Max modules">
            <NumberInput
              integer
              min={0}
              value={ctrl.maxModules ?? 0}
              onChange={(v) => updateController({ maxModules: v > 0 ? v : null })}
              placeholder="No limit"
            />
          </Field>
          <Field label="Igniter type">
            <Select
              value={ctrl.igniterKind}
              onChange={(k) => updateController({ igniterKind: k as typeof ctrl.igniterKind })}
              options={[
                { value: 'ematch', label: 'E-match' },
                { value: 'talon', label: 'Talon / clip-on' },
              ]}
            />
          </Field>
          <Field label="Max igniters per cue">
            <NumberInput
              integer
              min={1}
              value={ctrl.maxIgnitersPerCue}
              onChange={(maxIgnitersPerCue) => updateController({ maxIgnitersPerCue })}
            />
          </Field>
          {ctrl.addressing === 'flat' && (
            <Field label="Cues per district" hint="Cues in each remote district (area). 0 = none.">
              <NumberInput
                integer
                min={0}
                max={999}
                value={ctrl.cuesPerDistrict}
                onChange={(cuesPerDistrict) => updateController({ cuesPerDistrict })}
              />
            </Field>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="sky">
            {ctrl.addressing === 'flat'
              ? 'Receivers map to controller cue numbers'
              : ctrl.addressing === 'channels'
                ? 'Module banks are set to channels'
                : 'Each module cue is fired individually'}
          </Badge>
          <Badge>
            {totals.cues.used.length} / {controllerCapacity(ctrl, modules)} cues used
          </Badge>
          <Badge>{modules.length} modules</Badge>
          <span className="text-xs text-slate-500">{preset.notes}</span>
        </div>
        <DistrictSummary />
        <p className="mt-2 text-[11px] text-slate-500">
          Preset specs are starting points. Check cue counts and igniter limits against your hardware and firmware.
        </p>
      </Panel>

      <Panel
        title="Firing modules"
        actions={
          <>
            {preset.moduleModels.map((mm) => (
              <Button key={mm.name} size="sm" onClick={() => addModule(mm)} disabled={ctrl.maxModules !== null && modules.length >= ctrl.maxModules}>
                + {mm.name}
              </Button>
            ))}
            <div className="flex items-center gap-1">
              <NumberInput integer min={1} max={200} value={customCues} onChange={setCustomCues} className="w-16" />
              <Button
                size="sm"
                onClick={() => addModule({ name: `Custom ${customCues}-cue`, cueCount: customCues, banks: 1 })}
                disabled={ctrl.maxModules !== null && modules.length >= ctrl.maxModules}
              >
                + Custom
              </Button>
            </div>
          </>
        }
      >
        {modules.length === 0 ? (
          <p className="text-sm text-slate-500">Add the firing modules (receivers) you'll use and assign each to a launch position.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {modules.map((m) => (
              <ModuleCard
                key={m.id}
                module={m}
                positions={positions.map((p) => ({ value: p.id, label: p.name }))}
                addressPins={addressPins}
                wiredPins={wiredPins}
                cueTimes={cueTimes}
                onPin={(pin) => setPinEdit({ moduleId: m.id, pin })}
              />
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Linked cues">
        {linkedGroups.length === 0 ? (
          <p className="text-sm text-slate-500">
            No linked cues. When module cues share a controller cue, one button fires all of them. Click a
            module cue above to link it.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {linkedGroups.map(([addr, pins]) => (
              <li key={addr} className="flex flex-wrap items-center gap-2">
                <Badge tone="amber">{describeAddress(addr, modules).label}</Badge>
                <span className="text-slate-400">fires</span>
                {pins.map((p) => (
                  <Badge key={`${p.moduleId}:${p.pin}`}>
                    {modules.find((m) => m.id === p.moduleId)?.name} cue {p.pin}
                  </Badge>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {pinEdit && <PinDialog {...pinEdit} onClose={() => setPinEdit(null)} />}
    </div>
  );
}

/** Which remote district each cue sits in, so the operator knows when to switch. */
function DistrictSummary() {
  const ctrl = useShow((s) => s.firing.controller);
  const { totals } = useDerived();
  if (ctrl.addressing === 'module') return null;
  if (ctrl.addressing === 'channels') {
    return (
      <p className="mt-2 text-xs text-slate-400">
        Each channel counts as a district. Show mode tells you when to switch channels.
      </p>
    );
  }
  if (ctrl.cuesPerDistrict <= 0) {
    return (
      <p className="mt-2 text-xs text-slate-400">
        If your remote fires cues in districts (areas) you switch between, set cues per district. Show mode then
        shows each cue's district and when to switch.
      </p>
    );
  }
  const wired = new Map<string, number>();
  for (const addr of totals.cues.used) {
    const d = cueDistrict(ctrl, addr);
    if (d) wired.set(d.key, (wired.get(d.key) ?? 0) + 1);
  }
  const count = Math.ceil(ctrl.cuesPerChannel / ctrl.cuesPerDistrict);
  return (
    <div className="mt-3 flex flex-wrap gap-1.5" data-testid="district-summary">
      {Array.from({ length: count }, (_, i) => {
        const d = cueDistrict(ctrl, flatAddressId(i * ctrl.cuesPerDistrict + 1))!;
        const color = districtColor(d);
        return (
          <span key={d.key} className="rounded-md border px-2 py-1 text-xs" style={{ borderColor: color }}>
            <b style={{ color }}>{d.label}</b>{' '}
            <span className="text-slate-400">
              {d.range} · {wired.get(d.key) ?? 0} wired
            </span>
          </span>
        );
      })}
    </div>
  );
}

function ModuleCard({
  module: m,
  positions,
  addressPins,
  wiredPins,
  cueTimes,
  onPin,
}: {
  module: FiringModule;
  positions: { value: string; label: string }[];
  addressPins: Map<string, { moduleId: string; pin: number }[]>;
  wiredPins: Map<string, number>;
  cueTimes: Record<string, number>;
  onPin: (pin: number) => void;
}) {
  const ctrl = useShow((s) => s.firing.controller);
  const modules = useShow((s) => s.firing.modules);
  const pos = positions.find((p) => p.value === m.positionId);
  const posColor = useShow((s) => s.positions.find((p) => p.id === m.positionId)?.color ?? '#475569');

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3" data-testid={`module-${m.name}`}>
      <div className="flex flex-wrap items-end gap-3">
        <span className="mb-2 h-3 w-3 rounded-full" style={{ background: posColor }} />
        <Field label="Name" className="w-24">
          <TextInput value={m.name} onChange={(name) => updateModule(m.id, { name })} />
        </Field>
        <Field label="Model" className="w-48">
          <TextInput value={m.modelName} onChange={(modelName) => updateModule(m.id, { modelName })} />
        </Field>
        <Field label="Cues" className="w-20">
          <NumberInput integer min={1} max={200} value={m.cueCount} onChange={(cueCount) => updateModule(m.id, { cueCount })} />
        </Field>
        <Field label="Position" className="w-40">
          <Select
            value={m.positionId ?? ''}
            onChange={(v) => updateModule(m.id, { positionId: v || null })}
            options={[{ value: '', label: '— unassigned —' }, ...positions]}
          />
        </Field>
        {ctrl.addressing === 'flat' && (
          <Field label="Receiver starts at cue" className="w-36">
            <NumberInput integer min={1} value={m.startCue} onChange={(startCue) => updateModule(m.id, { startCue })} />
          </Field>
        )}
        {ctrl.addressing === 'channels' &&
          m.bankChannels.map((ch, i) => (
            <Field key={i} label={m.bankChannels.length > 1 ? `Bank ${String.fromCharCode(65 + i)} channel` : 'Channel'} className="w-28">
              <NumberInput
                integer
                min={1}
                max={ctrl.channels}
                value={ch}
                onChange={(v) => updateModule(m.id, { bankChannels: m.bankChannels.map((c, j) => (j === i ? v : c)) })}
              />
            </Field>
          ))}
        {ctrl.addressing === 'channels' && (
          <Field label="Banks" className="w-20">
            <NumberInput
              integer
              min={1}
              max={4}
              value={m.bankChannels.length}
              onChange={(n) =>
                updateModule(m.id, {
                  bankChannels: Array.from({ length: n }, (_, i) => m.bankChannels[i] ?? m.bankChannels[0] + i),
                })
              }
            />
          </Field>
        )}
        <div className="ml-auto flex gap-2">
          {!pos && <Badge tone="amber">No position</Badge>}
          <Button
            size="sm"
            variant="ghost"
            className="text-rose-300"
            onClick={() => window.confirm(`Delete ${m.name}? Igniters wired to it are removed.`) && deleteModule(m.id)}
          >
            Delete
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))' }}>
        {Array.from({ length: m.cueCount }, (_, i) => i + 1).map((pin) => {
          const addr = pinAddress(ctrl, m, pin);
          const linked = (addressPins.get(addr)?.length ?? 0) > 1;
          const wired = wiredPins.get(`${m.id}:${pin}`) ?? 0;
          const overridden = m.pinOverrides[String(pin)] !== undefined;
          const t = cueTimes[addr];
          const district = ctrl.addressing === 'flat' ? cueDistrict(ctrl, addr) : null;
          return (
            <button
              key={pin}
              onClick={() => onPin(pin)}
              className={clsx(
                'rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight transition-colors',
                wired ? 'border-amber-500/50 bg-amber-500/10' : 'border-slate-800 bg-slate-950 hover:border-slate-600',
              )}
              title={`${m.name} cue ${pin} → ${describeAddress(addr, modules).label}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">#{pin}</span>
                <span className="flex gap-0.5">
                  {linked && <span title="Linked with another module cue">🔗</span>}
                  {overridden && <span className="text-sky-300" title="Manually mapped">✎</span>}
                </span>
              </div>
              {ctrl.addressing !== 'module' && (
                <div className="truncate text-slate-400">
                  {describeAddress(addr, modules).label}
                  {district && <span style={{ color: districtColor(district) }}> · {district.short}</span>}
                </div>
              )}
              <div className="truncate text-slate-500">
                {wired ? `${wired} igniter${wired > 1 ? 's' : ''}${t !== undefined ? ` · ${formatTime(t)}` : ''}` : '—'}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PinDialog({ moduleId, pin, onClose }: { moduleId: string; pin: number; onClose: () => void }) {
  const ctrl = useShow((s) => s.firing.controller);
  const modules = useShow((s) => s.firing.modules);
  const fuseNodes = useShow((s) => s.fuseNodes);
  const positions = useShow((s) => s.positions);
  const { timing } = useDerived();
  const m = modules.find((x) => x.id === moduleId);
  if (!m) return null;
  const addr = pinAddress(ctrl, m, pin);
  const igniters = fuseNodes.filter((n) => n.kind === 'igniter' && n.moduleId === moduleId && n.pin === pin);
  const effects = timing.effects.filter((e) => igniters.some((ig) => ig.id === e.igniterId));
  const overridden = m.pinOverrides[String(pin)] !== undefined;

  return (
    <Modal title={`${m.name} · cue ${pin}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {ctrl.addressing === 'module' ? (
          <p className="text-sm text-slate-400">
            {ctrl.name} fires each module cue on its own. To fire several together, give them the same
            time on the Timeline.
          </p>
        ) : (
          <Field label="Fires on controller cue" hint="Pick a cue already used by another module cue to link them.">
            <Select
              value={addr}
              onChange={(v) => setPinOverride(moduleId, pin, v)}
              options={selectableAddresses(ctrl, modules).map((a) => ({ value: a.id, label: a.label }))}
            />
          </Field>
        )}
        {overridden && (
          <Button size="sm" onClick={() => setPinOverride(moduleId, pin, null)}>
            Reset to default mapping
          </Button>
        )}
        <div>
          <h4 className="mb-1 text-xs font-semibold text-slate-400">Wired igniters</h4>
          {igniters.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing is wired to this cue yet. Add an igniter on the Positions tab.</p>
          ) : (
            <ul className="text-sm text-slate-300">
              {igniters.map((ig) => (
                <li key={ig.id}>Igniter at {positions.find((p) => p.id === ig.positionId)?.name}</li>
              ))}
            </ul>
          )}
          {effects.length > 0 && (
            <ul className="mt-2 text-xs text-slate-400">
              {effects.map((e) => (
                <li key={e.key}>
                  {formatTime(e.startSec)} · {e.name}
                  {e.tubeIndex !== null ? ` (tube ${e.tubeIndex + 1})` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
