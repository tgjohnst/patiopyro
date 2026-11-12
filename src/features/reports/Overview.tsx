import qrcode from 'qrcode-generator';
import { useMemo, type ReactNode } from 'react';
import {
  FEATURED_MAX,
  buildOverview,
  describeProduct,
  formatClock,
  formatShowDate,
  productLooks,
  type ShowOverview,
} from '../../engine/overview';
import type { IntensityBin } from '../../engine/intensity';
import { formatLengthFt, formatMoney, formatTime } from '../../lib/format';
import { safeHref, type CakeColor } from '../../model/catalog';
import type { Scene, Show } from '../../model/schema';
import { useDerived, useShow } from '../../store/showStore';
import type { OverviewOptions } from '../../store/uiStore';
import { SiteThumb } from './PrintViews';

/** Printable stand-ins for the cake colors. */
const COLOR_HEX: Record<CakeColor, string> = {
  Red: '#dc2626',
  Orange: '#ea580c',
  Golden: '#ca8a04',
  Green: '#16a34a',
  Neon: '#84cc16',
  Blue: '#2563eb',
  Purple: '#7c3aed',
  Silver: '#a1a1aa',
};
const NO_SCENE = '#a1a1aa';

const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const count = (n: number) => Math.round(n).toLocaleString('en-US');
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;
const range = (s: Scene) => `${formatTime(s.startSec, 0)}–${formatTime(s.endSec, 0)}`;

/**
 * A summary of the show for people who aren't running it: what it's like, how long it runs,
 * what's in it. Sections after the first start on a new page and run as long as they need.
 */
