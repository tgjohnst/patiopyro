import { buildSweepList, type SweepEntry, type SweepReason } from '../../engine/sweep';
import { formatTime } from '../../lib/format';
import { useDerived, useShow } from '../../store/showStore';
import { DocHeader } from './PrintViews';

const REASON: Record<SweepReason, string> = {
  dud: 'Dud: lit, didn’t go off',
  misfire: 'Cue didn’t fire',
  unlit: 'Not lit: fused after a dud',
  unconnected: 'Never connected to a timed cue',
};

/** Printed after the show: everything still live, by position, rack and tube, to find and make safe. */
export function SweepList() {
  const show = useShow((s) => s);
  const { timing } = useDerived();
  const entries = buildSweepList(show, timing);
  const byPosition = show.positions
    .map((p) => ({ position: p, entries: entries.filter((e) => e.positionId === p.id) }))
    .filter((g) => g.entries.length > 0);
  const marked = show.sweep.misfires.length + show.sweep.duds.length;

  return (
    <div className="mx-auto max-w-[800px] p-6" data-testid="sweep-list">
      <DocHeader show={show} title="Post-show sweep list" />
      <p className="mb-3 text-sm text-gray-700">
        Treat everything here as live. Never relight a dud: wait at least 20 minutes (longer if the
        product label says so) before you approach it, then soak it in water.{' '}
        {marked === 0 &&
          'Nothing was marked in Show mode, so this lists only items that were never connected.'}
      </p>
      {byPosition.length === 0 ? (
        <p className="text-lg font-semibold">Nothing to sweep: every item fired as planned.</p>
      ) : (
        byPosition.map(({ position, entries }) => (
          <section key={position.id} className="avoid-break mb-5">
            <h2 className="mb-1 flex items-center gap-2 border-b border-black text-lg font-bold">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: position.color }}
              />
              {position.name}
              <span className="ml-auto text-sm font-normal text-gray-600">
                {entries.length} item{entries.length === 1 ? '' : 's'}
              </span>
            </h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase">
                  <th className="w-6 py-1">✓</th>
                  <th>Where</th>
                  <th>Firework</th>
                  <th>Cue</th>
                  <th>Why it’s live</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <SweepRow key={e.key} e={e} />
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}
    </div>
  );
}

function SweepRow({ e }: { e: SweepEntry }) {
  const where = [
    e.rackName
      ? `${e.rackName}${e.label ? ` (${e.label})` : ''}, tube ${e.tubeIndex! + 1}`
      : e.label,
    e.boardName && `on ${e.boardName}`,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <tr className="avoid-break border-b border-gray-300 align-top" data-testid="sweep-row">
      <td className="py-1.5">
        <span className="inline-block h-3.5 w-3.5 translate-y-0.5 border border-black" />
      </td>
      <td className="py-1.5 pr-2">{where || '—'}</td>
      <td className="py-1.5 pr-2 font-semibold">{e.name}</td>
      <td className="py-1.5 pr-2 whitespace-nowrap">
        {e.cueLabel ? (
          <>
            {e.cueLabel}
            <div className="text-[11px] text-gray-500">{formatTime(e.plannedSec!)}</div>
          </>
        ) : (
          '—'
        )}
      </td>
      <td
        className={e.reason === 'dud' || e.reason === 'misfire' ? 'py-1.5 font-semibold' : 'py-1.5'}
      >
        {REASON[e.reason]}
      </td>
    </tr>
  );
}
