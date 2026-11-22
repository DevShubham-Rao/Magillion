import { useId, useRef } from 'react';
import { motion, useAnimationFrame, useReducedMotion } from 'framer-motion';
import { MANA_COLORS, MANA_ORDER, ManaSigil } from './ManaSigils';

/**
 * The mana astrolabe: a brass instrument with a tick bezel, a counter-turning
 * ring carrying the five color sigils (in color-pie order) and a rete tracing
 * the ally pentagon and enemy pentagram. It spins faster while `active`
 * (searching Scryfall, scoring) and holds still for reduced-motion users.
 */

interface AstrolabeProps {
  size?: number;
  active?: boolean;
  /** Tints the halo, e.g. with the tier color after a reveal. */
  accent?: string;
  className?: string;
  /** Omit the sigil ring for tiny renders such as the header mark. */
  simple?: boolean;
}

const C = 100;

function polar(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function polygon(r: number, step: number, count = 5): string {
  return Array.from({ length: count }, (_, i) => polar(r, i * step).join(',')).join(' ');
}

const TICKS = Array.from({ length: 72 }, (_, i) => i);
const DIAMONDS = Array.from({ length: 12 }, (_, i) => i * 30 + 15);
const SIGIL_RADIUS = 64;

export function Astrolabe({ size = 240, active = false, accent = '#C8AA6E', className, simple = false }: AstrolabeProps) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const gold = `astro-gold-${uid}`;
  const core = `astro-core-${uid}`;
  const halo = `astro-halo-${uid}`;

  const outerRef = useRef<SVGGElement>(null);
  const ringRef = useRef<SVGGElement>(null);
  const reteRef = useRef<SVGGElement>(null);
  const sigilRefs = useRef<Array<SVGGElement | null>>([]);
  const motionState = useRef({ outer: 0, ring: 0, rete: 0, speed: 1 });

  useAnimationFrame((_, delta) => {
    if (reduce) return;
    const s = motionState.current;
    const target = active ? 7 : 1;
    s.speed += (target - s.speed) * Math.min(1, delta / 380);
    const d = Math.min(delta, 64) * s.speed;
    s.outer = (s.outer + d * 0.0022) % 360;
    s.ring = (s.ring - d * 0.0042) % 360;
    s.rete = (s.rete + d * 0.0068) % 360;
    outerRef.current?.setAttribute('transform', `rotate(${s.outer} ${C} ${C})`);
    ringRef.current?.setAttribute('transform', `rotate(${s.ring} ${C} ${C})`);
    reteRef.current?.setAttribute('transform', `rotate(${s.rete} ${C} ${C})`);
    sigilRefs.current.forEach((el, i) => {
      if (!el) return;
      const [x, y] = polar(SIGIL_RADIUS, i * 72);
      el.setAttribute('transform', `translate(${x} ${y}) rotate(${-s.ring})`);
    });
  });

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F6EAC4" />
          <stop offset="0.45" stopColor="#C8AA6E" />
          <stop offset="1" stopColor="#7D6234" />
        </linearGradient>
        <radialGradient id={core} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#FFF6D8" />
          <stop offset="0.35" stopColor="#E6C47A" />
          <stop offset="0.8" stopColor="#8A6F3C" />
          <stop offset="1" stopColor="#3A2D17" />
        </radialGradient>
        <radialGradient id={halo} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.55" stopColor={accent} stopOpacity="0.28" />
          <stop offset="1" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      <motion.circle
        cx={C}
        cy={C}
        r={99}
        fill={`url(#${halo})`}
        animate={{ opacity: active ? [0.6, 1, 0.6] : 0.55 }}
        transition={active ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.6 }}
      />

      {/* Bezel */}
      <g ref={outerRef}>
        <circle cx={C} cy={C} r={95} fill="none" stroke={`url(#${gold})`} strokeWidth={1.6} />
        <circle cx={C} cy={C} r={89} fill="none" stroke={`url(#${gold})`} strokeWidth={0.5} opacity={0.75} />
        {TICKS.map((i) => {
          const major = i % 6 === 0;
          const [x1, y1] = polar(89, i * 5);
          const [x2, y2] = polar(major ? 82 : 85.6, i * 5);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={`url(#${gold})`}
              strokeWidth={major ? 1.1 : 0.45}
              opacity={major ? 1 : 0.7}
            />
          );
        })}
        {DIAMONDS.map((deg) => {
          const [x, y] = polar(92, deg);
          return (
            <path
              key={deg}
              d={`M${x} ${y - 1.8} L${x + 1.8} ${y} L${x} ${y + 1.8} L${x - 1.8} ${y} Z`}
              fill="#C8AA6E"
              transform={`rotate(${deg} ${x} ${y})`}
            />
          );
        })}
      </g>

      <circle cx={C} cy={C} r={78} fill="rgba(11,13,19,0.72)" stroke={`url(#${gold})`} strokeWidth={0.6} opacity={0.9} />

      {/* Sigil ring */}
      {!simple && (
        <g ref={ringRef}>
          <circle
            cx={C}
            cy={C}
            r={SIGIL_RADIUS}
            fill="none"
            stroke="#C8AA6E"
            strokeWidth={0.5}
            strokeDasharray="0.8 3.2"
            opacity={0.7}
          />
          {MANA_ORDER.map((color, i) => {
            const [x, y] = polar(SIGIL_RADIUS, i * 72);
            return (
              <g
                key={color}
                ref={(el) => {
                  sigilRefs.current[i] = el;
                }}
                transform={`translate(${x} ${y})`}
              >
                <circle r={13.6} fill="none" stroke="#C8AA6E" strokeWidth={0.4} opacity={0.6} />
                <circle r={11.4} fill="#0B0D13" stroke={MANA_COLORS[color]} strokeWidth={1.1} />
                <ManaSigil color={color} scale={0.92} />
              </g>
            );
          })}
        </g>
      )}

      {/* Rete: ally pentagon and enemy pentagram */}
      <g ref={reteRef}>
        <circle cx={C} cy={C} r={simple ? 60 : 46} fill="none" stroke="#C8AA6E" strokeWidth={0.45} opacity={0.55} />
        <polygon
          points={polygon(simple ? 60 : 46, 72)}
          fill="none"
          stroke={`url(#${gold})`}
          strokeWidth={simple ? 2.6 : 0.8}
          strokeLinejoin="round"
          opacity={0.85}
        />
        <polygon
          points={polygon(simple ? 60 : 46, 144)}
          fill="none"
          stroke={`url(#${gold})`}
          strokeWidth={simple ? 2.2 : 0.6}
          strokeLinejoin="round"
          opacity={0.6}
        />
        {!simple &&
          MANA_ORDER.map((color, i) => {
            const [x, y] = polar(46, i * 72);
            return <circle key={color} cx={x} cy={y} r={1.8} fill={MANA_COLORS[color]} />;
          })}
      </g>

      {/* Hub */}
      <circle cx={C} cy={C} r={17} fill="#0B0D13" stroke={`url(#${gold})`} strokeWidth={0.9} />
      <path
        d={`M${C} ${C - 15} L${C + 15} ${C} L${C} ${C + 15} L${C - 15} ${C} Z`}
        fill="none"
        stroke="#C8AA6E"
        strokeWidth={0.5}
        opacity={0.7}
      />
      <circle cx={C} cy={C} r={simple ? 14 : 9.5} fill={`url(#${core})`} />
    </svg>
  );
}
