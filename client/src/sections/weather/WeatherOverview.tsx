import { useId } from 'react';
import type { WeatherData } from '@personal-dashboard/shared';
import { motion } from 'motion/react';
import { useWidget } from '../../useWidget';
import { WidgetBody } from '../../components/WidgetCard';
import { deg, glyph, moonPhaseName, symbolLabel, uvLevel, weatherLocation, windCompass } from '../../lib/weather';
import { MoonDisc, SunArc } from './astro';
import './weather.css';

function Chip({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <span className="rounded-full bg-track/40 px-2.5 py-1 text-[11px] text-ink-muted">
      <span className="font-semibold text-ink">{value}</span> {label}
    </span>
  );
}

/** Small always-on temperature sparkline for the next hours; endpoint-labeled, details live on the section page. */
function HourSparkline({ hours }: Readonly<{ hours: WeatherData['hours'] }>) {
  const gradientId = `${useId().replaceAll(':', '')}-spark`;
  if (hours.length < 2) return null;
  const W = 100;
  const H = 30;
  const temps = hours.map((h) => h.temperature);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const span = Math.max(max - min, 2);
  const xAt = (i: number) => (i / (hours.length - 1)) * W;
  const yAt = (t: number) => 4 + (H - 8) * (1 - (t - min) / span);
  const line = temps.map((t, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(t)}`).join(' ');
  const peakIndex = temps.indexOf(max);

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between text-[10px] text-ink-faint">
        <span className="uppercase tracking-[0.12em]">Next {hours.length} hours</span>
        <span className="tabular-nums">peak {deg(max)} · {hours[peakIndex].hourLabel}:00</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-16 w-full" aria-label="Temperature over the next hours">
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
      <div className="flex justify-between text-[10px] tabular-nums text-ink-faint">
        <span>{hours[0].hourLabel}:00</span>
        <span>{hours[Math.floor((hours.length - 1) / 2)].hourLabel}:00</span>
        <span>{hours.at(-1)!.hourLabel}:00</span>
      </div>
    </div>
  );
}

export function WeatherOverview() {
  const { envelope, offline } = useWidget<WeatherData>('weather');
  return (
    <WidgetBody envelope={envelope} offline={offline}>
      {(data) => {
        const today = data.days[0];
        const rain12h = Math.round(data.hours.slice(0, 12).reduce((sum, hour) => sum + hour.precipitationMm, 0) * 10) / 10;
        return (
          <div className="grid items-center gap-x-6 gap-y-4 lg:grid-cols-[minmax(12rem,0.9fr)_minmax(0,1.2fr)_minmax(13rem,0.9fr)]">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-4xl" aria-hidden>{glyph(data.current.symbol)}</span>
                <div>
                  <p className="text-4xl font-semibold tracking-[-0.05em]">{deg(data.current.temperature)}</p>
                  <p className="text-xs text-ink-muted">{symbolLabel(data.current.symbol)} · {weatherLocation(data.location)}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {today && <Chip value={`${deg(today.minTemperature)} / ${deg(today.maxTemperature)}`} label="today" />}
                <Chip value={`${Math.round(data.current.windSpeed)} m/s`} label={data.current.windDirectionDeg != null ? windCompass(data.current.windDirectionDeg) : 'wind'} />
                {data.current.humidity != null && <Chip value={`${Math.round(data.current.humidity)}%`} label="humidity" />}
                {data.current.uvIndex != null && <Chip value={data.current.uvIndex.toFixed(1)} label={`UV · ${uvLevel(data.current.uvIndex).label.toLowerCase()}`} />}
                {rain12h > 0 && <Chip value={`${rain12h} mm`} label="rain next 12 h" />}
              </div>
            </div>
            <HourSparkline hours={data.hours.slice(0, 12)} />
            <div className="flex items-center gap-4">
              {data.sun && (
                <div className="min-w-0 flex-1">
                  <SunArc sunrise={data.sun.sunrise} sunset={data.sun.sunset} compact />
                </div>
              )}
              {data.moon && (
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <MoonDisc phaseDeg={data.moon.phaseDeg} size={44} />
                  <p className="text-[10px] text-ink-faint">{moonPhaseName(data.moon.phaseDeg)}</p>
                </div>
              )}
            </div>
          </div>
        );
      }}
    </WidgetBody>
  );
}
