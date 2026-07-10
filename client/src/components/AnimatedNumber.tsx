import { useEffect } from 'react';
import { motion, useReducedMotion, useSpring, useTransform } from 'motion/react';

/**
 * Counts up from 0 on mount and glides between values on updates.
 * useSpring ignores MotionConfig's reducedMotion, so guard explicitly.
 */
export function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
  const reduced = useReducedMotion();
  const spring = useSpring(0, { stiffness: 120, damping: 24 });
  const display = useTransform(spring, (v) => `${Math.round(v)}${suffix}`);

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  if (reduced) {
    return (
      <span>
        {Math.round(value)}
        {suffix}
      </span>
    );
  }
  return <motion.span>{display}</motion.span>;
}
