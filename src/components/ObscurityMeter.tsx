import { motion, useReducedMotion } from 'framer-motion';
import { RARITY_TIERS } from '../data/rarityTiers';
import type { RarityTier } from '../types/mtg';

/**
 * Points on a 0–1,000 track split into the six tier bands, with a marker
 * that slides to where this answer landed.
 */
export function ObscurityMeter({ points, tier, delay = 0.9 }: { points: number; tier: RarityTier; delay?: number }) {
  const reduce = useReducedMotion();
  const position = Math.min(100, Math.max(0, points / 10));

  return (
    <figure className="w-full">
      <div
        className="relative h-3 w-full overflow-visible rounded-full"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={1000}
        aria-valuenow={points}
        aria-label="Obscurity"
        aria-valuetext={`${points} of 1,000 points, ${tier.name}`}
      >
        <div className="absolute inset-0 flex overflow-hidden rounded-full ring-1 ring-gold/25">
          {RARITY_TIERS.map((t) => {
            const width = ((t.maxPoints - t.minPoints + (t.minPoints === 0 ? 0 : 1)) / 1000) * 100;
            const active = t.id === tier.id;
            return (
              <div
                key={t.id}
                className={t.id === 'serialized' ? 'animate-prismatic' : undefined}
                style={{
                  width: `${width}%`,
                  background:
                    t.id === 'serialized'
                      ? 'linear-gradient(90deg, #FFE38A, #9FF5E8, #F6A8FF)'
                      : `linear-gradient(180deg, ${t.stops[0]}, ${t.stops[1]} 55%, ${t.stops[2]})`,
                  opacity: active ? 1 : 0.32,
                  boxShadow: 'inset -1px 0 0 rgba(11,13,19,.85)',
                }}
              />
            );
          })}
        </div>
        <motion.div
          className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2"
          initial={reduce ? false : { left: '0%' }}
          animate={{ left: `${position}%` }}
          transition={{ duration: 1.5, delay, ease: [0.16, 1, 0.3, 1] }}
        >
          <svg viewBox="0 0 24 24" className="h-full w-full drop-shadow-[0_0_6px_rgba(0,0,0,0.9)]" aria-hidden="true">
            <path d="M12 1 L21 12 L12 23 L3 12 Z" fill="#0B0D13" stroke="#E8D9AE" strokeWidth="1.5" />
            <path d="M12 6 L16.5 12 L12 18 L7.5 12 Z" fill={tier.color} />
          </svg>
        </motion.div>
      </div>
      <figcaption className="mt-2 flex justify-between text-xs text-ash">
        <span>In every deck</span>
        <span>Nowhere to be found</span>
      </figcaption>
    </figure>
  );
}
