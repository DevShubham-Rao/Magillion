import type { QuestionDefinition, RarityTierId, ScoreResult, ScryfallCard } from './mtg';

export type GameView = 'ready' | 'question' | 'reveal' | 'lost' | 'summary';

/** The slice of a Scryfall card we persist with an answer. */
export interface AnsweredCardSnapshot {
  name: string;
  oracleId: string;
  scryfallId: string;
  typeLine: string;
  manaCost: string;
  artCrop?: string;
  image?: string;
  scryfallUri: string;
  artist?: string;
  setName: string;
}

/** How a round ended. Only `answered` scores points. */
export type AnswerStatus = 'answered' | 'passed' | 'timeout' | 'out-of-attempts';

export interface AnswerRecord {
  round: number;
  questionId: string;
  status: AnswerStatus;
  card: AnsweredCardSnapshot | null;
  /** Total for the round: obscurity points plus speed bonus. */
  points: number;
  /** Obscurity points alone; this decides the tier. */
  basePoints?: number;
  speedBonus?: number;
  tierId: RarityTierId | null;
  edhrecRank: number | null;
  matchedFace?: string;
  /** What the player typed, when it was completed or corrected. */
  typed?: string;
  answeredAt: string;
}

/** The round in progress, persisted so a reload can't reset the clock. */
export interface RoundState {
  round: number;
  /** Epoch ms when time runs out. */
  deadline: number;
  wrongAttempts: number;
}

export interface DailyRecord {
  dateKey: string;
  puzzleNumber: number;
  questionIds: string[];
  answers: AnswerRecord[];
  completedAt: string | null;
  totalScore: number;
  roundState?: RoundState | null;
}

export interface PlayerStats {
  currentStreak: number;
  maxStreak: number;
  lastCompletedDate: string | null;
  dailiesCompleted: number;
  bestDailyScore: number;
  totalPoints: number;
  tierCounts: Record<RarityTierId, number>;
}

export interface PlayerSettings {
  muted: boolean;
  seenIntro: boolean;
}

/**
 * Everything persisted for a player. Kept as one serialisable document so a
 * backend can store it as-is (or split it by key) later.
 */
export interface PlayerProgress {
  version: 1;
  daily: Record<string, DailyRecord>;
  stats: PlayerStats;
  settings: PlayerSettings;
}

export type RejectionKind = 'legality' | 'criteria' | 'duplicate' | 'lookup' | 'network';

export interface Rejection {
  kind: RejectionKind;
  title: string;
  reason: string;
  cardName?: string;
  cardArt?: string;
  /** The card the typed text was completed or corrected into. */
  readAs?: string;
  /** Whether this rejection used up one of the round's attempts. */
  costAttempt: boolean;
  attemptsLeft: number;
}

export interface RevealState {
  card: ScryfallCard;
  score: ScoreResult;
  question: QuestionDefinition;
  answer: AnswerRecord;
  /** Completion, correction or face notes. */
  notes: string[];
}

/** A round that ended without an answer. */
export interface RoundLoss {
  reason: 'timeout' | 'out-of-attempts';
  question: QuestionDefinition;
  answer: AnswerRecord;
  /** The final wrong answer, when attempts ran out. */
  lastRejection?: { title: string; reason: string; cardName?: string; readAs?: string };
}
