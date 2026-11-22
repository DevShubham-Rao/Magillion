import { useEffect, useRef } from 'react';
import { Astrolabe } from './art/Astrolabe';
import { audioCues } from '../services/audioCues';
import { MAX_ATTEMPTS } from '../data/gameRules';

const RING_RADIUS = 104;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function formatClock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The astrolabe doubles as the round clock: a gilded ring drains around it
 * and turns ember-red in the last ten seconds.
 */
export function RoundTimer({
  msRemaining,
  totalMs,
  running,
  spinning,
}: {
  msRemaining: number;
  totalMs: number;
  running: boolean;
  spinning: boolean;
}) {
  const fraction = Math.max(0, Math.min(1, msRemaining / totalMs));
  const seconds = Math.ceil(msRemaining / 1000);
  const urgent = running && seconds <= 10;
  const color = urgent ? '#E0603F' : '#C8AA6E';
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    if (!running || seconds > 5 || seconds <= 0 || lastTick.current === seconds) return;
    lastTick.current = seconds;
    audioCues.tick();
  }, [running, seconds]);

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-36 w-36 sm:h-48 sm:w-48">
        <svg viewBox="0 0 220 220" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="110" cy="110" r={RING_RADIUS} fill="none" stroke="rgba(200,170,110,.14)" strokeWidth="4" />
          <circle
            cx="110"
            cy="110"
            r={RING_RADIUS}
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
            style={{
              transition: 'stroke-dashoffset 0.25s linear, stroke 0.4s ease',
              filter: `drop-shadow(0 0 ${urgent ? 8 : 4}px ${color})`,
            }}
          />
        </svg>
        <div className="absolute inset-[9%] grid place-items-center">
          <Astrolabe size={176} active={spinning} accent={urgent ? '#E0603F' : '#C8AA6E'} className="h-full w-full" />
        </div>
      </div>
      <p
        className={`tabular mt-2 font-display text-2xl font-bold transition-colors ${urgent ? 'text-ember' : 'text-gold-pale'}`}
        role="timer"
        aria-label={`${seconds} seconds left`}
      >
        {formatClock(msRemaining)}
      </p>
    </div>
  );
}

export function AttemptPips({ left }: { left: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-ash" aria-label={`${left} of ${MAX_ATTEMPTS} attempts left`}>
      <span>Attempts</span>
      <span className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: MAX_ATTEMPTS }, (_, i) => (
          <svg key={i} viewBox="0 0 12 12" width={11} height={11}>
            <path
              d="M6 0.8 L11.2 6 L6 11.2 L0.8 6 Z"
              fill={i < left ? '#C8AA6E' : 'none'}
              stroke={i < left ? '#E8D9AE' : 'rgba(154,149,138,.6)'}
              strokeWidth="1"
            />
          </svg>
        ))}
      </span>
    </div>
  );
}
