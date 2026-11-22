import type { QuestionDefinition, RarityTierId, ScoreResult, ScryfallCard } from './mtg';

export type GameMode = 'daily' | 'practice';

export type GameView = 'question' | 'reveal' | 'summary';

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

export interface AnswerRecord {
  round: number;
  questionId: string;
  status: 'answered' | 'passed';
  card: AnsweredCardSnapshot | null;
  points: number;
  tierId: RarityTierId | null;
  edhrecRank: number | null;
  matchedFace?: string;
  answeredAt: string;
}

export interface DailyRecord {
  dateKey: string;
  puzzleNumber: number;
  questionIds: string[];
  answers: AnswerRecord[];
  completedAt: string | null;
  totalScore: number;
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

export interface PracticeStats {
  runsCompleted: number;
  roundsPlayed: number;
  bestRunScore: number;
  bestRunRounds: number;
  bestAnswer: { cardName: string; points: number; questionId: string } | null;
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
  practice: PracticeStats;
  settings: PlayerSettings;
}

export type RejectionKind = 'legality' | 'criteria' | 'duplicate' | 'lookup' | 'network';

export interface Rejection {
  kind: RejectionKind;
  title: string;
  reason: string;
  cardName?: string;
  cardArt?: string;
}

export interface RevealState {
  card: ScryfallCard;
  score: ScoreResult;
  question: QuestionDefinition;
  answer: AnswerRecord;
  /** Validator note, e.g. which face satisfied the prompt. */
  validationNote?: string;
}
