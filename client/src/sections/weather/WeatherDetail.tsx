import { useId, useState } from 'react';
import type { WeatherData } from '@personal-dashboard/shared';
import { AnimatePresence, motion } from 'motion/react';
import { WidgetBody, WidgetShell } from '../../components/WidgetCard';
import { SystemFooter } from '../../components/SystemFooter';
import { useWidget } from '../../useWidget';
import { deg, feelsLike, glyph, HUMIDITY_COLOR, moonIllumination, moonPhaseName, symbolLabel, uvLevel, weatherLocation, WIND_COLOR, windCompass } from '../../lib/weather';
import { mapsCoordinatesHref } from '../../lib/maps';
import { DetailIntro, DetailSectionHeading } from '../DetailIntro';
import { MoonDisc, SunArc, timeLabel } from './astro';
import './weather.css';

const PRECIP_COLOR = 'light-dark(#0d7fc4, #5ec2ff)';
const TEMP_COLOR = 'var(--color-accent-weather)';
const UV_COLOR = 'light-dark(#c99a06, #ffd666)';
/** Apple-Weather-style UV ramp: a fixed vertical gradient over the WHO 0–11 scale (top =
 * extreme, bottom = low), sourced from `uvLevel()` so the colors never drift from the gauge. */
const UV_GRADIENT_STOPS = [11, 8, 6, 3, 0].map((v) => ({ offset: (11 - v) / 11, color: uvLevel(v).color }));

/* ── Intro signals ─────────────────────────────────────────────────────────── */

function WeatherSignals({ data }: Readonly<{ data: WeatherData }>) {
  const today = data.days[0];
  const feels = feelsLike(data.current.temperature, data.current.humidity, data.current.windSpeed);
  const showFeelsLike = Math.abs(feels - data.current.temperature) >= 1;
  return (
    <div className="detail-signal-panel lg:w-[22rem]">
      <div className="flex items-center gap-4">
        <span className="text-5xl" aria-hidden>{glyph(data.current.symbol)}</span>
        <div>
          <p className="text-4xl font-semibold tracking-[-0.06em]">{deg(data.current.temperature)}</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {symbolLabel(data.current.symbol)}
            {today && <span className="text-ink-faint"> · {deg(today.minTemperature)} / {deg(today.maxTemperature)}</span>}
          </p>
          {showFeelsLike && <p className="mt-0.5 text-xs text-ink-faint">Feels like {deg(feels)}</p>}
        </div>
      </div>
      <a
        href={mapsCoordinatesHref(data.location)}
        target="_blank"
        rel="noreferrer"
        className="mt-4 flex w-fit items-center gap-1 text-[11px] text-ink-faint underline decoration-card-border underline-offset-2 transition hover:text-ink"
      >
        <span aria-hidden>📍</span>
        {weatherLocation(data.location)}
      </a>
    </div>
  );
}

/* ── Condition tiles ───────────────────────────────────────────────────────── */

const tileVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

function Tile({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <motion.div variants={tileVariants} className="weather-tile">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">{label}</p>
      <div className="mt-2">{children}</div>
    </motion.div>
  );
}

/** Compass dial whose needle points where the wind is blowing (MET reports the FROM direction). */
function WindTile({ speed, directionDeg }: Readonly<{ speed: number; directionDeg?: number }>) {
  const toward = directionDeg == null ? null : (directionDeg + 180) % 360;
  return (
    <Tile label="Wind">
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 56 56" className="h-14 w-14 shrink-0" aria-hidden>
          <circle cx="28" cy="28" r="24" fill="none" stroke="var(--color-track)" strokeWidth="1.5" />
          {(['N', 'E', 'S', 'W'] as const).map((point, i) => {
            const angle = (i * Math.PI) / 2;
            const x = 28 + Math.sin(angle) * 19;
            const y = 28 - Math.cos(angle) * 19 + 2.6;
            return (
              <text key={point} x={x} y={y} textAnchor="middle" fontSize="6.5" fontWeight="600" className="fill-(--color-ink-faint)">
                {point}
              </text>
            );
          })}
          {toward != null && (
            <g className="weather-compass-needle" style={{ transform: `rotate(${toward}deg)` }}>
              <path d="M28 9 l3.4 8.5 h-6.8 Z" fill="var(--color-accent-weather)" />
              <line x1="28" y1="17" x2="28" y2="40" stroke="var(--color-accent-weather)" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
            </g>
          )}
          <circle cx="28" cy="28" r="2.2" fill="var(--color-ink-faint)" />
        </svg>
        <div>
          <p className="text-2xl font-semibold leading-none">
            {Math.round(speed)} <span className="text-xs font-medium text-ink-faint">m/s</span>
          </p>
          {directionDeg != null && <p className="mt-1 text-xs text-ink-muted">from {windCompass(directionDeg)}</p>}
        </div>
      </div>
    </Tile>
  );
}

