import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { RarityTier } from '../types/mtg';

const PRISM = ['#FFE38A', '#9FF5E8', '#8AB8FF', '#F6A8FF', '#FF9FB2', '#FFFFFF'];

/** Motes thrown off the card as it lands; more, farther and brighter for rarer tiers. */
export function ParticleBurst({ tier, delay = 0.95 }: { tier: RarityTier; delay?: number }) {
  const reduce = useReducedMotion();
  const motes = useMemo(() => {
    const palette = tier.id === 'serialized' ? PRISM : [...tier.stops, '#FFFFFF'];
    return Array.from({ length: tier.particleCount }, (_, i) => {
      const angle = (i / Math.max(1, tier.particleCount)) * Math.PI * 2 + Math.random() * 0.4;
      const distance = 120 + Math.random() * (90 + tier.order * 26);
      return {
        id: i,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance * 1.2,
        size: 3 + Math.random() * (2 + tier.order),
        color: palette[i % palette.length] ?? '#FFFFFF',
        duration: 1.1 + Math.random() * 0.9,
        lag: Math.random() * 0.25,
      };
    });
  }, [tier]);

  if (reduce || tier.particleCount === 0) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
      {tier.order >= 3 && (
        <motion.div
          className="absolute h-64 w-64 rounded-full"
          style={{ border: `2px solid ${tier.color}`, boxShadow: `0 0 40px ${tier.color}` }}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: [0.5, 1.9], opacity: [0.9, 0] }}
          transition={{ duration: 1.2, delay, ease: 'easeOut' }}
        />
      )}
      {motes.map((m) => (
        <motion.span
          key={m.id}
          className="absolute rounded-full"
          style={{
            width: m.size,
            height: m.size,
            background: m.color,
            boxShadow: `0 0 ${m.size * 3}px ${m.color}`,
          }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.3 }}
          animate={{ x: m.x, y: m.y, opacity: [0, 1, 0], scale: [0.3, 1, 0.2] }}
          transition={{ duration: m.duration, delay: delay + m.lag, ease: [0.1, 0.8, 0.3, 1] }}
        />
      ))}
    </div>
  );
}
