import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AnswerRecord,
  AnswerStatus,
  AnsweredCardSnapshot,
  GameMode,
  GameView,
  Rejection,
  RevealState,
  RoundLoss,
  RoundState,
} from '../types/game';
import type { QuestionDefinition, ScryfallCard } from '../types/mtg';
import { drawPracticeQuestion, questionById, selectDailyQuestions } from '../data/questionPool';
import { MAX_ATTEMPTS, ROUND_SECONDS, speedBonus } from '../data/gameRules';
import { scryfall, ScryfallRequestError } from '../services/scryfallService';
import { createDefaultScoringEngine, estimateObscurity } from '../services/scoringEngine';
import { loadMetagame, peekMetagame } from '../services/metagame';
import { resolveAnswer } from '../services/answerResolver';
import {
  getProgressStore,
  recordDailyAnswer,
  recordPracticeAnswer,
  recordPracticeRun,
  setDailyRoundState,
} from '../services/progressStore';
import { audioCues } from '../services/audioCues';
import { displayManaCost, displayTypeLine, getImageUris, getOracleId } from '../lib/cardFaces';
import { puzzleNumber, utcDateKey } from '../lib/dates';
import { useProgress } from './useProgress';

const engine = createDefaultScoringEngine(scryfall, () => loadMetagame());

/** Lower = more played, across Commander and 60-card play. */
const playKey = (card: ScryfallCard) => estimateObscurity(card, peekMetagame());

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

