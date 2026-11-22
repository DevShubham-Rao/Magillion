import { useId } from 'react';
import type { RarityTier } from '../../types/mtg';

/**
 * Rarity gems. Each tier has its own cut as well as its own color, so tiers
 * stay distinguishable without relying on hue alone.
 */

function starPoints(outer: number, inner: number, points: number, rotation = -90): string {
  const out: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((rotation + (i * 180) / points) * Math.PI) / 180;
    out.push(`${16 + r * Math.cos(a)},${16 + r * Math.sin(a)}`);
  }
  return out.join(' ');
}

const CUTS: Record<RarityTier['order'], { outline: string; table: string; facets: string }> = {
  1: {
    outline: 'M16 5.5 A10.5 10.5 0 1 1 15.99 5.5 Z',
    table: 'M16 10 A6 6 0 1 1 15.99 10 Z',
    facets: '',
  },
  2: {
    outline: 'M16 3.5 L28.5 16 L16 28.5 L3.5 16 Z',
    table: 'M16 9.5 L22.5 16 L16 22.5 L9.5 16 Z',
    facets: 'M16 3.5 L16 9.5 M28.5 16 L22.5 16 M16 28.5 L16 22.5 M3.5 16 L9.5 16',
  },
  3: {
    outline: 'M16 3 L27.3 9.5 L27.3 22.5 L16 29 L4.7 22.5 L4.7 9.5 Z',
    table: 'M16 9.4 L21.7 12.7 L21.7 19.3 L16 22.6 L10.3 19.3 L10.3 12.7 Z',
    facets:
      'M16 3 L16 9.4 M27.3 9.5 L21.7 12.7 M27.3 22.5 L21.7 19.3 M16 29 L16 22.6 M4.7 22.5 L10.3 19.3 M4.7 9.5 L10.3 12.7',
  },
  4: {
    outline: 'M11 3 L21 3 L29 11 L29 21 L21 29 L11 29 L3 21 L3 11 Z',
    table: 'M13 9 L19 9 L23 13 L23 19 L19 23 L13 23 L9 19 L9 13 Z',
    facets: 'M11 3 L13 9 M21 3 L19 9 M29 11 L23 13 M29 21 L23 19 M21 29 L19 23 M11 29 L13 23 M3 21 L9 19 M3 11 L9 13',
  },
  5: {
    outline: `M${starPoints(14.5, 6.2, 4).replace(/ /g, ' L')} Z`,
    table: 'M16 11 L21 16 L16 21 L11 16 Z',
    facets: 'M16 1.5 L16 11 M30.5 16 L21 16 M16 30.5 L16 21 M1.5 16 L11 16',
  },
  6: {
    outline: `M${starPoints(14.8, 8.4, 8).replace(/ /g, ' L')} Z`,
    table: `M${starPoints(7.6, 5.4, 8, -67.5).replace(/ /g, ' L')} Z`,
    facets: '',
  },
};

interface RarityGemProps {
  tier: RarityTier;
  size?: number;
  className?: string;
  /** Accessible label; omit when the tier name is already in adjacent text. */
  label?: string;
}

export function RarityGem({ tier, size = 28, className, label }: RarityGemProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const fill = `gem-fill-${uid}`;
  const shine = `gem-shine-${uid}`;
  const cut = CUTS[tier.order];
  const prismatic = tier.id === 'serialized';
  const [light, mid, dark] = tier.stops;

  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={`${prismatic ? 'animate-prismatic' : ''} ${className ?? ''}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        {prismatic ? (
          <linearGradient id={fill} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFE38A" />
            <stop offset="0.3" stopColor="#9FF5E8" />
            <stop offset="0.55" stopColor="#8AB8FF" />
            <stop offset="0.8" stopColor="#F6A8FF" />
            <stop offset="1" stopColor="#FF9FB2" />
          </linearGradient>
        ) : (
          <linearGradient id={fill} x1="0.15" y1="0" x2="0.85" y2="1">
            <stop offset="0" stopColor={light} />
            <stop offset="0.5" stopColor={mid} />
            <stop offset="1" stopColor={dark} />
          </linearGradient>
        )}
        <linearGradient id={shine} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.7" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={cut.outline} fill={`url(#${fill})`} stroke={light} strokeOpacity={0.75} strokeWidth={0.8} strokeLinejoin="round" />
      <path d={cut.table} fill={`url(#${shine})`} opacity={0.55} stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={0.5} />
      {cut.facets && <path d={cut.facets} stroke="#FFFFFF" strokeOpacity={0.3} strokeWidth={0.5} fill="none" />}
      <ellipse cx="12.5" cy="11" rx="2.6" ry="1.4" fill="#FFFFFF" opacity={0.55} transform="rotate(-35 12.5 11)" />
    </svg>
  );
}
