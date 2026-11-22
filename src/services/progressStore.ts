import type { AnswerRecord, DailyRecord, PlayerProgress, PlayerSettings } from '../types/game';
import type { RarityTierId } from '../types/mtg';
import { addDays, daysBetween, puzzleNumber } from '../lib/dates';

/**
 * Player progress persistence.
 *
 * The game talks to a `ProgressRepository`, never to localStorage directly.
 * Swapping in a backend means writing one class with `load` and `save`
 * (an API-backed repository could load once on sign-in and save after each
 * answer). All state changes are pure functions over `PlayerProgress`, so
 * they can run unchanged on a server.
 */

export const STORAGE_KEY = 'magillion.progress.v1';
const DAILY_HISTORY_DAYS = 120;

const EMPTY_TIER_COUNTS: Record<RarityTierId, number> = {
  common: 0,
  uncommon: 0,
  rare: 0,
  mythic: 0,
  timeshifted: 0,
  serialized: 0,
};

export function createEmptyProgress(): PlayerProgress {
  return {
    version: 1,
    daily: {},
    stats: {
      currentStreak: 0,
      maxStreak: 0,
      lastCompletedDate: null,
      dailiesCompleted: 0,
      bestDailyScore: 0,
      totalPoints: 0,
      tierCounts: { ...EMPTY_TIER_COUNTS },
    },
    practice: { runsCompleted: 0, roundsPlayed: 0, bestRunScore: 0, bestRunRounds: 0, bestAnswer: null },
    settings: { muted: false, seenIntro: false },
  };
}

/** Accepts whatever was stored and returns a complete, current document. */
export function migrateProgress(raw: unknown): PlayerProgress {
  const empty = createEmptyProgress();
  if (!raw || typeof raw !== 'object' || (raw as { version?: unknown }).version !== 1) return empty;
  const stored = raw as Partial<PlayerProgress>;
  return {
    version: 1,
    daily: stored.daily && typeof stored.daily === 'object' ? stored.daily : {},
    stats: {
      ...empty.stats,
      ...stored.stats,
      tierCounts: { ...EMPTY_TIER_COUNTS, ...stored.stats?.tierCounts },
    },
    practice: { ...empty.practice, ...stored.practice },
    settings: { ...empty.settings, ...stored.settings },
  };
}

export interface ProgressRepository {
  load(): PlayerProgress;
  save(progress: PlayerProgress): void;
}

export class LocalStorageProgressRepository implements ProgressRepository {
  private readonly key: string;
  constructor(key: string = STORAGE_KEY) {
    this.key = key;
  }

  load(): PlayerProgress {
    try {
      const raw = globalThis.localStorage?.getItem(this.key);
      return raw ? migrateProgress(JSON.parse(raw)) : createEmptyProgress();
    } catch {
      return createEmptyProgress();
    }
  }

  save(progress: PlayerProgress): void {
    try {
      globalThis.localStorage?.setItem(this.key, JSON.stringify(progress));
    } catch {
      // Storage full or blocked (private mode): progress lives for this tab only.
    }
  }
}

export class MemoryProgressRepository implements ProgressRepository {
  private value: PlayerProgress;
  constructor(initial: PlayerProgress = createEmptyProgress()) {
    this.value = initial;
  }
  load(): PlayerProgress {
    return this.value;
  }
  save(progress: PlayerProgress): void {
    this.value = progress;
  }
}

/* ------------------------------------------------------------------------ */
/* Pure updates                                                              */
/* ------------------------------------------------------------------------ */

function pruneDaily(daily: Record<string, DailyRecord>, latestKey: string): Record<string, DailyRecord> {
  const out: Record<string, DailyRecord> = {};
  for (const [key, record] of Object.entries(daily)) {
    if (daysBetween(key, latestKey) <= DAILY_HISTORY_DAYS) out[key] = record;
  }
  return out;
}

