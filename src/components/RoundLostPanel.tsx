import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, Hourglass, ShieldX } from 'lucide-react';
import type { GameMode, RoundLoss } from '../types/game';
import { scryfallSearchUrl } from '../services/scryfallService';
import { CARD_POOL_QUERY } from '../services/cardEligibility';
import { FiligreeDivider, FiligreeFrame } from './art/Filigree';
import { MAX_ATTEMPTS } from '../data/gameRules';

interface RoundLostPanelProps {
  loss: RoundLoss;
  mode: GameMode;
  roundLabel: string;
  isLastRound: boolean;
  onNext: () => void;
  onEndRun?: () => void;
}

/** A round that ran out of time or attempts. Scores 0 and moves on. */
export function RoundLostPanel({ loss, mode, roundLabel, isLastRound, onNext, onEndRun }: RoundLostPanelProps) {
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, []);

  const timeout = loss.reason === 'timeout';
  const Icon = timeout ? Hourglass : ShieldX;
  const nextLabel = mode === 'daily' ? (isLastRound ? 'See your results' : 'Next round') : 'Next prompt';

  return (
    <section aria-labelledby="lost-title" className="mx-auto w-full max-w-2xl">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35 }}
        className="engraved-panel relative px-6 py-10 text-center sm:px-12"
      >
        <FiligreeFrame size={52} inset={4} />
        <Icon size={34} className="mx-auto text-ember" aria-hidden="true" />
        <p className="mt-4 text-sm text-ash">
          {roundLabel}
          <span className="mx-2 text-gold/50" aria-hidden="true">
            ◆
          </span>
          {loss.question.prompt}
        </p>
        <h2 id="lost-title" className="mt-2 font-display text-3xl font-bold text-parchment">
          {timeout ? 'The sands ran out' : 'Out of attempts'}
        </h2>
        <p className="mt-2 font-flavor text-lg italic text-parchment/70">
          {timeout ? 'No card was locked in before the clock emptied.' : `${MAX_ATTEMPTS} answers missed the mark.`} This round
          scores 0.
        </p>

        {loss.lastRejection && (
          <div className="mx-auto mt-5 max-w-md rounded-[3px] border border-ember/30 bg-ember/10 px-4 py-3 text-left">
            <p className="font-display text-sm font-bold text-ember">{loss.lastRejection.title}</p>
            {loss.lastRejection.readAs && <p className="text-xs text-ash">Read as {loss.lastRejection.readAs}</p>}
            <p className="mt-0.5 text-sm text-parchment/85">{loss.lastRejection.reason}</p>
          </div>
        )}

        <FiligreeDivider className="mx-auto my-6 max-w-full" />

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button ref={nextRef} type="button" className="btn-gold" onClick={onNext}>
            {nextLabel}
          </button>
          {mode === 'practice' && onEndRun && (
            <button type="button" className="btn-ghost" onClick={onEndRun}>
              End run
            </button>
          )}
        </div>
        <a
          className="mt-5 inline-flex items-center gap-1.5 text-sm text-gold-pale underline decoration-gold/40 underline-offset-4 hover:decoration-gold"
          href={scryfallSearchUrl(`${loss.question.scryfallQueryHint} game:paper ${CARD_POOL_QUERY}`)}
          target="_blank"
          rel="noreferrer"
        >
          See the rarest answers to this prompt <ExternalLink size={14} aria-hidden="true" />
        </a>
      </motion.div>
    </section>
  );
}
