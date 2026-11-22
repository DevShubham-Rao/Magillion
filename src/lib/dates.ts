/** All daily logic runs on UTC calendar days so every player shares a gauntlet. */

/** The first daily gauntlet. Puzzle numbers count from here. */
export const LAUNCH_DATE_KEY = '2026-11-22';

const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------------ */
/* Test day offset                                                           */
/* ------------------------------------------------------------------------ */

/**
 * For testing only: shifts "today" forward by whole days so a new gauntlet
 * can be played without waiting for midnight. Set from the test tools panel
 * and kept in localStorage; while it's non-zero, progress is saved under a
 * separate key so real results stay untouched.
 */
const TEST_OFFSET_KEY = 'magillion.testDayOffset';

function readTestOffset(): number {
  try {
    const value = Number(globalThis.localStorage?.getItem(TEST_OFFSET_KEY) ?? 0);
    return Number.isFinite(value) ? Math.trunc(value) : 0;
  } catch {
    return 0;
  }
}

let testOffsetDays = readTestOffset();

export function testDayOffset(): number {
  return testOffsetDays;
}

export function setTestDayOffset(days: number): void {
  testOffsetDays = Math.trunc(days);
  try {
    if (testOffsetDays === 0) globalThis.localStorage?.removeItem(TEST_OFFSET_KEY);
    else globalThis.localStorage?.setItem(TEST_OFFSET_KEY, String(testOffsetDays));
  } catch {
    // Storage blocked: the offset lasts until the page reloads.
  }
}

/** Today's UTC date key (shifted by the test offset), or the key for `date`. */
export function utcDateKey(date?: Date): string {
  return (date ?? new Date(Date.now() + testOffsetDays * DAY_MS)).toISOString().slice(0, 10);
}

function keyToUtcMs(key: string): number {
  return Date.parse(`${key}T00:00:00Z`);
}

export function addDays(key: string, days: number): string {
  return utcDateKey(new Date(keyToUtcMs(key) + days * DAY_MS));
}

export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((keyToUtcMs(toKey) - keyToUtcMs(fromKey)) / DAY_MS);
}

export function puzzleNumber(dateKey: string): number {
  return Math.max(1, daysBetween(LAUNCH_DATE_KEY, dateKey) + 1);
}

export function msUntilNextUtcMidnight(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Long, human date for headings, rendered in UTC so it matches the seed. */
export function formatDateKey(key: string): string {
  return new Date(keyToUtcMs(key)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
