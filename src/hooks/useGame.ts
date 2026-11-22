import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AnswerRecord,
  AnsweredCardSnapshot,
  GameMode,
  GameView,
  Rejection,
  RevealState,
} from '../types/game';
import type { QuestionDefinition, ScryfallCard } from '../types/mtg';
import { drawPracticeQuestion, questionById, selectDailyQuestions } from '../data/questionPool';
import { scryfall } from '../services/scryfallService';
import { createDefaultScoringEngine } from '../services/scoringEngine';
import { checkCommanderEligibility } from '../services/cardEligibility';
import {
  getProgressStore,
  recordDailyAnswer,
  recordPracticeAnswer,
  recordPracticeRun,
} from '../services/progressStore';
import { audioCues } from '../services/audioCues';
import { displayManaCost, displayTypeLine, getImageUris, getOracleId } from '../lib/cardFaces';
import { puzzleNumber, utcDateKey } from '../lib/dates';
import { useProgress } from './useProgress';

const engine = createDefaultScoringEngine(scryfall);

function snapshotCard(card: ScryfallCard): AnsweredCardSnapshot {
  const images = getImageUris(card);
  return {
    name: card.name,
    oracleId: getOracleId(card),
    scryfallId: card.id,
    typeLine: displayTypeLine(card),
    manaCost: displayManaCost(card),
    artCrop: images?.art_crop,
    image: images?.normal,
    scryfallUri: card.scryfall_uri,
    artist: card.artist ?? card.card_faces?.[0]?.artist,
    setName: card.set_name,
  };
}

export interface GameController {
  mode: GameMode;
  dateKey: string;
  puzzleNumber: number;
  questions: QuestionDefinition[];
  /** Zero-based index of the round being played. */
  roundIndex: number;
  currentQuestion: QuestionDefinition | null;
  answers: AnswerRecord[];
  totalScore: number;
  view: GameView;
  busy: boolean;
  reveal: RevealState | null;
  rejection: Rejection | null;
  /** True when a new UTC day has started but this gauntlet is still yesterday's. */
  newDayAvailable: boolean;
  submitCard: (card: ScryfallCard) => Promise<void>;
  submitName: (text: string) => Promise<void>;
  pass: () => void;
  advance: () => void;
  dismissRejection: () => void;
  endPracticeRun: () => void;
  restartPractice: () => void;
  startNewDay: () => void;
}

