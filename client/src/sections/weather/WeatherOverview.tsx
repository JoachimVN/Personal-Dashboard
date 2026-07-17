import { useId } from 'react';
import type { ReactNode } from 'react';
import type { WeatherData } from '@personal-dashboard/shared';
import { motion } from 'motion/react';
import { useWidget } from '../../useWidget';
import { WidgetBody } from '../../components/WidgetCard';
import { deg, glyph, HUMIDITY_COLOR, symbolLabel, uvLevel, weatherLocation, WIND_COLOR, windCompass } from '../../lib/weather';
import './weather.css';

function MiniStat({ label, value, children }: Readonly<{ label: string; value: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[9px] uppercase tracking-[0.1em] text-ink-faint">{label}</span>
      {children}
      <span className="text-[11px] font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/** Same needle-on-a-compass language as the detail page's wind tile, just small enough to sit
 * in a row of three — a glyph alone can't say "which way", the needle can. */
export function WindGauge({ speed, directionDeg }: Readonly<{ speed: number; directionDeg?: number }>) {
  const toward = directionDeg == null ? null : (directionDeg + 180) % 360;
  const direction = directionDeg == null ? '' : ` ${windCompass(directionDeg)}`;
  return (
    <MiniStat label="Wind" value={`${Math.round(speed)} m/s${direction}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <circle cx="16" cy="16" r="13" fill="none" stroke="var(--color-track)" strokeWidth="2" />
        {toward != null && (
          <g style={{ transform: `rotate(${toward}deg)`, transformOrigin: '16px 16px' }}>
            <path d="M16 5 l2.2 5.4h-4.4Z" fill={WIND_COLOR} />
            <line x1="16" y1="10" x2="16" y2="23" stroke={WIND_COLOR} strokeWidth="1.6" strokeLinecap="round" opacity="0.5" />
          </g>
        )}
        <circle cx="16" cy="16" r="1.6" fill="var(--color-ink-faint)" />
      </svg>
    </MiniStat>
  );
}

/** Circular counterpart to the detail page's humidity bar — a ring reads faster at this size than a bar. */
export function HumidityGauge({ humidity }: Readonly<{ humidity: number }>) {
  const r = 12;
  const circumference = 2 * Math.PI * r;
  return (
    <MiniStat label="Humidity" value={`${Math.round(humidity)}%`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8 -rotate-90" aria-hidden>
        <circle cx="16" cy="16" r={r} fill="none" stroke="var(--color-track)" strokeWidth="3" />
        <circle
          cx="16" cy="16" r={r} fill="none" stroke={HUMIDITY_COLOR} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - humidity / 100)}
        />
      </svg>
    </MiniStat>
  );
}

/** Small version of the detail page's UV arc, colored from the same WHO band as its `uvLevel()` label. */
export function UvGauge({ uvIndex }: Readonly<{ uvIndex: number }>) {
  const level = uvLevel(uvIndex);
  const fraction = Math.min(uvIndex / 11, 1);
  const r = 12;
  const arc = Math.PI * r;
  return (
    <MiniStat label="UV" value={`${uvIndex.toFixed(1)} ${level.label}`}>
      <svg viewBox="0 0 32 20" className="h-6 w-8" aria-hidden>
        <path d={`M 3 18 A ${r} ${r} 0 0 1 29 18`} fill="none" stroke="var(--color-track)" strokeWidth="3" strokeLinecap="round" />
        <path
          d={`M 3 18 A ${r} ${r} 0 0 1 29 18`} fill="none" stroke={level.color} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={arc} strokeDashoffset={arc * (1 - fraction)}
        />
      </svg>
    </MiniStat>
  );
}

function MiniConditions({ data }: Readonly<{ data: WeatherData }>) {
  return (
    <div className="mt-4 flex items-start gap-5">
      <WindGauge speed={data.current.windSpeed} directionDeg={data.current.windDirectionDeg} />
      {data.current.humidity != null && <HumidityGauge humidity={data.current.humidity} />}
      {data.current.uvIndex != null && <UvGauge uvIndex={data.current.uvIndex} />}
    </div>
  );
}

/** Small always-on temperature sparkline for the next hours; endpoint-labeled, details live on the section page. */
function HourSparkline({ hours }: Readonly<{ hours: WeatherData['hours'] }>) {
  const gradientId = `${useId().replaceAll(':', '')}-spark`;
  if (hours.length < 2) return null;
  const W = 100;
  const H = 46;
  const temps = hours.map((h) => h.temperature);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const span = Math.max(max - min, 2);
  const xAt = (i: number) => (i / (hours.length - 1)) * W;
  const yAt = (t: number) => 5 + (H - 10) * (1 - (t - min) / span);
  const line = temps.map((t, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(t)}`).join(' ');
  const peakIndex = temps.indexOf(max);

  return (
    <div className="flex h-full min-w-0 flex-col justify-center">
      <div className="mb-2 flex items-baseline justify-between text-xs text-ink-faint">
        <span className="uppercase tracking-[0.12em]">Next {hours.length} hours</span>
        <span className="tabular-nums">peak {deg(max)} · {hours[peakIndex].hourLabel}:00</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-28 w-full" aria-label="Temperature over the next hours">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-accent-weather)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--color-accent-weather)" stopOpacity="0" />
          </linearGradient>
          {/* Left-to-right reveal. Animating pathLength instead breaks into dashes when
              combined with non-scaling-stroke, since dashes are measured in screen space. */}
          <clipPath id={`${gradientId}-reveal`}>
            <motion.rect
              x="0"
              y="0"
              height={H}
              initial={{ width: 0 }}
              animate={{ width: W }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
            />
          </clipPath>
        </defs>
        <g clipPath={`url(#${gradientId}-reveal)`}>
          <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${gradientId})`} />
          <path
            d={line}
            fill="none"
            stroke="var(--color-accent-weather)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {/* Rain hints along the baseline */}
          {hours.map((hour, i) =>
            hour.precipitationMm > 0 ? (
              <path
                key={hour.time}
                d={`M${xAt(i)},${H - 1} l0.01,0`}
                stroke="light-dark(#0d7fc4, #5ec2ff)"
                strokeWidth={4}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null,
          )}
          <path
            d={`M${xAt(hours.length - 1)},${yAt(temps.at(-1)!)} l0.01,0`}
            stroke="var(--color-accent-weather)"
            strokeWidth={5}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-ink-faint">
        <span>{hours[0].hourLabel}:00</span>
        <span>{hours[Math.floor((hours.length - 1) / 2)].hourLabel}:00</span>
        <span>{hours.at(-1)!.hourLabel}:00</span>
      </div>
    </div>
  );
}

/** Next few days at a glance — forward-looking counterpart to the hourly sparkline, which
 * only covers today. Sun/moon detail lives on the full weather page, not repeated here. */
function WeekAheadMini({ days }: Readonly<{ days: WeatherData['days'] }>) {
  const upcoming = days.slice(1, 5);
  if (upcoming.length === 0) return null;
  return (
    <div className="flex h-full items-center justify-between gap-2">
      {upcoming.map((day) => (
        <div key={day.date} className="flex min-w-0 flex-col items-center gap-2.5">
          <span className="text-[10px] uppercase tracking-[0.1em] text-ink-faint">{day.dayLabel}</span>
          <span className="text-3xl" aria-hidden>{glyph(day.symbol)}</span>
          <span className="text-sm tabular-nums">
            <strong>{deg(day.maxTemperature)}</strong> <span className="text-ink-faint">{deg(day.minTemperature)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function WeatherOverview() {
  const { envelope, offline } = useWidget<WeatherData>('weather');
  return (
    <WidgetBody envelope={envelope} offline={offline}>
      {(data) => {
        const today = data.days[0];
        return (
          <div className="grid gap-x-6 gap-y-4 lg:grid-cols-[minmax(12rem,0.9fr)_minmax(0,1.2fr)_minmax(13rem,0.9fr)]">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-4xl" aria-hidden>{glyph(data.current.symbol)}</span>
                <div>
                  <p className="text-4xl font-semibold tracking-[-0.05em]">{deg(data.current.temperature)}</p>
                  <p className="text-xs text-ink-muted">
                    {symbolLabel(data.current.symbol)}
                    {today && <span className="text-ink-faint"> · {deg(today.minTemperature)}–{deg(today.maxTemperature)}</span>}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-ink-faint">{weatherLocation(data.location)}</p>
                </div>
              </div>
              <MiniConditions data={data} />
            </div>
            <HourSparkline hours={data.hours.slice(0, 12)} />
            <WeekAheadMini days={data.days} />
          </div>
        );
      }}
    </WidgetBody>
  );
}
