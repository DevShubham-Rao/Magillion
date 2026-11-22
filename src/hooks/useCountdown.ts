import { useEffect, useState } from 'react';
import { msUntilNextUtcMidnight, utcDateKey } from '../lib/dates';

/** Milliseconds until the next gauntlet, plus today's UTC key, ticking each second. */
export function useCountdown(): { msRemaining: number; todayKey: string } {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return { msRemaining: msUntilNextUtcMidnight(now), todayKey: utcDateKey(now) };
}
