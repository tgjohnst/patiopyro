import clsx from 'clsx';
import { useMemo } from 'react';
import { Button, Field, Modal, TextInput } from '../../components/ui';
import { buildOverview } from '../../engine/overview';
import { updateMeta } from '../../store/actions';
import { useDerived, useShow } from '../../store/showStore';
import { useUi, type OverviewOptions } from '../../store/uiStore';

type Section = Extract<keyof OverviewOptions, 'scenes' | 'lineup' | 'cost' | 'safety'>;

/** Choose what goes in the show overview, then print it. */
export function OverviewDialog({ onClose }: { onClose: () => void }) {
  const show = useShow((s) => s);
  const { timing } = useDerived();
  const options = useUi((u) => u.overview);
  const setOverview = useUi((u) => u.setOverview);
  const setPrintView = useUi((u) => u.setPrintView);
  const o = useMemo(() => buildOverview(show, timing), [show, timing]);
  const hasLinks = o.lineup.some((g) => g.rows.some((r) => r.item.url.trim()));

  const sections: { id: Section; label: string; detail: string; unavailable?: string }[] = [
    {
      id: 'scenes',
      label: 'Scene by scene',
      detail: "Each scene's time, shots, note and the products in it.",
      unavailable: o.scenes.length === 0 ? 'Add scenes on the Timeline to include this.' : undefined,
    },
    {
      id: 'lineup',
      label: "What's in the show",
      detail: 'Every product, with its effects, colors and scenes.',
      unavailable: o.lineup.length === 0 ? 'Nothing is timed yet.' : undefined,
    },
    { id: 'cost', label: 'Cost', detail: 'Totals and breakdowns, plus prices on every page. Off by default.' },
    { id: 'safety', label: 'Safety and site', detail: 'Distances, firing method, crew and contacts. For a venue or neighbors.' },
  ];

  return (
    <Modal
      title="Export show overview"
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          {o.untimed > 0 ? (
            <span className="text-xs text-amber-300">
              {o.untimed} {o.untimed === 1 ? 'item has' : 'items have'} no fire time yet and {o.untimed === 1 ? 'is' : 'are'} left out.
            </span>
          ) : (
            <span className="text-xs text-slate-500">Sections after the first start on a new page.</span>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                onClose();
                setPrintView('overview');
              }}
            >
              🖨 Print / save PDF
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4" data-testid="overview-dialog">
        <p className="text-sm text-slate-400">A summary to share with people who aren't running the show.</p>

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Sections</legend>
          <label className="flex items-start gap-2.5 rounded-md px-2 py-1.5 opacity-70">
            <input type="checkbox" checked disabled className="mt-0.5 h-4 w-4 accent-amber-500" />
            <span>
              <span className="text-sm font-medium text-slate-200">At a glance</span>
              <span className="block text-xs text-slate-500">Run time, totals, how the show builds, and the site. Always included.</span>
            </span>
          </label>
          {sections.map((s) => (
            <label
              key={s.id}
              className={clsx('flex items-start gap-2.5 rounded-md px-2 py-1.5', s.unavailable ? 'opacity-60' : 'cursor-pointer hover:bg-slate-800/60')}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-amber-500"
                checked={options[s.id] && !s.unavailable}
                disabled={!!s.unavailable}
                onChange={(e) => setOverview({ [s.id]: e.target.checked })}
              />
              <span>
                <span className="text-sm font-medium text-slate-200">{s.label}</span>
                <span className="block text-xs text-slate-500">{s.unavailable ?? s.detail}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start time" hint="Prints the start and end times">
            <TextInput type="time" value={show.meta.startTime} onChange={(startTime) => updateMeta({ startTime })} />
          </Field>
          <fieldset className="flex flex-col gap-1 text-xs">
            <legend className="mb-1 font-medium text-slate-400">Paper</legend>
            <div className="flex h-8 items-center gap-4 text-sm text-slate-200">
              {(['letter', 'a4'] as const).map((p) => (
                <label key={p} className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="overview-paper"
                    className="accent-amber-500"
                    checked={options.paper === p}
                    onChange={() => setOverview({ paper: p })}
                  />
                  {p === 'letter' ? 'Letter' : 'A4'}
                </label>
              ))}
              <span className="text-xs text-slate-500">landscape</span>
            </div>
          </fieldset>
        </div>

        <label className={clsx('flex items-start gap-2.5 text-sm', hasLinks ? 'cursor-pointer text-slate-200' : 'text-slate-500')}>
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-amber-500"
            checked={options.links && hasLinks}
            disabled={!hasLinks}
            onChange={(e) => setOverview({ links: e.target.checked })}
          />
          <span>
            Product links, with a QR code for each on paper
            {!hasLinks && <span className="block text-xs">No product in the show has a link. Add them in Inventory.</span>}
          </span>
        </label>

        <Field label="Description" hint="Printed under the title. Also in Show settings, with the crew and contact for the safety section.">
          <textarea
            className="min-h-16 w-full rounded-md border border-slate-700 bg-slate-900 p-2 text-sm focus:border-amber-500 focus:outline-none"
            value={show.meta.description}
            onChange={(e) => updateMeta({ description: e.target.value })}
            placeholder="What to expect, where to sit, when it starts…"
          />
        </Field>
      </div>
    </Modal>
  );
}
