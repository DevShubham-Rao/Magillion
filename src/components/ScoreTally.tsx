import { useEffect } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';

/** Counts up to the score so the points land with the card. */
export function ScoreTally({
  points,
  delay = 0.9,
  className,
  suffix = 'points',
}: {
  points: number;
  delay?: number;
  className?: string;
  suffix?: string;
}) {
  const reduce = useReducedMotion();
  const value = useMotionValue(reduce ? points : 0);
  const display = useTransform(value, (v) => Math.round(v).toLocaleString('en-US'));

  useEffect(() => {
    if (reduce) {
      value.set(points);
      return;
    }
    const controls = animate(value, points, { duration: 1.5, delay, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [points, delay, reduce, value]);

  return (
    <p className={`flex items-baseline gap-2 ${className ?? ''}`}>
      <span className="sr-only">
        {points.toLocaleString('en-US')} {suffix}
      </span>
      <motion.span aria-hidden="true" className="gold-text tabular font-display text-6xl font-bold leading-none sm:text-7xl">
        {display}
      </motion.span>
      <span aria-hidden="true" className="text-base text-ash">
        {suffix}
      </span>
    </p>
  );
}
