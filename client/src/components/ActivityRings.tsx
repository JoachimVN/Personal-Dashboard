import { motion, useInView, useReducedMotion } from 'motion/react';
import { useId, useRef } from 'react';
import type { HealthData } from '@personal-dashboard/shared';

interface ActivityRingsProps {
  activeEnergyKcal: number;
  exerciseMinutes: number;
  standHours: number;
  goals: HealthData['goals'];
}

interface CompactActivityRingsProps extends ActivityRingsProps {
  /** Rendered size in CSS pixels; defaults to the command-center tile size. */
  size?: number;
}

function ringLaps(value: number, goal: number) {
  if (!Number.isFinite(value) || !Number.isFinite(goal) || goal <= 0) return [0];

  const progress = Math.max(value / goal, 0);
  const completedLaps = Math.floor(progress);
  const remainder = progress % 1;

  // Each completed lap is a separate stroke. Rendering them in order lets the
  // final partial lap's rounded, shadowed tip sit over the completed ring.
  return [
    ...Array.from({ length: completedLaps }, () => 1),
    ...(remainder > 0 || completedLaps === 0 ? [remainder] : []),
  ];
}

function AnimatedRing({
  circumference,
  progress,
  delay,
  inView,
  ...props
}: Readonly<React.ComponentProps<typeof motion.circle> & {
  circumference: number;
  progress: number;
  delay: number;
  inView: boolean;
}>) {
  const prefersReducedMotion = useReducedMotion();
  const targetOffset = circumference * (1 - progress);

  return (
    <motion.circle
      {...props}
      initial={prefersReducedMotion ? false : { strokeDashoffset: circumference }}
      animate={{ strokeDashoffset: prefersReducedMotion || inView ? targetOffset : circumference }}
      transition={prefersReducedMotion ? { duration: 0 } : { duration: 1.4, delay, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}

function RingPaint({
  maskId,
  radius,
  strokeWidth,
  progress,
  phase,
  start,
  end,
  seamUnderTip,
  delay,
  inView,
}: Readonly<{
  maskId: string;
  radius: number;
  strokeWidth: number;
  progress: number;
  phase: number;
  start: string;
  end: string;
  seamUnderTip: boolean;
  delay: number;
  inView: boolean;
}>) {
  const circumference = 2 * Math.PI * radius;
  // Regular rings use the stroke's own rounded cap, so their seam belongs just
  // beyond it. Overflow rings supply a separate light cap above the stroke,
  // which needs the underlying paint to restart dark at the endpoint.
  const capAngle = Math.asin(Math.min(strokeWidth / 2 / radius, 1)) * (180 / Math.PI);
  const phaseAngle = phase * 360 + (seamUnderTip ? 0 : capAngle) + 90;
  const gradient = `conic-gradient(from ${phaseAngle}deg at 50% 50%, ${start} 0deg, ${start} 7deg, ${end} 345deg, ${end} 360deg)`;

  return (
    <>
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
        <AnimatedRing
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="white"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          circumference={circumference}
          progress={progress}
          delay={delay}
          inView={inView}
        />
      </mask>
      <foreignObject x="0" y="0" width="120" height="120" mask={`url(#${maskId})`}>
        <div style={{ width: 120, height: 120, background: gradient }} />
      </foreignObject>
    </>
  );
}

function OverflowTipShadow({
  radius,
  progress,
  strokeWidth,
  shadowColor,
  delay,
  inView,
}: Readonly<{
  radius: number;
  progress: number;
  strokeWidth: number;
  shadowColor: string;
  delay: number;
  inView: boolean;
}>) {
  const prefersReducedMotion = useReducedMotion();
  const angle = Math.PI * 2 * progress;
  const startX = 60 + radius;
  const startY = 60;
  const endX = 60 + radius * Math.cos(angle);
  const endY = 60 + radius * Math.sin(angle);
  const capRadius = strokeWidth / 2;
  // Apple-style ring tips cast their shadow a small distance *ahead* along
  // the arc. Deriving it from the next point keeps the scale right for every
  // ring radius; a small clockwise bias matches the native-looking angle.
  const shadowFilter = (tipAngle: number) => {
    const shadowAngle = tipAngle + Math.PI * 2 * 0.0075;
    const shadowDistance = radius * Math.hypot(
      Math.cos(shadowAngle) - Math.cos(tipAngle),
      Math.sin(shadowAngle) - Math.sin(tipAngle),
    );
    const shadowDirection = Math.atan2(
      Math.sin(shadowAngle) - Math.sin(tipAngle),
      Math.cos(shadowAngle) - Math.cos(tipAngle),
    ) + (Math.PI / 36);
    const shadowX = shadowDistance * Math.cos(shadowDirection);
    const shadowY = shadowDistance * Math.sin(shadowDirection);
    const shadowTint = `light-dark(color-mix(in srgb, ${shadowColor} 38%, transparent), color-mix(in srgb, ${shadowColor} 62%, transparent))`;
    return `drop-shadow(${shadowX}px ${shadowY}px 1.2px ${shadowTint})`;
  };

  const initialState = { cx: startX, cy: startY, filter: shadowFilter(0) };
  const finalState = { cx: endX, cy: endY, filter: shadowFilter(angle) };

  return (
    <motion.circle
      cx={endX}
      cy={endY}
      r={capRadius}
      fill={shadowColor}
      initial={prefersReducedMotion ? false : initialState}
      animate={prefersReducedMotion || inView ? finalState : initialState}
      transition={prefersReducedMotion ? { duration: 0 } : { duration: 1.4, delay, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}

function OverflowTipCap({
  radius,
  progress,
  strokeWidth,
  color,
  delay,
  inView,
}: Readonly<{
  radius: number;
  progress: number;
  strokeWidth: number;
  color: string;
  delay: number;
  inView: boolean;
}>) {
  const prefersReducedMotion = useReducedMotion();
  const angle = Math.PI * 2 * progress;
  const startX = 60 + radius;
  const startY = 60;
  const endX = 60 + radius * Math.cos(angle);
  const endY = 60 + radius * Math.sin(angle);
  const initialState = { cx: startX, cy: startY };
  const finalState = { cx: endX, cy: endY };

  return (
    <motion.circle
      cx={endX}
      cy={endY}
      r={strokeWidth / 2}
      fill={color}
      initial={prefersReducedMotion ? false : initialState}
      animate={prefersReducedMotion || inView ? finalState : initialState}
      transition={prefersReducedMotion ? { duration: 0 } : { duration: 1.4, delay, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}

export function ActivityRings({
  activeEnergyKcal,
  exerciseMinutes,
  standHours,
  goals,
}: Readonly<ActivityRingsProps>) {
  const gradientPrefix = useId().replaceAll(':', '');
  const svgRef = useRef<SVGSVGElement>(null);
  const inView = useInView(svgRef, { once: true, amount: 0.5 });
  const rings = [
    { id: 'move', label: 'Move', value: activeEnergyKcal, goal: goals.activeEnergyKcal, unit: 'kcal', start: '#d91f3b', end: '#ff5a8b', legend: 'light-dark(#ec4899, #ff5a8b)', track: 'light-dark(#f6c7d2, #4c0717)', radius: 48 },
    { id: 'exercise', label: 'Exercise', value: exerciseMinutes, goal: goals.exerciseMinutes, unit: 'min', start: '#70cc00', end: '#d4ff00', legend: 'light-dark(#84cc16, #d4ff00)', track: 'light-dark(#d8efc4, #173c0a)', radius: 33 },
    { id: 'stand', label: 'Stand', value: standHours, goal: goals.standHours, unit: 'hrs', start: '#00b7cb', end: '#48def4', legend: 'light-dark(#06b6d4, #48def4)', track: 'light-dark(#c3e9ee, #063940)', radius: 18 },
  ];

  return (
    <div className="rounded-2xl bg-track/25 p-3">
      <div className="flex items-center gap-4">
        <svg ref={svgRef} viewBox="0 0 120 120" className="h-32 w-32 shrink-0" aria-label="Daily activity rings" role="img">
          {rings.map((ring, index) => {
            const laps = ringLaps(ring.value, ring.goal);
            const hasOverflow = laps.length > 1;
            const totalProgress = Number.isFinite(ring.value) && Number.isFinite(ring.goal) && ring.goal > 0
              ? Math.max(ring.value / ring.goal, 0)
              : 0;
            const phase = totalProgress % 1;
            return (
              <g key={ring.id} transform="rotate(-90 60 60)">
                <circle cx="60" cy="60" r={ring.radius} fill="none" strokeWidth="14" style={{ stroke: 'light-dark(transparent, #090c10)' }} />
                <circle cx="60" cy="60" r={ring.radius} fill="none" strokeWidth="12" style={{ stroke: ring.track }} />
                {laps.map((progress, lapIndex) => {
                  const isOverflowPartial = hasOverflow && lapIndex === laps.length - 1 && progress > 0 && progress < 1;
                  return (
                    <g key={lapIndex}>
                      {isOverflowPartial && (
                        <OverflowTipShadow
                          radius={ring.radius}
                          progress={progress}
                          strokeWidth={12}
                          shadowColor={ring.start}
                          delay={index * 0.18}
                          inView={inView}
                        />
                      )}
                      <RingPaint
                        maskId={`${gradientPrefix}-${ring.id}-lap-${lapIndex}-mask`}
                        radius={ring.radius}
                        strokeWidth={12}
                        progress={progress}
                        phase={phase}
                        start={ring.start}
                        end={ring.end}
                        seamUnderTip={hasOverflow}
                        delay={index * 0.18}
                        inView={inView}
                      />
                      {isOverflowPartial && (
                        <OverflowTipCap
                          radius={ring.radius}
                          progress={progress}
                          strokeWidth={12}
                          color={ring.end}
                          delay={index * 0.18}
                          inView={inView}
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
        <div className="min-w-0 flex-1 space-y-2">
          {rings.map((ring) => (
            <div key={ring.id} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium" style={{ color: ring.legend }}>{ring.label}</span>
              <span className="tabular-nums text-ink-faint">
                <span className="font-semibold text-ink">{Math.round(ring.value).toLocaleString()}</span> / {ring.goal.toLocaleString()} {ring.unit}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A legend-free, tile-sized version of ActivityRings for compact slots (command-center tiles). */
export function CompactActivityRings({
  activeEnergyKcal,
  exerciseMinutes,
  standHours,
  goals,
  size = 40,
}: Readonly<CompactActivityRingsProps>) {
  const gradientPrefix = useId().replaceAll(':', '');
  const svgRef = useRef<SVGSVGElement>(null);
  const inView = useInView(svgRef, { once: true, amount: 0.5 });
  const rings = [
    { id: 'move', value: activeEnergyKcal, goal: goals.activeEnergyKcal, start: '#d91f3b', end: '#ff5a8b', track: 'light-dark(#f6c7d2, #4c0717)', radius: 48 },
    { id: 'exercise', value: exerciseMinutes, goal: goals.exerciseMinutes, start: '#70cc00', end: '#d4ff00', track: 'light-dark(#d8efc4, #173c0a)', radius: 33 },
    { id: 'stand', value: standHours, goal: goals.standHours, start: '#00b7cb', end: '#48def4', track: 'light-dark(#c3e9ee, #063940)', radius: 18 },
  ];

  return (
    <svg ref={svgRef} viewBox="0 0 120 120" style={{ width: size, height: size }} className="shrink-0" aria-label="Daily activity rings" role="img">
      {rings.map((ring, index) => {
        const laps = ringLaps(ring.value, ring.goal);
        const hasOverflow = laps.length > 1;
        const totalProgress = Number.isFinite(ring.value) && Number.isFinite(ring.goal) && ring.goal > 0
          ? Math.max(ring.value / ring.goal, 0)
          : 0;
        const phase = totalProgress % 1;
        return (
          <g key={ring.id} transform="rotate(-90 60 60)">
            <circle cx="60" cy="60" r={ring.radius} fill="none" strokeWidth="14" style={{ stroke: ring.track }} />
            {laps.map((progress, lapIndex) => {
              const isOverflowPartial = hasOverflow && lapIndex === laps.length - 1 && progress > 0 && progress < 1;
              return (
                <g key={lapIndex}>
                  {isOverflowPartial && (
                    <OverflowTipShadow
                      radius={ring.radius}
                      progress={progress}
                      strokeWidth={14}
                      shadowColor={ring.start}
                      delay={index * 0.18}
                      inView={inView}
                    />
                  )}
                  <RingPaint
                    maskId={`${gradientPrefix}-compact-${ring.id}-lap-${lapIndex}-mask`}
                    radius={ring.radius}
                    strokeWidth={14}
                    progress={progress}
                    phase={phase}
                    start={ring.start}
                    end={ring.end}
                    seamUnderTip={hasOverflow}
                    delay={index * 0.18}
                    inView={inView}
                  />
                  {isOverflowPartial && (
                    <OverflowTipCap
                      radius={ring.radius}
                      progress={progress}
                      strokeWidth={14}
                      color={ring.end}
                      delay={index * 0.18}
                      inView={inView}
                    />
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
