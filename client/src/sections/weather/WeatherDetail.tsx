import { useId, useState } from 'react';
import type { WeatherData } from '@personal-dashboard/shared';
import { motion } from 'motion/react';
import { WidgetBody, WidgetShell } from '../../components/WidgetCard';
import { SystemFooter } from '../../components/SystemFooter';
import { useWidget } from '../../useWidget';
import { deg, glyph, moonIllumination, moonPhaseName, symbolLabel, uvLevel, weatherLocation, windCompass } from '../../lib/weather';
import { mapsCoordinatesHref } from '../../lib/maps';
import { DetailIntro, DetailSectionHeading } from '../DetailIntro';
import { MoonDisc, SunArc } from './astro';
import './weather.css';

const PRECIP_COLOR = 'light-dark(#0d7fc4, #5ec2ff)';

/* ── Intro signals ─────────────────────────────────────────────────────────── */

function WeatherSignals({ data }: Readonly<{ data: WeatherData }>) {
  const today = data.days[0];
  return (
    <div className="detail-signal-panel">
      <div className="flex items-center gap-4">
        <span className="text-5xl" aria-hidden>{glyph(data.current.symbol)}</span>
        <div>
          <p className="text-4xl font-semibold tracking-[-0.06em]">{deg(data.current.temperature)}</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {symbolLabel(data.current.symbol)}
            {today && <span className="text-ink-faint"> · {deg(today.minTemperature)} / {deg(today.maxTemperature)}</span>}
          </p>
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
  const next12h = Math.round(data.hours.reduce((sum, hour) => sum + hour.precipitationMm, 0) * 10) / 10;
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

/** A small widget, not a full card: the disc sits beside its one caption line. */
function MoonPanel({ moon }: Readonly<{ moon: NonNullable<WeatherData['moon']> }>) {
  const illumination = Math.round(moonIllumination(moon.phaseDeg) * 100);
  return (
    <div className="flex items-center gap-3">
      <motion.div
        initial={{ opacity: 0, scale: 0.88 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.15 }}
        className="shrink-0"
        style={{
          filter: `drop-shadow(0 0 ${5 + illumination * 0.14}px light-dark(rgb(118 136 163 / ${0.12 + illumination * 0.003}), rgb(231 237 248 / ${0.1 + illumination * 0.004})))`,
        }}
      >
        <MoonDisc phaseDeg={moon.phaseDeg} size={52} />
      </motion.div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tracking-[-0.01em]">{moonPhaseName(moon.phaseDeg)}</p>
        <p className="mt-0.5 truncate text-xs text-ink-muted">
          {illumination}% lit · {nextMoonEventLabel(moon.phaseDeg)}
        </p>
      </div>
    </div>
  );
}

/* ── Next 12 hours ─────────────────────────────────────────────────────────── */

const CHART_W = 100;
const CHART_H = 34;

function HourlyChart({ hours }: Readonly<{ hours: WeatherData['hours'] }>) {
  const gradientId = `${useId().replaceAll(':', '')}-hourly`;
  const [active, setActive] = useState<number | null>(null);
  if (hours.length < 2) return <p className="text-sm text-ink-faint">Hourly forecast is syncing.</p>;

  const temps = hours.map((h) => h.temperature);
  const min = Math.floor(Math.min(...temps)) - 1;
  const max = Math.ceil(Math.max(...temps)) + 1;
  const xAt = (i: number) => ((i + 0.5) / hours.length) * CHART_W;
  const yAt = (t: number) => CHART_H - ((t - min) / (max - min)) * CHART_H;
  const line = temps.map((t, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(t)}`).join(' ');

  const rainMax = Math.max(...hours.map((h) => h.precipitationMm));
  const totalRain = Math.round(hours.reduce((sum, h) => sum + h.precipitationMm, 0) * 10) / 10;
  const peak = temps.indexOf(Math.max(...temps));

  const readNearest = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const i = Math.min(hours.length - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * hours.length)));
    setActive(i);
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
      {/* Condition strip, one glyph per hour slot so it lines up with the plot and labels */}
      <div className="mb-2 flex text-base" aria-hidden>
        {hours.map((hour, i) => (
          <span
            key={hour.time}
            className={`flex-1 text-center transition-opacity ${active != null && active !== i ? 'opacity-35' : ''}`}
          >
            {glyph(hour.symbol)}
          </span>
        ))}
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
          className="h-32 w-full touch-none"
          aria-label={`Temperature over the next ${hours.length} hours`}
          onPointerMove={readNearest}
          onPointerDown={readNearest}
          onPointerLeave={() => setActive(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--color-accent-weather)" stopOpacity="0.2" />
              <stop offset="1" stopColor="var(--color-accent-weather)" stopOpacity="0" />
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
              stroke="var(--color-accent-weather)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {hours.map((hour, i) => (
              <path
                key={hour.time}
                d={`M${xAt(i)},${yAt(hour.temperature)} l0.01,0`}
                stroke="var(--color-accent-weather)"
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
      {/* Rain, on its own scale below the same time axis (never a second y-axis) */}
      {rainMax > 0 && (
        <div className="mt-1 flex h-8 items-end" aria-label="Precipitation per hour">
          {hours.map((hour, i) => (
            <div key={hour.time} className="flex h-full flex-1 items-end justify-center">
              {hour.precipitationMm > 0 && (
                <motion.div
                  className="w-1/2 max-w-4 rounded-t-[3px]"
                  style={{ background: PRECIP_COLOR, opacity: active == null || active === i ? 0.85 : 0.4 }}
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max((hour.precipitationMm / rainMax) * 100, 12)}%` }}
                  transition={{ duration: 0.7, delay: 0.5 + i * 0.03, ease: [0.22, 1, 0.36, 1] }}
                />
              )}
            </div>
          ))}
        </div>
      )}
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-ink-faint">
        {hours.map((hour, i) => (
          <span key={hour.time} className={`flex-1 text-center ${i % 2 === 1 ? 'invisible sm:visible' : ''}`}>
            {hour.hourLabel}
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-card-border pt-2">
        <p className="min-w-0 truncate text-[11px] tabular-nums text-ink-muted">{readout}</p>
        <p className="shrink-0 text-[9px] uppercase tracking-[0.12em] text-ink-faint">°C{rainMax > 0 ? ' · mm' : ''}</p>
      </div>
    </div>
  );
}

/* ── Week ahead ────────────────────────────────────────────────────────────── */

function WeekAhead({ data }: Readonly<{ data: WeatherData }>) {
  const [active, setActive] = useState<number | null>(null);
  const days = data.days;
  if (days.length === 0) return <p className="text-sm text-ink-faint">The forecast is syncing.</p>;
  const weekMin = Math.min(...days.map((d) => d.minTemperature));
  const weekMax = Math.max(...days.map((d) => d.maxTemperature));
  const span = Math.max(weekMax - weekMin, 1);

  return (
    <div onPointerLeave={() => setActive(null)}>
      {days.map((day, i) => {
        const left = ((day.minTemperature - weekMin) / span) * 100;
        const width = Math.max(((day.maxTemperature - day.minTemperature) / span) * 100, 4);
        const isToday = i === 0;
        const showCurrent = isToday
          && data.current.temperature >= day.minTemperature
          && data.current.temperature <= day.maxTemperature;
        return (
          <motion.div
            key={day.date}
            className={`grid grid-cols-[2.9rem_1.75rem_3.4rem_1fr] items-center gap-3 rounded-xl px-2 py-2.5 transition-colors sm:grid-cols-[3.25rem_2rem_4rem_1fr] ${active === i ? 'bg-track/30' : ''}`}
            onPointerEnter={() => setActive(i)}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 + i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className={`text-sm ${isToday ? 'font-semibold' : 'text-ink-muted'}`}>{isToday ? 'Today' : day.dayLabel}</span>
            <span className="text-lg" aria-hidden>{glyph(day.symbol)}</span>
            <span className="text-right text-xs tabular-nums" style={{ color: day.precipitationMm > 0 ? PRECIP_COLOR : 'var(--color-ink-faint)' }}>
              {day.precipitationMm > 0 ? `${day.precipitationMm} mm` : '—'}
            </span>
            <div className="grid grid-cols-[2rem_1fr_2rem] items-center gap-2">
              <span className="text-right text-sm tabular-nums text-ink-faint">{deg(day.minTemperature)}</span>
              <div className="relative h-1.5 rounded-full bg-track">
                <motion.div
                  className="absolute inset-y-0 rounded-full"
                  style={{
                    left: `${left}%`,
                    background: 'linear-gradient(90deg, color-mix(in oklab, var(--color-accent-weather) 45%, transparent), var(--color-accent-weather))',
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${width}%` }}
                  transition={{ delay: 0.2 + i * 0.05, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                />
                {showCurrent && (
                  <span
                    aria-label={`Now: ${deg(data.current.temperature)}`}
                    className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
                    style={{
                      left: `${((data.current.temperature - weekMin) / span) * 100}%`,
                      boxShadow: '0 0 0 2px var(--color-card)',
                    }}
                  />
                )}
              </div>
              <span className="text-sm font-medium tabular-nums">{deg(day.maxTemperature)}</span>
            </div>
          </motion.div>
        );
      })}
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

      <DetailSectionHeading label="Now" title="Current conditions" detail="Wind, humidity, UV and rain, as of the latest forecast." />
      <WidgetShell title="Conditions">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ConditionTiles data={data} />}
        </WidgetBody>
      </WidgetShell>

      <div className="mt-6">
        <DetailSectionHeading label="Sky" title="Sun & moon" detail="Where the sun is in its day, and what the moon is doing tonight." />
        <div className="grid gap-4 lg:grid-cols-[1.8fr_1fr]">
          <WidgetShell title="Daylight">
            <WidgetBody envelope={envelope} offline={offline}>
              {(data) =>
                data.sun ? (
                  <SunArc sunrise={data.sun.sunrise} sunset={data.sun.sunset} />
                ) : (
                  <p className="text-sm text-ink-faint">Sun times are syncing.</p>
                )
              }
            </WidgetBody>
          </WidgetShell>
          <WidgetShell title="Moon">
            <WidgetBody envelope={envelope} offline={offline}>
              {(data) =>
                data.moon ? <MoonPanel moon={data.moon} /> : <p className="text-sm text-ink-faint">Moon data is syncing.</p>
              }
            </WidgetBody>
          </WidgetShell>
        </div>
      </div>

      <div className="mt-6">
        <DetailSectionHeading label="Hourly" title="The next 12 hours" detail="Temperature with rain below it, hour by hour. Tap or hover an hour for its exact values." />
        <WidgetShell title="Hour by hour">
          <WidgetBody envelope={envelope} offline={offline}>
            {(data) => <HourlyChart hours={data.hours} />}
          </WidgetBody>
        </WidgetShell>
      </div>

      <div className="mt-6">
        <DetailSectionHeading label="Outlook" title="The week ahead" detail="Each day's range on the week's shared temperature scale. The dot marks where the temperature sits right now." />
        <WidgetShell title="7-day forecast">
          <WidgetBody envelope={envelope} offline={offline}>
            {(data) => <WeekAhead data={data} />}
          </WidgetBody>
        </WidgetShell>
      </div>

      <SystemFooter />
    </div>
  );
}