function completeDaily(progress: PlayerProgress, dateKey: string, completedAt: string): PlayerProgress {
  const record = progress.daily[dateKey];
  if (!record || record.completedAt) return progress;

  const { stats } = progress;
  const last = stats.lastCompletedDate;
  const currentStreak =
    last === dateKey ? stats.currentStreak : last === addDays(dateKey, -1) ? stats.currentStreak + 1 : 1;

  const tierCounts = { ...stats.tierCounts };
  for (const answer of record.answers) if (answer.tierId) tierCounts[answer.tierId] += 1;

  return {
    ...progress,
    daily: { ...progress.daily, [dateKey]: { ...record, completedAt } },
    stats: {
      ...stats,
      currentStreak,
      maxStreak: Math.max(stats.maxStreak, currentStreak),
      lastCompletedDate: last && last > dateKey ? last : dateKey,
      dailiesCompleted: stats.dailiesCompleted + 1,
      bestDailyScore: Math.max(stats.bestDailyScore, record.totalScore),
      totalPoints: stats.totalPoints + record.totalScore,
      tierCounts,
    },
  };
}

/** Appends one round's answer; completes the day when the last round lands. */
export function recordDailyAnswer(
  progress: PlayerProgress,
  dateKey: string,
  questionIds: string[],
  answer: AnswerRecord,
): PlayerProgress {
  const existing: DailyRecord = progress.daily[dateKey] ?? {
    dateKey,
    puzzleNumber: puzzleNumber(dateKey),
    questionIds,
    answers: [],
    completedAt: null,
    totalScore: 0,
  };
  if (existing.completedAt || existing.answers.some((a) => a.round === answer.round)) return progress;

  const answers = [...existing.answers, answer];
  const record: DailyRecord = {
    ...existing,
    answers,
    totalScore: answers.reduce((sum, a) => sum + a.points, 0),
  };
  const next: PlayerProgress = { ...progress, daily: pruneDaily({ ...progress.daily, [dateKey]: record }, dateKey) };
  return answers.length >= existing.questionIds.length ? completeDaily(next, dateKey, answer.answeredAt) : next;
}

/** The streak as it stands today: broken if yesterday's gauntlet was missed. */
export function activeStreak(progress: PlayerProgress, todayKey: string): number {
  const last = progress.stats.lastCompletedDate;
  if (!last) return 0;
  return last === todayKey || last === addDays(todayKey, -1) ? progress.stats.currentStreak : 0;
}

export function recordPracticeAnswer(progress: PlayerProgress, answer: AnswerRecord): PlayerProgress {
  const best = progress.practice.bestAnswer;
  const isBest = answer.card && (!best || answer.points > best.points);
  return {
    ...progress,
    practice: {
      ...progress.practice,
      roundsPlayed: progress.practice.roundsPlayed + 1,
      bestAnswer: isBest && answer.card
        ? { cardName: answer.card.name, points: answer.points, questionId: answer.questionId }
        : best,
    },
  };
}

export function recordPracticeRun(progress: PlayerProgress, score: number, rounds: number): PlayerProgress {
  if (rounds === 0) return progress;
  return {
    ...progress,
    practice: {
      ...progress.practice,
      runsCompleted: progress.practice.runsCompleted + 1,
      bestRunScore: Math.max(progress.practice.bestRunScore, score),
      bestRunRounds: Math.max(progress.practice.bestRunRounds, rounds),
    },
  };
}

export function updateSettings(progress: PlayerProgress, patch: Partial<PlayerSettings>): PlayerProgress {
  return { ...progress, settings: { ...progress.settings, ...patch } };
}

/* ------------------------------------------------------------------------ */
/* Store (React subscribes through useSyncExternalStore)                     */
/* ------------------------------------------------------------------------ */

export class ProgressStore {
  private state: PlayerProgress;
  private readonly listeners = new Set<() => void>();
  private readonly repository: ProgressRepository;

  constructor(repository: ProgressRepository) {
    this.repository = repository;
    this.state = repository.load();
    if (typeof window !== 'undefined') {
      // Keep several open tabs in step.
      window.addEventListener('storage', (event) => {
        if (event.key !== STORAGE_KEY) return;
        this.state = this.repository.load();
        this.emit();
      });
    }
  }

  getSnapshot = (): PlayerProgress => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  update(change: (progress: PlayerProgress) => PlayerProgress): void {
    const next = change(this.state);
    if (next === this.state) return;
    this.state = next;
    this.repository.save(next);
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

let store: ProgressStore | null = null;

export function getProgressStore(): ProgressStore {
  store ??= new ProgressStore(new LocalStorageProgressRepository());
  return store;
}
