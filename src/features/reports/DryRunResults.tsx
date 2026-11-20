import clsx from 'clsx';
import { LATE_FLAG_SEC, type DryRunResult } from '../../engine/dryRun';
import { formatTime } from '../../lib/format';

const secs = (s: number) => `${s.toFixed(1)}s`;

/** How the dry run is going: timing per cue and, with districts, how each switch went. */
export function DryRunResults({
  score,
  hasDistricts,
}: {
  score: DryRunResult;
  hasDistricts: boolean;
}) {
  const pressed = score.cues.filter((c) => c.offset !== null);
  const late = pressed.filter((c) => c.offset! > LATE_FLAG_SEC);
  const lateSwitches = score.switches.filter((s) => s.late);

  return (
    <div
      className="w-full max-w-5xl rounded-xl border border-sky-900 bg-slate-950 p-3"
      data-testid="dry-run-results"
    >
      <div className="mb-2 text-xs tracking-widest text-sky-300 uppercase">Dry run so far</div>
      <div className="flex flex-wrap gap-2 text-sm">
        <Stat label="Cues pressed" value={`${pressed.length} of ${score.cues.length}`} />
        <Stat
          label="Average off"
          value={score.meanAbsOffset === null ? '—' : secs(score.meanAbsOffset)}
        />
        <Stat
          label="Latest press"
          value={
            score.worstLate ? `${secs(score.worstLate.offset!)} · ${score.worstLate.label}` : '—'
          }
          bad={!!score.worstLate && score.worstLate.offset! > LATE_FLAG_SEC}
        />
        <Stat label="Missed" value={String(score.missed)} bad={score.missed > 0} />
        {hasDistricts && (
          <Stat
            label="Late switches"
            value={`${lateSwitches.length} of ${score.switches.length}`}
            bad={lateSwitches.length > 0}
          />
        )}
        {score.extraPresses > 0 && <Stat label="Extra taps" value={String(score.extraPresses)} />}
      </div>

      {hasDistricts && score.switches.length > 0 && (
        <table className="mt-3 w-full text-left text-sm" data-testid="dry-run-switches">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="py-1 font-medium">Switch to</th>
              <th className="py-1 font-medium">For</th>
              <th className="py-1 font-medium">Time to switch</th>
              <th className="py-1 font-medium">Switched with</th>
            </tr>
          </thead>
          <tbody>
            {score.switches.map((s) => (
              <tr key={s.addressId} className="border-t border-slate-800">
                <td className="py-1">{s.districtLabel}</td>
                <td className="py-1 text-slate-400">{s.label}</td>
                <td className="py-1 font-mono tabular-nums">{secs(s.window)}</td>
                <td
                  className={clsx(
                    'py-1',
                    s.late ? 'font-semibold text-rose-300' : 'text-emerald-300',
                  )}
                >
                  {s.switchedAt === null
                    ? 'Not switched'
                    : s.margin! < 0
                      ? `${secs(-s.margin!)} after the cue`
                      : `${secs(s.margin!)} to spare`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {late.length > 0 && (
        <div className="mt-3 text-sm text-slate-400">
          Late:{' '}
          {late.map((c) => `${c.label} at ${formatTime(c.time)} (+${secs(c.offset!)})`).join(' · ')}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="rounded-md border border-slate-800 px-2 py-1">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={clsx('font-semibold', bad && 'text-rose-300')}>{value}</div>
    </div>
  );
}
