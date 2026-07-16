import { useId } from 'react';
import { motion } from 'motion/react';
import { moonIllumination, moonPhaseName } from '../../lib/weather';
import { useSkyNow } from '../../lib/skyTime';

/** Sun-arc geometry shared by the path and the dot that rides it. */
const CX = 110;
const CY = 104;
const R = 88;
const ARC_LENGTH = Math.PI * R;

function arcPoint(fraction: number): { x: number; y: number } {
  const angle = Math.PI * fraction;
  return { x: CX - R * Math.cos(angle), y: CY - R * Math.sin(angle) };
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function daylightLabel(sunrise: string, sunset: string): string {
  const minutes = Math.round((Date.parse(sunset) - Date.parse(sunrise)) / 60_000);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} m of daylight`;
}

interface SunArcProps {
  sunrise: string | null;
  sunset: string | null;
  /** Skips the caption line for tight slots (the overview card). */
  compact?: boolean;
}

/**
 * The sun's day drawn as an arc: the track is the whole daylight window, the lit
 * sweep is how much of it has passed, and the dot is where the sun is right now.
 */
export function SunArc({ sunrise, sunset, compact }: Readonly<SunArcProps>) {
  const gradientId = `${useId().replaceAll(':', '')}-sun`;
  // Follows the sky-preview slider when it's on, so the arc scrubs with the sky.
  const now = useSkyNow().getTime();
  if (!sunrise || !sunset) {
    return (
      <p className="text-sm text-ink-faint">
        {sunrise ? 'The sun never sets today.' : 'Polar night: the sun stays below the horizon.'}
      </p>
    );
  }

  const rise = Date.parse(sunrise);
  const set = Date.parse(sunset);
  const fraction = Math.min(1, Math.max(0, (now - rise) / (set - rise)));
  const sunUp = now >= rise && now <= set;
  const sun = arcPoint(fraction);

  let caption = daylightLabel(sunrise, sunset);
  if (now < rise) caption = `Sun rises ${timeLabel(sunrise)} · ${caption}`;
  else if (now > set) caption = `Sun has set · ${caption}`;

  return (
    <div className="min-w-0">
      <svg viewBox="0 0 220 118" className="w-full" role="img" aria-label={`Sunrise ${timeLabel(sunrise)}, sunset ${timeLabel(sunset)}`}>
        <defs>
          <linearGradient id={gradientId} x1="22" y1="104" x2="198" y2="104" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--color-accent-weather)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--color-accent-weather)" />
          </linearGradient>
        </defs>
        {/* Horizon */}
        <line x1="8" y1="104" x2="212" y2="104" stroke="var(--color-card-border)" strokeWidth="1" />
        {/* Full day track */}
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          stroke="var(--color-track)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {/* Elapsed daylight sweep, drawn in on mount */}
        {sunUp && (
          <motion.path
            d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={ARC_LENGTH}
            initial={{ strokeDashoffset: ARC_LENGTH }}
            animate={{ strokeDashoffset: ARC_LENGTH * (1 - fraction) }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          />
        )}
        {/* The sun itself */}
        {sunUp && (
          <motion.g
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.9, type: 'spring', stiffness: 260, damping: 18 }}
            style={{ transformOrigin: `${sun.x}px ${sun.y}px` }}
          >
            <circle className="weather-sun-glow" cx={sun.x} cy={sun.y} r="11" fill="var(--color-accent-weather)" opacity="0.25" />
            <circle
              className="weather-sun-dot"
              cx={sun.x}
              cy={sun.y}
              r="5.5"
              fill="var(--color-accent-weather)"
              stroke="var(--color-card)"
              strokeWidth="2"
            />
          </motion.g>
        )}
        {/* Sunrise / sunset endpoints */}
        <text x={CX - R} y="115" textAnchor="middle" className="fill-(--color-ink-muted)" fontSize="9" fontWeight="600">
          ↑ {timeLabel(sunrise)}
        </text>
        <text x={CX + R} y="115" textAnchor="middle" className="fill-(--color-ink-muted)" fontSize="9" fontWeight="600">
          ↓ {timeLabel(sunset)}
        </text>
      </svg>
      {!compact && <p className="mt-2 text-center text-[11px] text-ink-faint">{caption}</p>}
    </div>
  );
}

interface MoonDiscProps {
  phaseDeg: number;
  /** Rendered size in CSS pixels. */
  size?: number;
}

/** Lunar maria and craters, drawn once and clipped to whatever part of the disc is lit. */
function MoonSurface() {
  return (
    <>
      {/* Maria: the large dark basins that make the face recognizable */}
      <g fill="light-dark(#334155, #64748b)" opacity="0.22">
        <ellipse cx="-0.28" cy="-0.32" rx="0.34" ry="0.26" transform="rotate(-18 -0.28 -0.32)" />
        <ellipse cx="0.18" cy="-0.1" rx="0.28" ry="0.22" transform="rotate(12 0.18 -0.1)" />
        <ellipse cx="-0.12" cy="0.3" rx="0.22" ry="0.16" transform="rotate(-8 -0.12 0.3)" />
      </g>
      {/* Craters, each with a shifted core so they read as dented, not stamped */}
      <g fill="light-dark(#334155, #475569)">
        <circle cx="0.45" cy="0.38" r="0.11" opacity="0.2" />
        <circle cx="0.47" cy="0.4" r="0.07" opacity="0.22" />
        <circle cx="-0.5" cy="0.18" r="0.08" opacity="0.18" />
        <circle cx="-0.485" cy="0.195" r="0.05" opacity="0.2" />
        <circle cx="0.12" cy="0.58" r="0.06" opacity="0.16" />
        <circle cx="0.58" cy="-0.35" r="0.055" opacity="0.18" />
        <circle cx="-0.15" cy="-0.62" r="0.05" opacity="0.16" />
        <circle cx="0.33" cy="0.15" r="0.04" opacity="0.15" />
      </g>
    </>
  );
}

/**
 * The lit part of the moon as a two-arc path: one limb of the disc plus the
 * terminator, a half-ellipse whose x-radius is |cos(phase)|. 0° new → 180° full.
 */
export function MoonDisc({ phaseDeg, size = 72 }: Readonly<MoonDiscProps>) {
  const prefix = useId().replaceAll(':', '');
  const phase = ((phaseDeg % 360) + 360) % 360;
  const rx = Math.abs(Math.cos((phase * Math.PI) / 180));
  const waxing = phase < 180;
  // Terminator bulges toward +x in quadrants 1 and 3, −x in 2 and 4.
  const termSweep = Math.floor(phase / 90) % 2 === 0 ? 0 : 1;
  const litPath =
    phase === 0
      ? ''
      : `M 0 -1 A 1 1 0 0 ${waxing ? 1 : 0} 0 1 A ${rx} 1 0 0 ${termSweep} 0 -1 Z`;

  return (
    <svg
      viewBox="-1.2 -1.2 2.4 2.4"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${moonPhaseName(phase)}, ${Math.round(moonIllumination(phase) * 100)}% illuminated`}
    >
      <defs>
        <radialGradient id={`${prefix}-dark`} cx="38%" cy="32%" r="80%">
          <stop offset="0" stopColor="light-dark(#dbe2ec, #232c3b)" />
          <stop offset="1" stopColor="light-dark(#c6cfdd, #131a26)" />
        </radialGradient>
        <radialGradient id={`${prefix}-lit`} cx="38%" cy="32%" r="85%">
          <stop offset="0" stopColor="light-dark(#a7b4c8, #fdfdf9)" />
          <stop offset="0.75" stopColor="light-dark(#8b9ab2, #e2e8f2)" />
          <stop offset="1" stopColor="light-dark(#7688a3, #b9c3d6)" />
        </radialGradient>
        <clipPath id={`${prefix}-disc`}>
          <circle r="1" />
        </clipPath>
        <clipPath id={`${prefix}-litclip`}>
          {litPath ? <path d={litPath} /> : <rect x="0" y="0" width="0" height="0" />}
        </clipPath>
        {/* Softens only the terminator; the outer limb stays crisp thanks to the disc clip */}
        <filter id={`${prefix}-soft`}>
          <feGaussianBlur stdDeviation="0.025" />
        </filter>
      </defs>
      {/* Dark side, faintly visible the way earthshine renders it */}
      <circle r="1" fill={`url(#${prefix}-dark)`} />
      <g clipPath={`url(#${prefix}-disc)`} opacity="0.35">
        <MoonSurface />
      </g>
      {/* Lit side */}
      {litPath && (
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.25 }}>
          <g clipPath={`url(#${prefix}-disc)`}>
            <path d={litPath} fill={`url(#${prefix}-lit)`} filter={`url(#${prefix}-soft)`} />
          </g>
          <g clipPath={`url(#${prefix}-litclip)`}>
            <MoonSurface />
          </g>
        </motion.g>
      )}
      <circle r="1" fill="none" stroke="var(--color-card-border)" strokeWidth="0.02" />
    </svg>
  );
}
