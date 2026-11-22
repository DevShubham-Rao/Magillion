import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy } from 'lucide-react';
import type { AnswerRecord, PlayerProgress } from '../types/game';
import type { QuestionDefinition } from '../types/mtg';
import { tierById } from '../data/rarityTiers';
import { questionById } from '../data/questionPool';
import { buildDailyShareText, copyText, answerEmoji } from '../services/share';
import { PLANES, planarPosition } from '../data/planes';
import { formatCountdown, formatDateKey } from '../lib/dates';
import { useCountdown } from '../hooks/useCountdown';
import { RarityGem } from './art/RarityGem';
import { FiligreeDivider } from './art/Filigree';
import { ScoreTally } from './ScoreTally';
import { toNumeral } from './GauntletTrack';
import { PlanarRail, Spark } from './Planeswalk';

const STATUS_LABEL: Record<AnswerRecord['status'], string> = {
  answered: '',
  passed: 'Passed',
  timeout: 'Out of time',
  'out-of-attempts': 'Out of attempts',
};

function AnswerTile({ answer, question, index }: { answer: AnswerRecord; question?: QuestionDefinition; index: number }) {
  const tier = answer.tierId ? tierById(answer.tierId) : null;
  return (
    <motion.li
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.25 + index * 0.08 }}
      className="flex w-[calc(50%-0.5rem)] flex-col text-left sm:w-40"
    >
      <div className="relative rounded-[10px] p-[4px]" style={{ boxShadow: tier && tier.order >= 3 ? tier.glow : undefined }}>
        <div
          aria-hidden="true"
          className={`absolute inset-0 rounded-[10px] ${tier?.id === 'serialized' ? 'animate-prismatic' : ''}`}
          style={{ background: tier ? tier.frameGradient : 'linear-gradient(145deg,#2b2f3e,#1a1e2c)' }}
        />
        <div className="relative overflow-hidden rounded-[7px] bg-obsidian">
          {answer.card?.artCrop ? (
            <img
              src={answer.card.artCrop}
              alt={`${answer.card.name} artwork`}
              className="aspect-[626/457] w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="grid aspect-[626/457] w-full place-items-center font-flavor italic text-ash">
              {STATUS_LABEL[answer.status]}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {tier && <RarityGem tier={tier} size={18} />}
        <span className="tabular font-display text-base font-bold text-parchment">{answer.points.toLocaleString('en-US')}</span>
        <span className="ml-auto font-display text-xs text-ash">{toNumeral(index + 1)}</span>
      </div>
      <p className="truncate text-sm font-semibold text-parchment/90" title={answer.card?.name}>
        {answer.card?.name ?? 'No card named'}
      </p>
      <p className="truncate text-xs text-ash">{question?.shortLabel}</p>
    </motion.li>
  );
}

interface SummaryScreenProps {
  dateKey: string;
  puzzleNumber: number;
  answers: AnswerRecord[];
  progress: PlayerProgress;
  streak: number;
  newDayAvailable: boolean;
  onStartNewDay: () => void;
}

export function SummaryScreen({
  dateKey,
  puzzleNumber,
  answers,
  progress,
  streak,
  newDayAvailable,
  onStartNewDay,
}: SummaryScreenProps) {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  const { msRemaining } = useCountdown();
  const total = answers.reduce((sum, a) => sum + a.points, 0);
  const url = typeof window !== 'undefined' ? window.location.origin : '';
  const shareText = buildDailyShareText({ puzzleNumber, answers, streak, url });
  const { plane, index, next } = planarPosition(total);
  const stayedHome = index === 0;

  const onCopy = async () => {
    const ok = await copyText(shareText);
    setCopied(ok ? 'copied' : 'failed');
    window.setTimeout(() => setCopied('idle'), 2400);
  };

  const stats = [
    { label: 'Current streak', value: streak },
    { label: 'Best streak', value: progress.stats.maxStreak },
    { label: 'Walks finished', value: progress.stats.dailiesCompleted },
    { label: 'Best score', value: progress.stats.bestDailyScore.toLocaleString('en-US') },
  ];

  return (
    <section aria-labelledby="summary-title" className="mx-auto w-full max-w-5xl text-center">
      <p className="font-flavor text-lg italic text-parchment/65">
        Planeswalk #{puzzleNumber}, {formatDateKey(dateKey)}
      </p>
      <motion.div
        className="mx-auto mt-5 flex w-fit items-center gap-3"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
      >
        <Spark color={plane.accent} size={40} />
        <h2 id="summary-title" className="font-display text-3xl font-bold sm:text-4xl" style={{ color: plane.accent }}>
          {stayedHome ? 'You stayed on Dominaria' : `You walked to ${plane.name}`}
        </h2>
      </motion.div>
      <p className="mt-2 font-flavor text-lg italic text-parchment/70">
        {plane.line} Plane {index + 1} of {PLANES.length}
        {next ? `, ${(next.reach - total).toLocaleString('en-US')} points short of ${next.name}.` : '.'}
      </p>

      <ScoreTally points={total} delay={0.2} suffix="points" className="mt-6 justify-center" />

      <div className="mx-auto mt-8 h-[400px] max-w-[15rem] lg:hidden">
        <PlanarRail total={total} />
      </div>

      <FiligreeDivider className="mx-auto my-8 max-w-full" />

      {answers.length > 0 && (
        <ol className="mx-auto flex max-w-4xl flex-wrap justify-center gap-4">
          {answers.map((answer, i) => (
            <AnswerTile key={`${answer.round}-${i}`} answer={answer} question={questionById(answer.questionId)} index={i} />
          ))}
        </ol>
      )}

      <div className="mx-auto mt-10 max-w-md">
        <p className="text-3xl tracking-[0.15em]" aria-label="Result grid">
          {answers.slice(-10).map(answerEmoji).join('')}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button type="button" className="btn-gold" onClick={onCopy}>
            {copied === 'copied' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            {copied === 'copied' ? 'Copied' : 'Copy results'}
          </button>
        </div>
        <p className="mt-2 min-h-5 text-xs text-ash" role="status">
          {copied === 'copied'
            ? 'Results copied without card names, so nobody gets spoiled.'
            : copied === 'failed'
              ? "Your browser blocked the clipboard. Select the grid above and copy it by hand."
              : ''}
        </p>
      </div>

      <dl className="mx-auto mt-8 grid max-w-2xl grid-cols-2 gap-px overflow-hidden rounded-[3px] border border-gold/20 bg-gold/15 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-grimoire px-3 py-4">
            <dt className="text-xs text-ash">{s.label}</dt>
            <dd className="tabular mt-1 font-display text-2xl font-bold text-parchment">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8" role="timer" aria-live="off">
        {newDayAvailable ? (
          <button type="button" className="btn-gold" onClick={onStartNewDay}>
            Begin today’s Planeswalk
          </button>
        ) : (
          <p className="text-sm text-ash">
            Next Planeswalk in <span className="tabular font-display text-lg font-semibold text-gold-pale">{formatCountdown(msRemaining)}</span>
          </p>
        )}
      </div>
    </section>
  );
}
