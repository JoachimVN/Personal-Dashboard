import { useId, useState } from 'react';
import type { WeatherData } from '@personal-dashboard/shared';
import { AnimatePresence, motion } from 'motion/react';
import { deg, glyph, HUMIDITY_COLOR, PRECIP_COLOR, symbolLabel, TEMP_COLOR, uvLevel, UV_COLOR, WIND_COLOR } from '../../lib/weather';

const CHART_W = 100;
const CHART_H = 34;

/** Apple-Weather-style UV ramp: a fixed vertical gradient over the WHO 0–11 scale (top =
 * extreme, bottom = low), sourced from `uvLevel()` so the colors never drift from the gauge. */
const UV_GRADIENT_STOPS = [11, 8, 6, 3, 0].map((v) => ({ offset: (11 - v) / 11, color: uvLevel(v).color }));

/** Condition glyphs, one per hour slot — rendered once above whichever stat is selected, so
 * switching tabs never changes the card's height and hovering any chart dims the same strip. */
function HourGlyphStrip({ hours, active }: Readonly<{ hours: WeatherData['hours']; active: number | null }>) {
  return (
    <div className="mb-2 flex gap-x-0.5 text-[clamp(0.5rem,2vw,1rem)]" aria-hidden>
      {hours.map((hour, i) => (
        <span
          key={hour.time}
          className={`min-w-0 flex-1 text-center transition-opacity ${active != null && active !== i ? 'opacity-35' : ''}`}
        >
          {glyph(hour.symbol)}
        </span>
      ))}
    </div>
  );
}

function HourAxisLabels({ hours }: Readonly<{ hours: WeatherData['hours'] }>) {
  return (
    <div className="mt-1 flex justify-between text-[10px] tabular-nums text-ink-faint">
      {hours.map((hour, i) => (
        <span key={hour.time} className={`flex-1 text-center ${i % 2 === 1 ? 'invisible sm:visible' : ''}`}>
          {hour.hourLabel}
        </span>
      ))}
    </div>
  );
}

/** Bottom readout row shared by every hourly chart, so all five stay exactly the same height. */
function HourlyReadout({ text, unit }: Readonly<{ text: string; unit: string }>) {
  return (
    <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-card-border pt-2">
      <p className="min-w-0 truncate text-[11px] tabular-nums text-ink-muted">{text}</p>
      <p className="shrink-0 text-[9px] uppercase tracking-[0.12em] text-ink-faint">{unit}</p>
    </div>
  );
}

interface HourlyChartProps {
  hours: WeatherData['hours'];
  active: number | null;
  onActiveChange: (index: number | null) => void;
}

function nearestHourlyIndex(event: React.PointerEvent<Element>, hourCount: number): number {
  const rect = event.currentTarget.getBoundingClientRect();
  const position = (event.clientX - rect.left) / rect.width;
  return Math.min(hourCount - 1, Math.max(0, Math.floor(position * hourCount)));
}