export function Overview({ options }: { options: OverviewOptions }) {
  const show = useShow((s) => s);
  const { timing } = useDerived();
  const o = useMemo(() => buildOverview(show, timing), [show, timing]);
  const scenes = options.scenes && o.scenes.length > 0;
  const lineup = options.lineup && o.lineup.length > 0;
  const breakdown = options.cost || o.lineup.length > 0;

  return (
    <div className="overview mx-auto max-w-[1000px] bg-white p-8 print:max-w-none print:p-0 text-[15px] leading-snug text-zinc-900" data-testid="overview">
      <AtAGlance show={show} o={o} options={options} />
      {scenes && <ScenesSection show={show} o={o} options={options} />}
      {lineup && <LineupSection show={show} o={o} options={options} />}
      {(breakdown || options.safety) && (
        <div className={`break-before grid gap-10 ${breakdown && options.safety ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {breakdown && <BreakdownSection show={show} o={o} cost={options.cost} wide={!options.safety} />}
          {options.safety && <SafetySection show={show} o={o} />}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4 border-b-2 border-zinc-900 pb-2">
      <h2 className="text-[26px] font-bold">{children}</h2>
      {aside && <div className="text-sm text-zinc-600">{aside}</div>}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-300 px-3.5 py-1.5">
      <div className="text-xs text-zinc-600">{label}</div>
      <div className="text-[24px] leading-tight font-bold tabular-nums">
        {value}
        {sub && <span className="ml-1 text-sm font-medium text-zinc-600">{sub}</span>}
      </div>
    </div>
  );
}

function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />;
}

// ---------- pages 1–3: at a glance ----------

function AtAGlance({ show, o, options }: { show: Show; o: ShowOverview; options: OverviewOptions }) {
  return (
    <>
      <CoverPage show={show} o={o} />
      <BuildPage show={show} o={o} options={options} />
      <WherePage show={show} o={o} />
    </>
  );
}

/** The app's mark: a firework burst on an amber tile. */
function Logo({ size = 44 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label="PatioPyro logo">
      <rect width="48" height="48" rx="11" fill="#0f172a" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const r1 = 6;
        const r2 = i % 2 ? 15 : 18;
        return (
          <line
            key={i}
            x1={24 + Math.cos(a) * r1}
            y1={24 + Math.sin(a) * r1}
            x2={24 + Math.cos(a) * r2}
            y2={24 + Math.sin(a) * r2}
            stroke={i % 3 === 0 ? '#f43f5e' : i % 3 === 1 ? '#fbbf24' : '#38bdf8'}
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        );
      })}
      <circle cx="24" cy="24" r="3" fill="#fbbf24" />
    </svg>
  );
}

/** Page 1: the brand, the show's name, when and where, how long, and what it's about. */
function CoverPage({ show, o }: { show: Show; o: ShowOverview }) {
  const { meta } = show;
  const start = formatClock(meta.startTime);
  const end = formatClock(meta.startTime, o.durationSec);
  const byline = [formatShowDate(meta.date), meta.location.trim(), meta.designer.trim() && `Designed by ${meta.designer.trim()}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="flex flex-col gap-10" data-testid="overview-glance">
      <div className="flex items-center gap-3 border-b-2 border-zinc-900 pb-3" data-testid="overview-brand">
        <Logo />
        <div className="flex flex-col">
          <span className="text-[26px] leading-none font-bold tracking-tight text-amber-600">PatioPyro</span>
          <span className="text-xs font-semibold tracking-[0.14em] text-zinc-600 uppercase">Show overview</span>
        </div>
      </div>

      <div className="flex items-end justify-between gap-10 pt-6">
        <div className="flex min-w-0 flex-col gap-3">
          <h1 className="text-[56px] leading-[1.05] font-bold">{meta.name}</h1>
          {byline && <div className="text-lg text-zinc-700">{byline}</div>}
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <div className="text-[72px] leading-none font-bold tabular-nums" data-testid="overview-runtime">
            {formatTime(o.durationSec, 0)}
          </div>
          <div className="text-base text-zinc-700">of fireworks</div>
          {start && end && <div className="text-base text-zinc-700">starts {start}, ends about {end}</div>}
        </div>
      </div>

      {meta.description.trim() && (
        <p
          className="max-w-[70ch] border-l-4 border-amber-500 pl-5 text-xl leading-relaxed whitespace-pre-line text-zinc-800"
          data-testid="overview-description"
        >
          {meta.description.trim()}
        </p>
      )}

      <div className="flex flex-wrap gap-x-8 gap-y-2 text-lg text-zinc-800">
        <span>
          <strong className="tabular-nums">{count(o.shots)}</strong> shots
        </span>
        <span>
          <strong className="tabular-nums">{count(o.pieces)}</strong> fireworks
        </span>
        {o.scenes.length > 0 && (
          <span>
            <strong className="tabular-nums">{count(o.scenes.length)}</strong> {o.scenes.length === 1 ? 'scene' : 'scenes'}
          </span>
        )}
        {o.largest && (
          <span>
            up to <strong>{o.largest}</strong>
          </span>
        )}
      </div>
    </section>
  );
}

/** The longest stretch, in seconds, of bins with nothing firing, between the first and last shot. */
function longestLull(o: ShowOverview): number {
  let best = 0;
  let run = 0;
  let started = false;
  for (const b of o.bins) {
    if (b.shots > 0) {
      // Only a gap closed by a shot counts, not the time before the first or after the last.
      if (started) best = Math.max(best, run);
      started = true;
      run = 0;
    } else run++;
  }
  return best * o.binSec;
}

/** Share of all shots fired in the show's last minute: how big the finale lands. */
function lastMinuteShare(o: ShowOverview): number | null {
  if (o.durationSec < 120 || o.shots === 0) return null;
  const from = o.durationSec - 60;
  const shots = o.bins.reduce((n, b) => n + (b.startSec >= from ? b.shots : 0), 0);
  return pctOf(shots, o.shots);
}

/** Page 2: shots and cost over time, full width, with the show's numbers. */
function BuildPage({ show, o, options }: { show: Show; o: ShowOverview; options: OverviewOptions }) {
  const minutes = o.durationSec / 60;
  const lull = longestLull(o);
  const finale = lastMinuteShare(o);
  const u = show.settings.units;

  return (
    <section className="break-before" data-testid="overview-build">
      <SectionTitle aside={`${formatTime(o.durationSec, 0)} of fireworks`}>How the show builds</SectionTitle>
      <div className="avoid-break">
        <div className="mb-1 text-xs text-zinc-600">
          Shots and fireworks cost every {o.binSec} s{show.scenes.length > 0 && ', colored by the scene that fires them · bands: scenes'}
        </div>
        <BuildChart o={o} scenes={show.scenes} showPrices={options.cost} />
      </div>

      <div className="mt-5 grid grid-cols-5 gap-3" data-testid="overview-stats">
        <Tile label="Shots" value={count(o.shots)} />
        <Tile label="Fireworks fired" value={count(o.pieces)} />
        <Tile label="Different products" value={count(o.products)} />
        <Tile label="Cues" value={count(o.cues)} />
        <Tile label="Firing positions" value={count(o.positions.length)} />
        <Tile label="Busiest moment" value={count(o.peak?.shots ?? 0)} sub={`shots / ${o.binSec} s`} />
        <Tile label="Average pace" value={minutes > 0 ? count(o.shots / minutes) : '0'} sub="shots / min" />
        {finale !== null ? (
          <Tile label="Last minute" value={`${Math.round(finale)}%`} sub="of all shots" />
        ) : (
          <Tile label="Scenes" value={count(o.scenes.length)} />
        )}
        {lull > 0 ? (
          <Tile label="Longest quiet stretch" value={formatTime(lull, 0)} />
        ) : (
          <Tile label="Longest quiet stretch" value="None" sub="always firing" />
        )}
        {options.cost ? (
          <Tile label="Fireworks cost" value={dollars(o.cost)} sub={minutes > 0 ? `${dollars(o.cost / minutes)} / min` : undefined} />
        ) : o.largest ? (
          <Tile label="Biggest effect" value={<span className="text-[20px]">{o.largest}</span>} />
        ) : (
          <Tile label="Closest audience" value={o.nearestFt !== null ? formatLengthFt(o.nearestFt, u) : '—'} />
        )}
      </div>
    </section>
  );
}

/** Page 3: the scenes in order beside the site map, as big as the page allows. */
function WherePage({ show, o }: { show: Show; o: ShowOverview }) {
  const u = show.settings.units;
  return (
    <section className="break-before grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-8" data-testid="overview-where">
      {o.scenes.length > 0 ? (
        <div data-testid="overview-scene-list">
          <SectionTitle>{plural(o.scenes.length, 'scene')}</SectionTitle>
          {o.scenes.map((s) => (
            <div
              key={s.scene.id}
              className="grid grid-cols-[14px_minmax(0,1fr)_88px_56px_70px] items-center gap-2.5 border-b border-zinc-200 py-1.5 text-sm"
            >
              <span className="h-3.5 w-3.5 rounded-sm" style={{ background: s.scene.color }} />
              <span className="truncate font-semibold">{s.scene.name}</span>
              <span className="text-zinc-700 tabular-nums">{range(s.scene)}</span>
              <span className="text-right tabular-nums">{count(s.shots)}</span>
              <span className="h-2 overflow-hidden rounded bg-zinc-100">
                <span className="block h-full" style={{ width: `${pctOf(s.shots, o.shots)}%`, background: s.scene.color }} />
              </span>
            </div>
          ))}
          <div className="mt-1 text-xs text-zinc-600">Columns: time · shots · share of all shots</div>
        </div>
      ) : (
        <div>
          <SectionTitle>Most shots</SectionTitle>
          {o.lineup
            .flatMap((g) => g.rows)
            .sort((a, b) => b.shots - a.shots)
            .slice(0, 8)
            .map((r) => (
              <div key={r.item.id} className="flex justify-between gap-3 border-b border-zinc-200 py-1.5 text-sm">
                <span>
                  <span className="font-semibold">{r.item.name}</span> <span className="text-zinc-600">{describeProduct(r.item)}</span>
                </span>
                <span className="tabular-nums">{plural(r.shots, 'shot')}</span>
              </div>
            ))}
        </div>
      )}
      <div className="flex min-w-0 flex-col" data-testid="overview-site">
        <SectionTitle>Where it happens</SectionTitle>
        <div className="relative h-[140mm] rounded-lg border border-zinc-300">
          <SiteThumb show={show} className="absolute inset-1 h-[calc(100%-0.5rem)] w-[calc(100%-0.5rem)]" />
        </div>
        {o.nearestFt !== null && (
          <div className="mt-1 text-xs text-zinc-600">
            The audience is at least {formatLengthFt(o.nearestFt, u)} from the nearest firing position.
          </div>
        )}
      </div>
    </section>
  );
}

const pctOf = (n: number, total: number) => (total > 0 ? (n / total) * 100 : 0);
const percent = (n: number, total: number) => {
  const p = pctOf(n, total);
  return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`;
};

/** The left-hand label column of the chart; rows without one get an empty spacer. */
const GUTTER = 'grid grid-cols-[60px_minmax(0,1fr)] gap-x-2';

/** One row of bars over time, colored by scene, with a callout on its tallest bar. */
function BarRow({
  label,
  sub,
  o,
  values,
  sceneIds,
  sceneColor,
  peak,
  callout,
  empty,
  height,
  testId,
}: {
  label: string;
  sub: ReactNode;
  o: ShowOverview;
  values: number[];
  sceneIds: (string | null)[];
  sceneColor: Map<string, string>;
  peak: IntensityBin | null;
  callout: ReactNode;
  empty: string | null;
  height: string;
  testId: string;
}) {
  const span = Math.max(o.bins.length * o.binSec, 1);
  const top = Math.max(...values, 0);
  const peakPct = peak ? (peak.startSec + o.binSec / 2) / span : 0;
  return (
    <div className={GUTTER}>
      <div className="flex flex-col justify-end pb-0.5 text-right leading-tight">
        <span className="text-sm font-bold">{label}</span>
        <span className="text-[11px] text-zinc-600">{sub}</span>
      </div>
      <div className={`relative border-b border-zinc-900 ${height}`} data-testid={testId}>
        {empty && <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-600">{empty}</div>}
        {top > 0 && (
          <svg viewBox={`0 0 ${span} 100`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
            {o.bins.map((b, i) => {
              const h = (values[i] / top) * 92;
              return (
                <rect
                  key={b.startSec}
                  x={b.startSec + o.binSec * 0.08}
                  width={o.binSec * 0.84}
                  y={100 - h}
                  height={h}
                  fill={sceneColor.get(sceneIds[i] ?? '') ?? NO_SCENE}
                />
              );
            })}
          </svg>
        )}
        {peak && top > 0 && (
          <div
            className="absolute top-0 rounded border border-zinc-900 bg-white px-1.5 py-0.5 text-xs leading-tight whitespace-nowrap"
            style={{
              left: `${peakPct * 100}%`,
              transform: peakPct > 0.5 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
            }}
            data-testid={`${testId}-peak`}
          >
            {callout}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * How the show builds: shots per bin and fireworks cost per bin, one above the other on a
 * shared time axis, with scene bands on top. The two can differ: a few big cakes cost a lot
 * for few shots. Without prices, the cost row has no dollar amounts, only shares of the whole.
 */
function BuildChart({ o, scenes, showPrices }: { o: ShowOverview; scenes: Scene[]; showPrices: boolean }) {
  const span = Math.max(o.bins.length * o.binSec, 1);
  const pct = (t: number) => `${(Math.min(Math.max(t, 0), span) / span) * 100}%`;
  const tickStep = [10, 15, 30, 60, 120, 300, 600].find((s) => span / s <= 8) ?? 900;
  const ticks = Array.from({ length: Math.floor(span / tickStep) + 1 }, (_, i) => i * tickStep).filter((t) => t <= o.durationSec);
  const sceneColor = new Map(scenes.map((s) => [s.id, s.color]));
  const per = `per ${o.binSec} s`;

  return (
    <div className="flex flex-col gap-1.5" data-testid="overview-chart">
      {scenes.length > 0 && (
        <div className={GUTTER}>
          <span />
          <div className="relative h-9">
            {scenes.map((s) => (
              <div
                key={s.id}
                className="absolute top-0 overflow-hidden border-t-[6px] pt-0.5 pr-1 text-xs leading-tight"
                style={{ left: pct(s.startSec), width: `calc(${pct(s.endSec)} - ${pct(s.startSec)})`, borderColor: s.color }}
              >
                <div className="truncate font-semibold">{s.name}</div>
                <div className="truncate text-zinc-600 tabular-nums">{range(s)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <BarRow
        label="Shots"
        sub={per}
        o={o}
        values={o.bins.map((b) => b.shots)}
        sceneIds={o.binSceneIds}
        sceneColor={sceneColor}
        peak={o.peak}
        empty={o.shots === 0 ? 'Nothing is timed yet. Give cues fire times on the Timeline.' : null}
        height="h-40"
        testId="overview-peak-shots"
        callout={
          o.peak && (
            <span data-testid="overview-peak">
              <strong>Busiest at {formatTime(o.peak.startSec, 0)}</strong>
              <br />
              {plural(o.peak.shots, 'shot')} in {o.binSec} seconds
            </span>
          )
        }
      />
      <BarRow
        label="Cost"
        sub={
          showPrices ? (
            per
          ) : (
            <>
              share
              <br />
              {per}
            </>
          )
        }
        o={o}
        values={o.bins.map((b) => b.cost)}
        sceneIds={o.binCostSceneIds}
        sceneColor={sceneColor}
        peak={o.costPeak}
        empty={o.shots > 0 && o.cost === 0 ? 'No prices yet. Add them in Inventory.' : null}
        height="h-28"
        testId="overview-cost-chart"
        callout={
          o.costPeak && (
            <span data-testid="overview-cost-peak">
              <strong>Most spent at {formatTime(o.costPeak.startSec, 0)}</strong>
              <br />
              {showPrices ? dollars(o.costPeak.cost) : `${percent(o.costPeak.cost, o.cost)} of the cost`} in {o.binSec} seconds
            </span>
          )
        }
      />
      <div className={GUTTER}>
        <span />
        <div className="relative -mt-1 h-4 text-xs text-zinc-700 tabular-nums">
          {ticks.map((t, i) => (
            <span
              key={t}
              className="absolute top-0.5"
              style={{ left: pct(t), transform: i === 0 ? undefined : 'translateX(-50%)' }}
            >
              {formatTime(t, 0)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- scenes ----------

function MiniBars({ bins, color, top }: { bins: IntensityBin[]; color: string; top: number }) {
  if (!bins.length) return null;
  const start = bins[0].startSec;
  const span = bins[bins.length - 1].endSec - start;
  return (
    <svg viewBox={`0 0 ${span} 40`} preserveAspectRatio="none" className="h-10 w-full border-b border-zinc-400" aria-hidden>
      {bins.map((b) => {
        const h = (b.shots / Math.max(top, 1)) * 38;
        return <rect key={b.startSec} x={b.startSec - start + (b.endSec - b.startSec) * 0.1} width={(b.endSec - b.startSec) * 0.8} y={40 - h} height={h} fill={color} />;
      })}
    </svg>
  );
}

function ScenesSection({ show, o, options }: { show: Show; o: ShowOverview; options: OverviewOptions }) {
  const top = o.peak?.shots ?? 1;
  return (
    <section className="break-before" data-testid="overview-scenes">
      <SectionTitle aside={`${plural(o.scenes.length, 'scene')} · ${formatTime(o.durationSec, 0)}`}>Scene by scene</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        {o.scenes.map((s) => (
          <article
            key={s.scene.id}
            className="avoid-break flex flex-col gap-2.5 rounded-lg border border-t-8 border-zinc-300 px-4 py-3"
            style={{ borderTopColor: s.scene.color }}
            data-testid="overview-scene"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-xl font-bold">{s.scene.name}</h3>
              <div className="text-sm font-semibold tabular-nums">{range(s.scene)}</div>
            </div>
            <div className="text-[13px] text-zinc-700 tabular-nums">
              {[
                plural(Math.round(s.scene.endSec - s.scene.startSec), 'second'),
                plural(s.shots, 'shot'),
                options.cost && dollars(s.cost),
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
            <MiniBars bins={s.bins} color={s.scene.color} top={top} />
            {s.scene.note.trim() && <p className="text-sm text-zinc-800 italic">{s.scene.note.trim()}</p>}
            {s.products.length > 0 ? (
              <div className="flex flex-col gap-1">
                <div className="text-xs font-semibold tracking-wider text-zinc-600 uppercase">Featuring</div>
                {s.products.slice(0, FEATURED_MAX).map((p) => (
                  <div key={p.item.id} className="flex justify-between gap-3 text-sm">
                    <span>
                      <span className="font-semibold">{p.item.name}</span>{' '}
                      <span className="text-zinc-600">{describeProduct(p.item)}</span>
                    </span>
                    <span className="whitespace-nowrap text-zinc-700 tabular-nums">×{p.qty}</span>
                  </div>
                ))}
                {s.products.length > FEATURED_MAX && (
                  <div className="text-sm text-zinc-600">and {plural(s.products.length - FEATURED_MAX, 'more product')}</div>
                )}
              </div>
            ) : (
              <div className="text-sm text-zinc-600">Nothing fires in this scene yet.</div>
            )}
            {s.positionIds.length > 0 && (
              <div className="mt-auto flex flex-wrap gap-1.5">
                {s.positionIds.map((id) => {
                  const p = show.positions.find((x) => x.id === id)!;
                  return (
                    <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 px-2 py-0.5 text-xs">
                      <Dot color={p.color} size={9} />
                      {p.name}
                    </span>
                  );
                })}
              </div>
            )}
          </article>
        ))}
      </div>
      {o.unscened.shots > 0 && (
        <p className="mt-3 text-sm text-zinc-600">
          {plural(o.unscened.shots, 'more shot')} fire between scenes.
        </p>
      )}
    </section>
  );
}

// ---------- lineup ----------

/** A QR code as crisp SVG squares, for following a link from paper. */
function QrCode({ text, size = 64 }: { text: string; size?: number }) {
  const path = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { d, n };
  }, [text]);
  return (
    <svg viewBox={`-2 -2 ${path.n + 4} ${path.n + 4}`} width={size} height={size} role="img" aria-label={`QR code for ${text}`} shapeRendering="crispEdges">
      <rect x={-2} y={-2} width={path.n + 4} height={path.n + 4} fill="#fff" />
      <path d={path.d} fill="#000" />
    </svg>
  );
}

function LineupSection({ show, o, options }: { show: Show; o: ShowOverview; options: OverviewOptions }) {
  const sceneById = new Map(show.scenes.map((s) => [s.id, s]));
  const hasScenes = o.scenes.length > 0;
  const links = options.links && o.lineup.some((g) => g.rows.some((r) => safeHref(r.item.url)));
  const cols = 5 + (hasScenes ? 1 : 0) + (options.cost ? 1 : 0) + (links ? 1 : 0);

  return (
    <section className="break-before" data-testid="overview-lineup">
      <SectionTitle aside={`${plural(o.pieces, 'firework')} · ${plural(o.products, 'product')} · ${plural(o.shots, 'shot')}`}>
        What's in the show
      </SectionTitle>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-900 text-left text-xs text-zinc-600">
            <th className="py-1.5 pr-2 font-semibold">Product</th>
            <th className="px-2 font-semibold">Effects</th>
            <th className="px-2 font-semibold">Colors</th>
            <th className="px-2 text-right font-semibold">Shots each</th>
            <th className="px-2 text-right font-semibold">Qty</th>
            {hasScenes && <th className="px-2 font-semibold">In scenes</th>}
            {options.cost && <th className="px-2 text-right font-semibold">Price each</th>}
            {links && <th className="pl-2 text-right font-semibold">Link</th>}
          </tr>
        </thead>
        <tbody>
          {o.lineup.map((g) => [
            <tr key={g.kind} className="avoid-break">
              <td colSpan={cols} className="border-b border-zinc-400 pt-4 pb-1 text-[17px] font-bold">
                {g.label} <span className="text-sm font-normal text-zinc-600">· {plural(g.pieces, 'piece')}</span>
              </td>
            </tr>,
            ...g.rows.map((r) => {
              const looks = productLooks(r.item);
              const href = safeHref(r.item.url);
              const shotsEach = r.qty ? r.shots / r.qty : 0;
              return (
                <tr key={r.item.id} className="avoid-break border-b border-zinc-200 align-top" data-testid="overview-product">
                  <td className="py-2 pr-2">
                    <div className="font-semibold">
                      {href && options.links ? (
                        <a href={href} className="text-zinc-900 underline decoration-zinc-400">
                          {r.item.name}
                        </a>
                      ) : (
                        r.item.name
                      )}
                    </div>
                    <div className="text-xs text-zinc-600">{describeProduct(r.item)}</div>
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      {looks.effects.map((e) => (
                        <span key={e} className="rounded border border-zinc-400 px-1.5 text-xs">
                          {e}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs">
                      {looks.colors.map((c) => (
                        <span key={c} className="inline-flex items-center gap-1">
                          <Dot color={COLOR_HEX[c]} />
                          {c}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-2 text-right tabular-nums">{count(shotsEach)}</td>
                  <td className="p-2 text-right tabular-nums">×{r.qty}</td>
                  {hasScenes && (
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {r.sceneIds.map((id) => {
                          const s = sceneById.get(id)!;
                          return (
                            <span key={id} className="rounded px-1.5 text-xs font-semibold text-white" style={{ background: s.color }}>
                              {s.name}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  )}
                  {options.cost && <td className="p-2 text-right tabular-nums">{formatMoney(r.unitCost)}</td>}
                  {links && (
                    <td className="py-1.5 pl-2 text-right">{href && <span className="inline-block"><QrCode text={href} size={56} /></span>}</td>
                  )}
                </tr>
              );
            }),
          ])}
        </tbody>
      </table>
      {links && (
        <p className="mt-3 text-xs text-zinc-600">Product names link to their pages in the PDF. On paper, scan a code with your phone.</p>
      )}
    </section>
  );
}

// ---------- cost, safety and site ----------

/** A thin bar showing a share of the whole. */
function ShareBar({ share, color }: { share: number; color: string }) {
  return (
    <span className="h-3 overflow-hidden rounded-sm bg-zinc-100">
      <span className="block h-full" style={{ width: `${Math.min(share, 100)}%`, background: color }} />
    </span>
  );
}

/**
 * Where the show's shots and cost go, by scene and by kind. Always printed; without prices
 * (the Cost option off) it shows shares of the whole instead of dollar amounts.
 */
function BreakdownSection({ show, o, cost, wide }: { show: Show; o: ShowOverview; cost: boolean; wide: boolean }) {
  const minutes = o.durationSec / 60;
  const byScene = [
    ...o.scenes.map((s) => ({ key: s.scene.id, name: s.scene.name, color: s.scene.color, shots: s.shots, cost: s.cost })),
    ...(o.unscened.shots > 0 || o.unscened.cost > 0
      ? [{ key: 'none', name: 'Between scenes', color: NO_SCENE, shots: o.unscened.shots, cost: o.unscened.cost }]
      : []),
  ];
  const scenes = byScene.length > 0 && (
    <div className="avoid-break flex flex-col gap-1.5" data-testid="overview-by-scene">
      <h3 className="text-[15px] font-bold">By scene</h3>
      <div className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 border-b border-zinc-900 pb-1 text-xs text-zinc-600">
        <span className="font-semibold">Scene</span>
        <span className="font-semibold">Share of shots</span>
        <span className="font-semibold">Share of cost</span>
      </div>
      {byScene.map((s) => (
        <div key={s.key} className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 text-sm">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="truncate font-semibold">{s.name}</span>
          </span>
          <span className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-2">
            <ShareBar share={pctOf(s.shots, o.shots)} color={s.color} />
            <span className="text-right tabular-nums">{percent(s.shots, o.shots)}</span>
          </span>
          <span className={`grid items-center gap-2 ${cost ? 'grid-cols-[minmax(0,1fr)_40px_56px]' : 'grid-cols-[minmax(0,1fr)_40px]'}`}>
            <ShareBar share={pctOf(s.cost, o.cost)} color={s.color} />
            <span className="text-right tabular-nums">{percent(s.cost, o.cost)}</span>
            {cost && <span className="text-right text-zinc-700 tabular-nums">{dollars(s.cost)}</span>}
          </span>
        </div>
      ))}
    </div>
  );
  const kinds = (
    <div className="avoid-break" data-testid="overview-by-kind">
      <h3 className="mb-1 text-[15px] font-bold">By kind</h3>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-900 text-left text-xs text-zinc-600">
            <th className="py-1 font-semibold">Kind</th>
            <th className="text-right font-semibold">Pieces</th>
            <th className="text-right font-semibold">Shots</th>
            <th className="text-right font-semibold">Share of cost</th>
            {cost && <th className="text-right font-semibold">Cost</th>}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {o.lineup.map((g) => (
            <tr key={g.kind} className="border-b border-zinc-200">
              <td className="py-1.5">{g.label}</td>
              <td className="text-right">{count(g.pieces)}</td>
              <td className="text-right">{count(g.shots)}</td>
              <td className="text-right">{percent(g.cost, o.cost)}</td>
              {cost && <td className="text-right">{dollars(g.cost)}</td>}
            </tr>
          ))}
          <tr className="font-bold">
            <td className="py-1.5">Total</td>
            <td className="text-right">{count(o.pieces)}</td>
            <td className="text-right">{count(o.shots)}</td>
            <td className="text-right">{o.cost > 0 ? '100%' : '0%'}</td>
            {cost && <td className="text-right">{dollars(o.cost)}</td>}
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-xs text-zinc-600">
        {cost ? (
          <>
            Fireworks only{show.catalog.some((c) => c.kind === 'cake' && c.assortmentId) && ', with assortment prices shared across their cakes'}.
            Fuse, igniters and supplies are on the cost spreadsheet.
          </>
        ) : (
          'Shares of cost count the fireworks only.'
        )}
      </p>
    </div>
  );

  return (
    <section data-testid="overview-breakdown">
      <SectionTitle aside={!cost && `${plural(o.pieces, 'firework')} · ${plural(o.shots, 'shot')}`}>{cost ? 'Cost' : 'Breakdown'}</SectionTitle>
      {cost && (
        <div className="mb-5 grid grid-cols-3 gap-2.5" data-testid="overview-cost">
          <Tile label="Fireworks" value={dollars(o.cost)} />
          <Tile label="Per minute" value={minutes > 0 ? dollars(o.cost / minutes) : '—'} />
          <Tile label="Per shot" value={o.shots > 0 ? formatMoney(o.cost / o.shots) : '—'} />
        </div>
      )}
      <div className={wide ? 'grid grid-cols-2 items-start gap-10' : 'flex flex-col gap-5'}>
        {scenes}
        {kinds}
      </div>
    </section>
  );
}

function SafetySection({ show, o }: { show: Show; o: ShowOverview }) {
  const u = show.settings.units;
  const { meta, firing } = show;
  const facts: [string, string][] = [
    [
      'Fireworks',
      [o.proLine ? '1.4G consumer fireworks, including Pro-line cakes.' : 'All 1.4G consumer fireworks.', o.largest && `Largest: ${o.largest}.`]
        .filter(Boolean)
        .join(' '),
    ],
    ['Firing', `Electric, from a ${firing.controller.name} remote. Nobody goes near the positions once they are armed.`],
    ...(o.nearestFt !== null
      ? ([['Audience', `At least ${formatLengthFt(o.nearestFt, u)} from the nearest firing position.`]] as [string, string][])
      : []),
    ['Kept clear', "Each position's safety radius, from setup until after the final check."],
    ...([
      ['On hand', meta.safetyEquipment],
      ['Crew', meta.crew],
      ['On the night', meta.contact],
    ] as [string, string][]).filter(([, v]) => v.trim()),
  ];

  return (
    <section data-testid="overview-safety">
      <SectionTitle>Safety and site</SectionTitle>
      <dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-3.5 gap-y-2 text-sm">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-semibold">{k}</dt>
            <dd>{v.trim()}</dd>
          </div>
        ))}
      </dl>
      {o.positions.length > 0 && (
        <div className="avoid-break mt-5">
          <h3 className="mb-1 text-[15px] font-bold">Firing positions</h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-900 text-left text-xs text-zinc-600">
                <th className="py-1 font-semibold">Position</th>
                <th className="text-right font-semibold">To audience</th>
                <th className="text-right font-semibold">Kept clear</th>
                <th className="text-right font-semibold">Pieces</th>
                <th className="pl-3 font-semibold">Largest</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {o.positions.map((p) => (
                <tr key={p.position.id} className="border-b border-zinc-200">
                  <td className="py-1.5">
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <Dot color={p.position.color} />
                      {p.position.name}
                    </span>
                  </td>
                  <td className="text-right">{formatLengthFt(p.audienceFt, u)}</td>
                  <td className="text-right">{formatLengthFt(p.position.safetyRadiusFt, u)}</td>
                  <td className="text-right">{count(p.pieces)}</td>
                  <td className="pl-3">{p.largest ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
