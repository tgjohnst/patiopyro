import clsx from 'clsx';
import { Badge, Button, Modal } from '../../components/ui';
import { suggestModuleProgramming, type SequenceStats } from '../../engine/moduleProgramming';
import { formatTime } from '../../lib/format';
import { applyModuleProgramming } from '../../store/actions';
import { useShowStore } from '../../store/showStore';

const range = (start: number, block: number) => `${start}–${start + block - 1}`;

/** Suggested receiver coding for block-coded systems (Bilusocn), with a one-click apply. */
export function ProgrammingDialog({ onClose }: { onClose: () => void }) {
  const show = useShowStore((st) => st.show);
  const plan = suggestModuleProgramming(show);
  if (!plan) return null;
  const spanOf = (moduleId: string) => {
    const m = show.firing.modules.find((x) => x.id === moduleId);
    return m ? Math.max(1, Math.ceil(m.cueCount / plan.block)) * plan.block : plan.block;
  };
  const hasDistricts = show.firing.controller.cuesPerDistrict > 0;
  const stat = (label: string, pick: (s: SequenceStats) => number) => {
    const before = pick(plan.before);
    const after = pick(plan.after);
    return (
      <div className="rounded-md border border-slate-800 px-2 py-1">
        <div className="text-[11px] text-slate-400">{label}</div>
        <div className="text-sm">
          {before} → <b className={clsx(after < before && 'text-emerald-300')}>{after}</b>
        </div>
      </div>
    );
  };

  return (
    <Modal
      title="Suggested receiver programming"
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button
            variant="primary"
            disabled={!plan.changed}
            onClick={() => {
              applyModuleProgramming(
                Object.fromEntries(plan.modules.map((m) => [m.moduleId, m.suggestedStart])),
              );
              onClose();
            }}
          >
            Apply
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm" data-testid="programming-dialog">
        <p className="text-slate-400">
          Each receiver is coded to {plan.block} sequential remote cues. Receivers are laid out in
          the order they first fire so you step forward through the remote, and receivers whose cues
          fire at the same moments share a block so one button fires both. Cue times stay with their
          wired cues.
        </p>
        <div className="flex flex-wrap gap-2">
          {stat('Steps back on the remote', (s) => s.backtracks)}
          {hasDistricts && stat('District switches', (s) => s.districtSwitches)}
          {stat(`Highest cue (of ${plan.capacity})`, (s) => s.lastCue)}
        </div>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-400">
            <tr>
              <th className="py-1 font-medium">Receiver</th>
              <th className="py-1 font-medium">First fires</th>
              <th className="py-1 font-medium">Now</th>
              <th className="py-1 font-medium">Suggested</th>
              <th className="py-1 font-medium">Fires with</th>
            </tr>
          </thead>
          <tbody>
            {plan.modules.map((m) => {
              const span = spanOf(m.moduleId);
              const moved = m.currentStart !== m.suggestedStart;
              return (
                <tr
                  key={m.moduleId}
                  className="border-t border-slate-800"
                  data-testid={`plan-${m.name}`}
                >
                  <td className="py-1 font-medium">{m.name}</td>
                  <td className="py-1 text-slate-400">
                    {m.firstTime !== null
                      ? formatTime(m.firstTime)
                      : m.wired
                        ? 'Not timed'
                        : 'Nothing wired'}
                  </td>
                  <td className="py-1 text-slate-400">Cues {range(m.currentStart, span)}</td>
                  <td className={clsx('py-1', moved && 'font-semibold text-amber-300')}>
                    Cues {range(m.suggestedStart, span)}
                  </td>
                  <td className="py-1">
                    {m.linkedWith.length > 0
                      ? m.linkedWith.map((n) => (
                          <Badge key={n} tone="amber" className="mr-1">
                            {n}
                          </Badge>
                        ))
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {plan.overCapacity && <Badge tone="rose">Over the remote's cue count</Badge>}
        {plan.notes.length > 0 && (
          <ul className="list-disc pl-5 text-xs text-slate-400">
            {plan.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        {!plan.changed && (
          <p className="text-xs text-emerald-300">The receivers are already coded this way.</p>
        )}
      </div>
    </Modal>
  );
}