function HumidityTile({ humidity }: Readonly<{ humidity: number }>) {
  return (
    <Tile label="Humidity">
      <p className="text-2xl font-semibold leading-none">
        {Math.round(humidity)}<span className="text-xs font-medium text-ink-faint">%</span>
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-track">
        <motion.div
          className="h-full rounded-full"
          style={{ background: PRECIP_COLOR }}
          initial={{ width: 0 }}
          animate={{ width: `${humidity}%` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
        />
      </div>
      <p className="mt-1.5 text-xs text-ink-muted">relative humidity</p>
    </Tile>
  );
}

/** Half-circle gauge over the 0–11+ UV scale; the WHO band color always ships with its label. */
function UvTile({ uvIndex }: Readonly<{ uvIndex: number }>) {
  const level = uvLevel(uvIndex);
  const fraction = Math.min(uvIndex / 11, 1);
  const r = 24;
  const arc = Math.PI * r;
  return (
    <Tile label="UV index">
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 56 34" className="h-12 w-16 shrink-0" aria-hidden>
          <path d={`M 4 30 A ${r} ${r} 0 0 1 52 30`} fill="none" stroke="var(--color-track)" strokeWidth="4" strokeLinecap="round" />
          <motion.path
            d={`M 4 30 A ${r} ${r} 0 0 1 52 30`}
            fill="none"
            stroke={level.color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={arc}
            initial={{ strokeDashoffset: arc }}
            animate={{ strokeDashoffset: arc * (1 - fraction) }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.35 }}
          />
        </svg>
        <div>
          <p className="text-2xl font-semibold leading-none">{uvIndex.toFixed(1)}</p>
          <p className="mt-1 text-xs text-ink-muted">{level.label}</p>
        </div>
      </div>
    </Tile>
  );
}

function PrecipitationTile({ data }: Readonly<{ data: WeatherData }>) {
  const next12h = Math.round(data.hours.slice(0, 12).reduce((sum, hour) => sum + hour.precipitationMm, 0) * 10) / 10;
  const nextHour = data.current.precipitationMm ?? data.hours[0]?.precipitationMm ?? 0;
  return (
    <Tile label="Precipitation">
      <p className="text-2xl font-semibold leading-none">
        {nextHour} <span className="text-xs font-medium text-ink-faint">mm next hour</span>
      </p>
      <p className="mt-1.5 text-xs text-ink-muted">
        {next12h > 0 ? `${next12h} mm over the next 12 h` : 'nothing expected in the next 12 h'}
      </p>
    </Tile>
  );
}

function ConditionTiles({ data }: Readonly<{ data: WeatherData }>) {
  return (
    <motion.div
      className="grid grid-cols-2 gap-2 lg:grid-cols-4"
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } } }}
    >
      <WindTile speed={data.current.windSpeed} directionDeg={data.current.windDirectionDeg} />
      {data.current.humidity != null && <HumidityTile humidity={data.current.humidity} />}
      {data.current.uvIndex != null && <UvTile uvIndex={data.current.uvIndex} />}
      <PrecipitationTile data={data} />
    </motion.div>
  );
}

/* ── Sun & moon ────────────────────────────────────────────────────────────── */

const SYNODIC_DAYS = 29.53;