function emptyAnswer(round: number, questionId: string, status: AnswerStatus): AnswerRecord {
  return {
    round,
    questionId,
    status,
    card: null,
    points: 0,
    basePoints: 0,
    speedBonus: 0,
    tierId: null,
    edhrecRank: null,
    answeredAt: new Date().toISOString(),
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
  loss: RoundLoss | null;
  rejection: Rejection | null;
  /** Milliseconds left on the clock (frozen while Scryfall is answering). */
  msRemaining: number;
  attemptsLeft: number;
  /** True when a new UTC day has started but this gauntlet is still yesterday's. */
  newDayAvailable: boolean;
  beginRound: () => void;
  submitAnswer: (text: string) => Promise<void>;
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
  const [practiceRound, setPracticeRound] = useState<RoundState | null>(null);
  const [practiceEnded, setPracticeEnded] = useState(false);

  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [loss, setLoss] = useState<RoundLoss | null>(null);
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const busySinceRef = useRef(0);
  const [now, setNow] = useState(() => Date.now());

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
  const questionIds = useMemo(() => questions.map((q) => q.id), [questions]);
  const answers = useMemo(
    () => (isDaily ? (dailyRecord?.answers ?? []) : practiceAnswers),
    [isDaily, dailyRecord, practiceAnswers],
  );
  const roundIndex = answers.length;
  const roundNumber = roundIndex + 1;
  const currentQuestion = questions[roundIndex] ?? null;
  const totalScore = answers.reduce((sum, a) => sum + a.points, 0);
  const complete = isDaily ? answers.length >= questions.length : practiceEnded;

  const storedRound = isDaily ? (dailyRecord?.roundState ?? null) : practiceRound;
  const activeRound = storedRound && storedRound.round === roundNumber ? storedRound : null;
  const roundRef = useRef(activeRound);
  roundRef.current = activeRound;

  const view: GameView = reveal
    ? 'reveal'
    : loss
      ? 'lost'
      : complete
        ? 'summary'
        : currentQuestion && activeRound
          ? 'question'
          : 'ready';

  const msRemaining = activeRound
    ? Math.max(0, activeRound.deadline - (busy ? busySinceRef.current : now))
    : ROUND_SECONDS * 1000;
  const attemptsLeft = MAX_ATTEMPTS - (activeRound?.wrongAttempts ?? 0);

  /* ---------------------------------------------------------------- */
  /* Round clock                                                       */
  /* ---------------------------------------------------------------- */

  const saveRound = useCallback(
    (round: RoundState | null) => {
      roundRef.current = round;
      if (isDaily) store.update((p) => setDailyRoundState(p, dateKey, questionIds, round));
      else setPracticeRound(round);
    },
    [isDaily, store, dateKey, questionIds],
  );

  const startRound = useCallback(
    (round: number) => {
      setNow(Date.now());
      saveRound({ round, deadline: Date.now() + ROUND_SECONDS * 1000, wrongAttempts: 0 });
    },
    [saveRound],
  );

  useEffect(() => {
    if (view !== 'question') return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [view]);

  /* ---------------------------------------------------------------- */
  /* Day rollover                                                      */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!isDaily) return;
    const id = window.setInterval(() => setLiveDateKey(utcDateKey()), 15_000);
    return () => window.clearInterval(id);
  }, [isDaily]);

  useEffect(() => {
    const untouched = !dailyRecord || (dailyRecord.answers.length === 0 && !dailyRecord.roundState);
    if (liveDateKey !== dateKey && !reveal && !loss && untouched) setDateKey(liveDateKey);
  }, [liveDateKey, dateKey, dailyRecord, reveal, loss]);

  /* ---------------------------------------------------------------- */
  /* Recording                                                         */
  /* ---------------------------------------------------------------- */

  const setBusyState = useCallback((value: boolean) => {
    busyRef.current = value;
    if (value) busySinceRef.current = Date.now();
    setBusy(value);
  }, []);

  const recordAnswer = useCallback(
    (answer: AnswerRecord) => {
      roundRef.current = null;
      if (isDaily) {
        store.update((p) => recordDailyAnswer(p, dateKey, questionIds, answer));
      } else {
        setPracticeRound(null);
        setPracticeAnswers((list) => [...list, answer]);
        store.update((p) => recordPracticeAnswer(p, answer));
      }
    },
    [isDaily, store, dateKey, questionIds],
  );

  const loseRound = useCallback(
    (reason: RoundLoss['reason'], lastRejection?: RoundLoss['lastRejection']) => {
      if (!currentQuestion) return;
      const answer = emptyAnswer(roundNumber, currentQuestion.id, reason);
      recordAnswer(answer);
      setRejection(null);
      setLoss({ reason, question: currentQuestion, answer, lastRejection });
      audioCues.reject();
    },
    [currentQuestion, roundNumber, recordAnswer],
  );

  // Time's up. Never fires mid-lookup; the lookup's time is handed back.
  useEffect(() => {
    if (view !== 'question' || !activeRound || busyRef.current) return;
    if (now >= activeRound.deadline) loseRound('timeout');
  }, [view, activeRound, now, loseRound]);

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */

  const beginRound = useCallback(() => {
    if (!currentQuestion || activeRound || complete) return;
    audioCues.prime();
    startRound(roundNumber);
  }, [currentQuestion, activeRound, complete, startRound, roundNumber]);

  const submitAnswer = useCallback(
    async (text: string) => {
      const round = roundRef.current;
      if (busyRef.current || !currentQuestion || !round || reveal || loss || !text.trim()) return;
      const startedAt = Date.now();
      if (startedAt >= round.deadline) return;

      audioCues.prime();
      setRejection(null);
      setBusyState(true);
      const remainingAtSubmit = round.deadline - startedAt;
      const giveTimeBack = (wrongAttempts: number) => ({
        ...round,
        deadline: round.deadline + (Date.now() - startedAt),
        wrongAttempts,
      });
      const usedOracleIds = new Set(answers.flatMap((a) => (a.card ? [a.card.oracleId] : [])));

      try {
        // Usually loaded at startup; picking the most-played match needs it.
        await loadMetagame();
        const resolution = await resolveAnswer(
          text,
          { question: currentQuestion, usedOracleIds, popularityKey: playKey },
          scryfall,
        );

        if (resolution.status === 'accepted') {
          const { card } = resolution;
          const score = await engine.score(card);
          const bonus = speedBonus(remainingAtSubmit);
          const answer: AnswerRecord = {
            round: roundNumber,
            questionId: currentQuestion.id,
            status: 'answered',
            card: snapshotCard(card),
            points: score.points + bonus,
            basePoints: score.points,
            speedBonus: bonus,
            tierId: score.tier.id,
            edhrecRank: score.edhrecRank,
            matchedFace: resolution.validation.matchedFace,
            typed: resolution.kind === 'exact' ? undefined : resolution.typed,
            answeredAt: new Date().toISOString(),
          };
          recordAnswer(answer);
          setReveal({
            card,
            score,
            question: currentQuestion,
            answer,
            notes: resolution.note ? [resolution.note] : [],
          });
          audioCues.tier(score.tier.order);
          return;
        }

        if (resolution.status === 'not_found') {
          saveRound(giveTimeBack(round.wrongAttempts));
          setRejection({
            kind: 'lookup',
            title: 'No such card in the Multiverse',
            reason: resolution.message,
            costAttempt: false,
            attemptsLeft: MAX_ATTEMPTS - round.wrongAttempts,
          });
          audioCues.reject();
          return;
        }

        const wrongAttempts = round.wrongAttempts + (resolution.costsAttempt ? 1 : 0);
        if (wrongAttempts >= MAX_ATTEMPTS) {
          loseRound('out-of-attempts', {
            title: resolution.title,
            reason: resolution.message,
            cardName: resolution.card.name,
            readAs: resolution.readAs,
          });
          return;
        }
        saveRound(giveTimeBack(wrongAttempts));
        setRejection({
          kind: resolution.reason,
          title: resolution.title,
          reason: resolution.message,
          cardName: resolution.card.name,
          cardArt: getImageUris(resolution.card)?.art_crop,
          readAs: resolution.readAs,
          costAttempt: resolution.costsAttempt,
          attemptsLeft: MAX_ATTEMPTS - wrongAttempts,
        });
        audioCues.reject();
      } catch (error) {
        const rateLimited = error instanceof ScryfallRequestError && error.status === 429;
        const cooldown = scryfall.rateLimitCooldownMs;
        const restored = giveTimeBack(round.wrongAttempts);
        // A rate-limit lockout isn't the player's fault: add it back to the clock.
        saveRound(rateLimited ? { ...restored, deadline: restored.deadline + cooldown } : restored);
        setRejection({
          kind: 'network',
          title: rateLimited ? 'Scryfall asked us to slow down' : 'The archives are silent',
          reason: rateLimited
            ? `Too many lookups too quickly. Try again in ${Math.ceil(cooldown / 1000)} seconds; that time has been added to your clock.`
            : "Scryfall didn't answer. Your time was paused; try locking it in again.",
          costAttempt: false,
          attemptsLeft: MAX_ATTEMPTS - round.wrongAttempts,
        });
      } finally {
        setBusyState(false);
        setNow(Date.now());
      }
    },
    [currentQuestion, reveal, loss, answers, roundNumber, recordAnswer, saveRound, loseRound, setBusyState],
  );

  const appendPracticeQuestion = useCallback(() => {
    setPracticeQuestions((list) => [...list, drawPracticeQuestion(list.map((q) => q.id))]);
  }, []);

  /** Moves on and starts the next clock straight away: the click is the "ready". */
  const advance = useCallback(() => {
    setReveal(null);
    setLoss(null);
    setRejection(null);
    const next = answers.length + 1;
    if (isDaily) {
      if (answers.length < questions.length) startRound(next);
    } else if (!practiceEnded) {
      appendPracticeQuestion();
      startRound(next);
    }
  }, [answers.length, isDaily, questions.length, practiceEnded, appendPracticeQuestion, startRound]);

  const pass = useCallback(() => {
    if (busyRef.current || !currentQuestion || reveal || loss) return;
    recordAnswer(emptyAnswer(roundNumber, currentQuestion.id, 'passed'));
    setRejection(null);
    const next = roundNumber + 1;
    if (isDaily) {
      if (next <= questions.length) startRound(next);
    } else {
      appendPracticeQuestion();
      startRound(next);
    }
  }, [currentQuestion, reveal, loss, roundNumber, recordAnswer, isDaily, questions.length, appendPracticeQuestion, startRound]);

  const endPracticeRun = useCallback(() => {
    if (isDaily) return;
    setReveal(null);
    setLoss(null);
    setRejection(null);
    setPracticeRound(null);
    setPracticeEnded(true);
    const score = practiceAnswers.reduce((sum, a) => sum + a.points, 0);
    store.update((p) => recordPracticeRun(p, score, practiceAnswers.length));
  }, [isDaily, practiceAnswers, store]);

  const restartPractice = useCallback(() => {
    setPracticeQuestions([drawPracticeQuestion()]);
    setPracticeAnswers([]);
    setPracticeRound(null);
    setPracticeEnded(false);
    setReveal(null);
    setLoss(null);
    setRejection(null);
  }, []);

  const startNewDay = useCallback(() => {
    const today = utcDateKey();
    setLiveDateKey(today);
    setDateKey(today);
    setReveal(null);
    setLoss(null);
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
    loss,
    rejection,
    msRemaining,
    attemptsLeft,
    newDayAvailable: isDaily && liveDateKey !== dateKey,
    beginRound,
    submitAnswer,
    pass,
    advance,
    dismissRejection: () => setRejection(null),
    endPracticeRun,
    restartPractice,
    startNewDay,
  };
}