function HourlyChart({ hours, active, onActiveChange }: Readonly<HourlyChartProps>) {
  const gradientId = `${useId().replaceAll(':', '')}-hourly`;
  if (hours.length < 2) return <p className="text-sm text-ink-faint">Hourly forecast is syncing.</p>;

  const temps = hours.map((h) => h.temperature);
  const min = Math.floor(Math.min(...temps)) - 1;
  const max = Math.ceil(Math.max(...temps)) + 1;
  const xAt = (i: number) => ((i + 0.5) / hours.length) * CHART_W;
  const yAt = (t: number) => CHART_H - ((t - min) / (max - min)) * CHART_H;
  const line = temps.map((t, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(t)}`).join(' ');

  const peak = temps.indexOf(Math.max(...temps));

  const readNearest = (event: React.PointerEvent<Element>) => onActiveChange(nearestHourlyIndex(event, hours.length));

  let readout = `peak ${deg(temps[peak])} at ${hours[peak].hourLabel}:00`;
  if (active != null) {
    const hour = hours[active];
    readout = `${hour.hourLabel}:00 · ${symbolLabel(hour.symbol)} · ${deg(hour.temperature)}`;
  }

  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
          className="h-32 w-full touch-none"
          aria-label={`Temperature over the next ${hours.length} hours`}
          onPointerMove={readNearest}
          onPointerDown={readNearest}
          onPointerLeave={() => onActiveChange(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={TEMP_COLOR} stopOpacity="0.2" />
              <stop offset="1" stopColor={TEMP_COLOR} stopOpacity="0" />
            </linearGradient>
            {/* Left-to-right reveal. Animating pathLength instead breaks into dashes when
                combined with non-scaling-stroke, since dashes are measured in screen space. */}
            <clipPath id={`${gradientId}-reveal`}>
              <motion.rect
                x="0"
                y="0"
                height={CHART_H}
                initial={{ width: 0 }}
                animate={{ width: CHART_W }}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
              />
            </clipPath>
          </defs>
          {[0, CHART_H / 2, CHART_H].map((y) => (
            <line key={y} x1={0} y1={y} x2={CHART_W} y2={y} stroke="var(--color-card-border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <g clipPath={`url(#${gradientId}-reveal)`}>
            <path
              d={`${line} L${xAt(hours.length - 1)},${CHART_H} L${xAt(0)},${CHART_H} Z`}
              fill={`url(#${gradientId})`}
            />
            <path
              d={line}
              fill="none"
              stroke={TEMP_COLOR}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {hours.map((hour, i) => (
              <path
                key={hour.time}
                d={`M${xAt(i)},${yAt(hour.temperature)} l0.01,0`}
                stroke={TEMP_COLOR}
                strokeWidth={active === i ? 5 : 3.5}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        </svg>
        {active != null && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-px bg-ink-faint/40"
            style={{ left: `${(xAt(active) / CHART_W) * 100}%` }}
          />
        )}
      </div>
      <HourAxisLabels hours={hours} />
      <HourlyReadout text={readout} unit="°C" />
    </div>
  );
}

/** Rain-only hourly view — always draws the full-height bar row, even dry, so a 0mm stretch
 * still animates in like every other tab instead of collapsing to a bare line of text. */
function HourlyRainChart({ hours, active, onActiveChange }: Readonly<HourlyChartProps>) {
  const rainMax = Math.max(...hours.map((h) => h.precipitationMm), 0);
  const totalRain = Math.round(hours.reduce((sum, h) => sum + h.precipitationMm, 0) * 10) / 10;
  const readNearest = (event: React.PointerEvent<Element>) => onActiveChange(nearestHourlyIndex(event, hours.length));
  let readout = rainMax > 0 ? `${totalRain} mm total over the next ${hours.length} h` : `no rain expected in the next ${hours.length} h`;
  if (active != null) {
    const hour = hours[active];
    readout = `${hour.hourLabel}:00 · ${symbolLabel(hour.symbol)} · ${hour.precipitationMm.toFixed(1)} mm precipitation`;
  }

  return (
    <div>
      <div
        className="relative h-32 touch-none"
        aria-label="Precipitation per hour"
        onPointerMove={readNearest}
        onPointerDown={readNearest}
        onPointerLeave={() => onActiveChange(null)}
      >
        <div className="flex h-full items-end">
          {hours.map((hour, i) => (
            <div key={hour.time} className="flex h-full flex-1 items-end justify-center">
              {hour.precipitationMm > 0 && (
                <motion.div
                  className="w-1/2 max-w-5 rounded-t-[4px]"
                  style={{ background: PRECIP_COLOR, opacity: active == null || active === i ? 0.85 : 0.4 }}
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max((hour.precipitationMm / Math.max(rainMax, 1)) * 100, 8)}%` }}
                  transition={{ duration: 0.7, delay: 0.1 + i * 0.03, ease: [0.22, 1, 0.36, 1] }}
                />
              )}
            </div>
          ))}
        </div>
        {active != null && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-px bg-ink-faint/40"
            style={{ left: `${((active + 0.5) / hours.length) * 100}%` }}
          />
        )}
      </div>
      <HourAxisLabels hours={hours} />
      <HourlyReadout text={readout} unit="mm" />
    </div>
  );
}

/** Generic hourly line chart for a single numeric stat (UV, wind, humidity) — same visual
 * language as `HourlyChart`'s temperature line, minus the rain bars, which are stat-specific. */
function HourlyLineChart({
  hours,
  valueOf,
  format,
  unit,
  color,
  domain,
  verticalGradientStops,
  active,
  onActiveChange,
}: Readonly<
  HourlyChartProps & {
    valueOf: (hour: WeatherData['hours'][number]) => number | undefined;
    format: (value: number) => string;
    unit: string;
    color: string;
    /** Overrides the default "fit to this hour window" domain — needed when the vertical
     * position must mean something fixed, e.g. UV's WHO 0–11 scale. */
    domain?: readonly [number, number];
    /** Apple-Weather-style vertical ramp (top → bottom) used for the fill, line and points
     * instead of the flat translucent-fade `color`. Stops are fractions along the chart height. */
    verticalGradientStops?: readonly { offset: number; color: string }[];
  }
>) {
  const gradientId = `${useId().replaceAll(':', '')}-hourlystat`;
  const points = hours.map((hour, i) => ({ i, hour, value: valueOf(hour) })).filter((p): p is { i: number; hour: WeatherData['hours'][number]; value: number } => p.value != null);
  if (points.length < 2) return <p className="text-sm text-ink-faint">Not enough data for this stat yet.</p>;

  const values = points.map((p) => p.value);
  const [min, max] = domain ?? [Math.max(0, Math.floor(Math.min(...values) - 1)), Math.ceil(Math.max(...values) + 1)];
  const xAt = (i: number) => ((i + 0.5) / hours.length) * CHART_W;
  const yAt = (v: number) => CHART_H - ((v - min) / (max - min || 1)) * CHART_H;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(p.i)},${yAt(p.value)}`).join(' ');
  const paint = verticalGradientStops ? `url(#${gradientId})` : color;

  const peak = points.reduce((best, p) => (p.value > best.value ? p : best), points[0]);
  let readout = `peak ${format(peak.value)} at ${peak.hour.hourLabel}:00`;
  if (active != null) {
    const point = points.find((p) => p.i === active);
    if (point) readout = `${point.hour.hourLabel}:00 · ${format(point.value)}`;
  }
  const readNearest = (event: React.PointerEvent<Element>) => onActiveChange(nearestHourlyIndex(event, hours.length));

  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
          className="h-32 w-full touch-none"
          onPointerMove={readNearest}
          onPointerDown={readNearest}
          onPointerLeave={() => onActiveChange(null)}
        >
          <defs>
            {verticalGradientStops ? (
              <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={CHART_H}>
                {verticalGradientStops.map((stop) => (
                  <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
                ))}
              </linearGradient>
            ) : (
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity="0.2" />
                <stop offset="1" stopColor={color} stopOpacity="0" />
              </linearGradient>
            )}
            <clipPath id={`${gradientId}-reveal`}>
              <motion.rect x="0" y="0" height={CHART_H} initial={{ width: 0 }} animate={{ width: CHART_W }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }} />
            </clipPath>
          </defs>
          {[0, CHART_H / 2, CHART_H].map((y) => (
            <line key={y} x1={0} y1={y} x2={CHART_W} y2={y} stroke="var(--color-card-border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <g clipPath={`url(#${gradientId}-reveal)`}>
            <path
              d={`${line} L${xAt(points.at(-1)!.i)},${CHART_H} L${xAt(points[0].i)},${CHART_H} Z`}
              fill={`url(#${gradientId})`}
              fillOpacity={verticalGradientStops ? 0.55 : undefined}
            />
            <path d={line} fill="none" stroke={paint} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {points.map((p) => (
              <path
                key={p.hour.time}
                d={`M${xAt(p.i)},${yAt(p.value)} l0.01,0`}
                stroke={paint}
                strokeWidth={active === p.i ? 5 : 3.5}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        </svg>
        {active != null && (
          <div aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-ink-faint/40" style={{ left: `${(xAt(active) / CHART_W) * 100}%` }} />
        )}
      </div>
      <HourAxisLabels hours={hours} />
      <HourlyReadout text={readout} unit={unit} />
    </div>
  );
}

const HOURLY_TABS: { key: HourlyStatKey; label: string }[] = [
  { key: 'temperature', label: 'Temperature' },
  { key: 'rain', label: 'Rain' },
  { key: 'uv', label: 'UV' },
  { key: 'wind', label: 'Wind' },
  { key: 'humidity', label: 'Humidity' },
];

type HourlyStatKey = 'temperature' | 'rain' | 'uv' | 'wind' | 'humidity';

/** Today's hour-by-hour, switchable per stat — the daily counterpart to `WeekAheadSection`,
 * so "when will it rain / when's UV highest" has an answer for today, not just the week.
 * The glyph strip and active-hour hover state live here, above the tab switch, so every
 * stat renders inside the exact same frame and crossfades instead of jumping in height. */
export function HourlySection({ data }: Readonly<{ data: WeatherData }>) {
  const [stat, setStat] = useState<HourlyStatKey>('temperature');
  const [active, setActive] = useState<number | null>(null);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Hourly stat">
        {HOURLY_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={stat === tab.key}
            onClick={() => {
              setStat(tab.key);
              setActive(null);
            }}
            className={`weather-stat-tab ${stat === tab.key ? 'weather-stat-tab--active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <HourGlyphStrip hours={data.hours} active={active} />
      <AnimatePresence mode="wait">
        <motion.div
          key={stat}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          {stat === 'temperature' && <HourlyChart hours={data.hours} active={active} onActiveChange={setActive} />}
          {stat === 'rain' && <HourlyRainChart hours={data.hours} active={active} onActiveChange={setActive} />}
          {stat === 'uv' && (
            <HourlyLineChart hours={data.hours} valueOf={(h) => h.uvIndex} format={(v) => v.toFixed(1)} unit="" color={UV_COLOR} domain={[0, 11]} verticalGradientStops={UV_GRADIENT_STOPS} active={active} onActiveChange={setActive} />
          )}
          {stat === 'wind' && (
            <HourlyLineChart hours={data.hours} valueOf={(h) => h.windSpeed} format={(v) => `${Math.round(v)} m/s`} unit="m/s" color={WIND_COLOR} active={active} onActiveChange={setActive} />
          )}
          {stat === 'humidity' && (
            <HourlyLineChart hours={data.hours} valueOf={(h) => h.humidity} format={(v) => `${Math.round(v)}%`} unit="%" color={HUMIDITY_COLOR} active={active} onActiveChange={setActive} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