/** Days until the moon reaches a target phase angle, walking forward through the lunation. */
function daysUntilPhase(phaseDeg: number, targetDeg: number): number {
  return ((((targetDeg - phaseDeg) % 360) + 360) % 360 / 360) * SYNODIC_DAYS;
}

function nextMoonEventLabel(phaseDeg: number): string {
  const toFull = daysUntilPhase(phaseDeg, 180);
  const toNew = daysUntilPhase(phaseDeg, 360);
  const [days, name] = toFull <= toNew ? [toFull, 'full moon'] : [toNew, 'new moon'];
  if (days < 1) return `${name} tonight`;
  const rounded = Math.round(days);
  return `${name} in ${rounded} ${rounded === 1 ? 'day' : 'days'}`;
}

/** Disc sized to stand on its own next to the full-width sun arc, not shrunk down as an aside. */
function MoonPanel({ moon }: Readonly<{ moon: NonNullable<WeatherData['moon']> }>) {
  const illumination = Math.round(moonIllumination(moon.phaseDeg) * 100);
  return (
    <div className="flex items-center gap-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.88 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.15 }}
        className="shrink-0"
        style={{
          filter: `drop-shadow(0 0 ${5 + illumination * 0.14}px light-dark(rgb(118 136 163 / ${0.12 + illumination * 0.003}), rgb(231 237 248 / ${0.1 + illumination * 0.004})))`,
        }}
      >
        <MoonDisc phaseDeg={moon.phaseDeg} size={92} />
      </motion.div>
      <div className="min-w-0">
        <p className="truncate text-base font-semibold tracking-[-0.01em]">{moonPhaseName(moon.phaseDeg)}</p>
        <p className="mt-1 truncate text-xs text-ink-muted">
          {illumination}% lit · {nextMoonEventLabel(moon.phaseDeg)}
        </p>
        {(moon.moonrise || moon.moonset) && (
          <p className="mt-1 truncate text-xs tabular-nums text-ink-faint">
            {moon.moonrise ? `↑ ${timeLabel(moon.moonrise)}` : 'no moonrise today'}
            {moon.moonrise && moon.moonset && '   '}
            {moon.moonset && `↓ ${timeLabel(moon.moonset)}`}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Next 24 hours ─────────────────────────────────────────────────────────── */

const CHART_W = 100;
const CHART_H = 34;

/** Condition glyphs, one per hour slot — rendered once above whichever stat is selected, so
 * switching tabs never changes the card's height and hovering any chart dims the same strip. */
function HourGlyphStrip({ hours, active }: Readonly<{ hours: WeatherData['hours']; active: number | null }>) {
  return (
    <div className="mb-2 flex text-base" aria-hidden>
      {hours.map((hour, i) => (
        <span key={hour.time} className={`flex-1 text-center transition-opacity ${active != null && active !== i ? 'opacity-35' : ''}`}>
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

function HourlyChart({ hours, active, onActiveChange }: Readonly<HourlyChartProps>) {
  const gradientId = `${useId().replaceAll(':', '')}-hourly`;
  if (hours.length < 2) return <p className="text-sm text-ink-faint">Hourly forecast is syncing.</p>;

  const temps = hours.map((h) => h.temperature);
  const min = Math.floor(Math.min(...temps)) - 1;
  const max = Math.ceil(Math.max(...temps)) + 1;
  const xAt = (i: number) => ((i + 0.5) / hours.length) * CHART_W;
  const yAt = (t: number) => CHART_H - ((t - min) / (max - min)) * CHART_H;
  const line = temps.map((t, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(t)}`).join(' ');

  const totalRain = Math.round(hours.reduce((sum, h) => sum + h.precipitationMm, 0) * 10) / 10;
  const peak = temps.indexOf(Math.max(...temps));

  const readNearest = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const i = Math.min(hours.length - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * hours.length)));
    onActiveChange(i);
  };

  let readout = `peak ${deg(temps[peak])} at ${hours[peak].hourLabel}:00`;
  if (totalRain > 0) readout += ` · ${totalRain} mm rain expected`;
  if (active != null) {
    const hour = hours[active];
    readout = `${hour.hourLabel}:00 · ${symbolLabel(hour.symbol)} · ${deg(hour.temperature)}`;
    if (hour.precipitationMm > 0) readout += ` · ${hour.precipitationMm} mm`;
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
      <HourlyReadout text={readout} unit={`°C${totalRain > 0 ? ' · mm' : ''}`} />
    </div>
  );
}

/** Rain-only hourly view — always draws the full-height bar row, even dry, so a 0mm stretch
 * still animates in like every other tab instead of collapsing to a bare line of text. */
function HourlyRainChart({ hours, active, onActiveChange }: Readonly<HourlyChartProps>) {
  const rainMax = Math.max(...hours.map((h) => h.precipitationMm), 0);
  const totalRain = Math.round(hours.reduce((sum, h) => sum + h.precipitationMm, 0) * 10) / 10;

  return (
    <div>
      <div className="flex h-32 items-end" aria-label="Precipitation per hour" onPointerLeave={() => onActiveChange(null)}>
        {hours.map((hour, i) => (
          <div key={hour.time} className="flex h-full flex-1 items-end justify-center" onPointerEnter={() => onActiveChange(i)}>
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
      <HourAxisLabels hours={hours} />
      <HourlyReadout
        text={rainMax > 0 ? `${totalRain} mm total over the next ${hours.length} h` : `no rain expected in the next ${hours.length} h`}
        unit="mm"
      />
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

  const readNearest = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const i = Math.min(hours.length - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * hours.length)));
    onActiveChange(i);
  };

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
function HourlySection({ data }: Readonly<{ data: WeatherData }>) {
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

/* ── Week ahead: switchable stats ─────────────────────────────────────────── */

type Day = WeatherData['days'][number];
type BarStatKey = 'temperature' | 'precipitation' | 'uv' | 'wind' | 'humidity';

interface StatMeta {
  label: string;
  color: string;
  domainMax?: number;
  value: (day: Day) => number | undefined;
  format: (value: number) => string;
}

const BAR_STATS: Record<BarStatKey, StatMeta> = {
  temperature: {
    label: 'Temperature',
    color: TEMP_COLOR,
    value: (day) => day.maxTemperature,
    format: (value) => deg(value),
  },
  precipitation: {
    label: 'Rain',
    color: PRECIP_COLOR,
    value: (day) => day.precipitationMm,
    format: (value) => (value > 0 ? `${value} mm` : '—'),
  },
  uv: {
    label: 'UV',
    color: UV_COLOR,
    domainMax: 11,
    value: (day) => day.maxUvIndex,
    format: (value) => value.toFixed(1),
  },
  wind: {
    label: 'Wind',
    color: WIND_COLOR,
    value: (day) => day.maxWindSpeed,
    format: (value) => `${Math.round(value)} m/s`,
  },
  humidity: {
    label: 'Humidity',
    color: HUMIDITY_COLOR,
    domainMax: 100,
    value: (day) => day.humidity,
    format: (value) => `${Math.round(value)}%`,
  },
};

const STAT_TABS: { key: BarStatKey; label: string }[] = (Object.keys(BAR_STATS) as BarStatKey[]).map((key) => ({
  key,
  label: BAR_STATS[key].label,
}));

/** One bar per day for a single stat — every tab (including temperature) reads identically:
 * day, glyph, a bar growing from the left, and the day's value. */
function WeekStatBars({ days, stat }: Readonly<{ days: Day[]; stat: BarStatKey }>) {
  const meta = BAR_STATS[stat];
  const values = days.map(meta.value).filter((value): value is number => value != null);
  if (values.length === 0) return <p className="text-sm text-ink-faint">Not enough data for this stat yet.</p>;
  const max = Math.max(meta.domainMax ?? 0, ...values, 1);

  return (
    <div>
      {days.map((day, i) => {
        const value = meta.value(day);
        const barValue = value == null ? null : Math.max(value, 0);
        const isToday = i === 0;
        const barColor = stat === 'uv' && value != null ? uvLevel(value).color : meta.color;
        return (
          <motion.div
            key={day.date}
            className="grid grid-cols-[2.9rem_1.75rem_1fr_3.4rem] items-center gap-3 rounded-xl px-2 py-2.5 sm:grid-cols-[3.25rem_2rem_1fr_3.8rem]"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 + i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className={`text-sm ${isToday ? 'font-semibold' : 'text-ink-muted'}`}>{isToday ? 'Today' : day.dayLabel}</span>
            <span className="text-lg" aria-hidden>{glyph(day.symbol)}</span>
            <div className="relative h-1.5 rounded-full bg-track">
              {barValue != null && (
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ background: barColor }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max((barValue / max) * 100, barValue > 0 ? 3 : 0)}%` }}
                  transition={{ delay: 0.2 + i * 0.05, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                />
              )}
            </div>
            <span className="text-right text-sm tabular-nums text-ink-faint">{value != null ? meta.format(value) : '—'}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

function WeekAheadSection({ data }: Readonly<{ data: WeatherData }>) {
  const [stat, setStat] = useState<BarStatKey>('temperature');
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Week-ahead stat">
        {STAT_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={stat === tab.key}
            onClick={() => setStat(tab.key)}
            className={`weather-stat-tab ${stat === tab.key ? 'weather-stat-tab--active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {/* Rows keep the same key across stat switches (day.date, unaffected by `stat`), so only
          the bar width/value re-render — the day label and glyph never remount or re-animate. */}
      <WeekStatBars days={data.days} stat={stat} />
    </div>
  );
}

/* ── Sky: sun arc + moon phase ────────────────────────────────────────────── */

/** Sun and moon, given a section of their own with room to breathe — the hero card is for
 * "what's the weather right now", not a squeezed-in arc diagram. */
function SkySection({ data }: Readonly<{ data: WeatherData }>) {
  if (!data.sun && !data.moon) return null;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-center lg:gap-8">
      <div className="min-w-0">
        {data.sun ? (
          <SunArc sunrise={data.sun.sunrise} sunset={data.sun.sunset} />
        ) : (
          <p className="text-sm text-ink-faint">Sun times are syncing.</p>
        )}
      </div>
      {data.moon && (
        <div className="border-t border-card-border pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <MoonPanel moon={data.moon} />
        </div>
      )}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export function WeatherDetail() {
  const { envelope, offline } = useWidget<WeatherData>('weather');
  return (
    <div>
      <DetailIntro
        eyebrow="Weather"
        title={<>Today&rsquo;s sky,<br /><span className="text-ink-faint">read closely.</span></>}
        description="Current conditions, the sun and moon, and the week ahead, straight from MET Norway."
        accent="var(--color-accent-weather)"
      >
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <WeatherSignals data={data} />}
        </WidgetBody>
      </DetailIntro>

      <DetailSectionHeading label="Hourly" title="The next 24 hours" detail="Switch stats to see when today's rain, UV, wind or humidity peaks — not just temperature." />
      <WidgetShell title="Hour by hour">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <HourlySection data={data} />}
        </WidgetBody>
      </WidgetShell>

      <div className="mt-6">
        <DetailSectionHeading label="Outlook" title="The week ahead" detail="Switch stats to compare temperature, rain, UV, wind or humidity across the week." />
        <WidgetShell title="7-day forecast">
          <WidgetBody envelope={envelope} offline={offline}>
            {(data) => <WeekAheadSection data={data} />}
          </WidgetBody>
        </WidgetShell>
      </div>

      <div className="mt-6">
        <DetailSectionHeading label="Now" title="Current conditions" detail="Wind, humidity, UV and rain, as of the latest forecast." />
        <WidgetShell title="Conditions">
          <WidgetBody envelope={envelope} offline={offline}>
            {(data) => <ConditionTiles data={data} />}
          </WidgetBody>
        </WidgetShell>
      </div>

      <div className="mt-6">
        <DetailSectionHeading label="Sky" title="Sun and moon" detail="Where the sun sits in today's arc, and tonight's moon phase." />
        <WidgetShell title="Sun & moon">
          <WidgetBody envelope={envelope} offline={offline}>
            {(data) => <SkySection data={data} />}
          </WidgetBody>
        </WidgetShell>
      </div>

      <SystemFooter />
    </div>
  );
}