export function useGame(mode: GameMode): GameController {
  const isDaily = mode === 'daily';
  const progress = useProgress();
  const store = getProgressStore();

  const [dateKey, setDateKey] = useState(utcDateKey);
  const [liveDateKey, setLiveDateKey] = useState(utcDateKey);
  const seededQuestions = useMemo(() => selectDailyQuestions(dateKey), [dateKey]);

  const [practiceQuestions, setPracticeQuestions] = useState<QuestionDefinition[]>(() => [drawPracticeQuestion()]);
  const [practiceAnswers, setPracticeAnswers] = useState<AnswerRecord[]>([]);
  const [practiceEnded, setPracticeEnded] = useState(false);

  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const dailyRecord = progress.daily[dateKey];

  // A stored gauntlet keeps the prompts it started with, even if the pool changes.
  const dailyQuestions = useMemo(() => {
    if (!dailyRecord) return seededQuestions;
    const stored = dailyRecord.questionIds
      .map((id) => questionById(id))
      .filter((q): q is QuestionDefinition => Boolean(q));
    return stored.length === dailyRecord.questionIds.length ? stored : seededQuestions;
  }, [dailyRecord, seededQuestions]);

  const questions = isDaily ? dailyQuestions : practiceQuestions;
  const answers = useMemo(
    () => (isDaily ? (dailyRecord?.answers ?? []) : practiceAnswers),
    [isDaily, dailyRecord, practiceAnswers],
  );
  const roundIndex = answers.length;
  const currentQuestion = questions[roundIndex] ?? null;
  const totalScore = answers.reduce((sum, a) => sum + a.points, 0);
  const complete = isDaily ? answers.length >= questions.length : practiceEnded;
  const view: GameView = reveal ? 'reveal' : complete ? 'summary' : 'question';

  // Watch for UTC midnight. An untouched gauntlet rolls over on its own;
  // one in progress or finished waits for the player.
  useEffect(() => {
    if (!isDaily) return;
    const id = window.setInterval(() => setLiveDateKey(utcDateKey()), 15_000);
    return () => window.clearInterval(id);
  }, [isDaily]);

  useEffect(() => {
    if (liveDateKey !== dateKey && !reveal && (!dailyRecord || dailyRecord.answers.length === 0)) {
      setDateKey(liveDateKey);
    }
  }, [liveDateKey, dateKey, dailyRecord, reveal]);

  const setBusyState = useCallback((value: boolean) => {
    busyRef.current = value;
    setBusy(value);
  }, []);

  const reject = useCallback((value: Rejection) => {
    setRejection(value);
    audioCues.reject();
  }, []);

  const appendPracticeQuestion = useCallback(() => {
    setPracticeQuestions((list) => [...list, drawPracticeQuestion(list.map((q) => q.id))]);
  }, []);

  const recordAnswer = useCallback(
    (answer: AnswerRecord) => {
      if (isDaily) {
        const ids = questions.map((q) => q.id);
        store.update((p) => recordDailyAnswer(p, dateKey, ids, answer));
      } else {
        setPracticeAnswers((list) => [...list, answer]);
        store.update((p) => recordPracticeAnswer(p, answer));
      }
    },
    [isDaily, questions, store, dateKey],
  );

  const submitCard = useCallback(
    async (card: ScryfallCard) => {
      if (busyRef.current || !currentQuestion || reveal) return;
      audioCues.prime();
      setRejection(null);
      const art = getImageUris(card)?.art_crop;

      const eligibility = checkCommanderEligibility(card);
      if (!eligibility.ok) {
        reject({ kind: 'legality', title: eligibility.title, reason: eligibility.reason, cardName: card.name, cardArt: art });
        return;
      }

      const oracleId = getOracleId(card);
      if (answers.some((a) => a.card?.oracleId === oracleId)) {
        reject({
          kind: 'duplicate',
          title: 'Already called upon',
          reason: `You named ${card.name} earlier in this ${isDaily ? 'gauntlet' : 'run'}. Each card can answer only once.`,
          cardName: card.name,
          cardArt: art,
        });
        return;
      }

      const verdict = currentQuestion.validatorFn(card);
      if (!verdict.ok) {
        reject({ kind: 'criteria', title: verdict.title, reason: verdict.reason, cardName: card.name, cardArt: art });
        return;
      }

      setBusyState(true);
      try {
        const score = await engine.score(card);
        const answer: AnswerRecord = {
          round: roundIndex + 1,
          questionId: currentQuestion.id,
          status: 'answered',
          card: snapshotCard(card),
          points: score.points,
          tierId: score.tier.id,
          edhrecRank: score.edhrecRank,
          matchedFace: verdict.matchedFace,
          answeredAt: new Date().toISOString(),
        };
        recordAnswer(answer);
        setReveal({ card, score, question: currentQuestion, answer, validationNote: verdict.note });
        audioCues.tier(score.tier.order);
      } catch {
        reject({
          kind: 'network',
          title: 'The archives are silent',
          reason: "Scryfall didn't answer while scoring that card. Check your connection and lock it in again.",
        });
      } finally {
        setBusyState(false);
      }
    },
    [currentQuestion, reveal, answers, isDaily, roundIndex, recordAnswer, reject, setBusyState],
  );

  const submitName = useCallback(
    async (text: string) => {
      if (busyRef.current || !currentQuestion || reveal) return;
      if (!text.trim()) return;
      audioCues.prime();
      setRejection(null);
      setBusyState(true);
      let outcome: Awaited<ReturnType<typeof scryfall.resolveByName>>;
      try {
        outcome = await scryfall.resolveByName(text);
      } catch {
        setBusyState(false);
        reject({
          kind: 'network',
          title: 'The archives are silent',
          reason: "Scryfall isn't responding right now. Wait a moment and try again.",
        });
        return;
      }
      setBusyState(false);
      if (outcome.status === 'found') {
        await submitCard(outcome.card);
        return;
      }
      reject({
        kind: 'lookup',
        title: outcome.status === 'ambiguous' ? 'Too many cards answer' : 'No such card in the Multiverse',
        reason: outcome.message,
      });
    },
    [currentQuestion, reveal, submitCard, reject, setBusyState],
  );

  const pass = useCallback(() => {
    if (busyRef.current || !currentQuestion || reveal) return;
    recordAnswer({
      round: roundIndex + 1,
      questionId: currentQuestion.id,
      status: 'passed',
      card: null,
      points: 0,
      tierId: null,
      edhrecRank: null,
      answeredAt: new Date().toISOString(),
    });
    setRejection(null);
    if (!isDaily) appendPracticeQuestion();
  }, [currentQuestion, reveal, roundIndex, recordAnswer, isDaily, appendPracticeQuestion]);

  const advance = useCallback(() => {
    setReveal(null);
    setRejection(null);
    if (!isDaily && !practiceEnded) appendPracticeQuestion();
  }, [isDaily, practiceEnded, appendPracticeQuestion]);

  const endPracticeRun = useCallback(() => {
    if (isDaily) return;
    setReveal(null);
    setRejection(null);
    setPracticeEnded(true);
    const score = practiceAnswers.reduce((sum, a) => sum + a.points, 0);
    store.update((p) => recordPracticeRun(p, score, practiceAnswers.length));
  }, [isDaily, practiceAnswers, store]);

  const restartPractice = useCallback(() => {
    setPracticeQuestions([drawPracticeQuestion()]);
    setPracticeAnswers([]);
    setPracticeEnded(false);
    setReveal(null);
    setRejection(null);
  }, []);

  const startNewDay = useCallback(() => {
    const today = utcDateKey();
    setLiveDateKey(today);
    setDateKey(today);
    setReveal(null);
    setRejection(null);
  }, []);

  return {
    mode,
    dateKey,
    puzzleNumber: puzzleNumber(dateKey),
    questions,
    roundIndex,
    currentQuestion,
    answers,
    totalScore,
    view,
    busy,
    reveal,
    rejection,
    newDayAvailable: isDaily && liveDateKey !== dateKey,
    submitCard,
    submitName,
    pass,
    advance,
    dismissRejection: () => setRejection(null),
    endPracticeRun,
    restartPractice,
    startNewDay,
  };
}
