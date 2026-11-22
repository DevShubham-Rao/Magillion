import { Fragment } from 'react';
import { motion } from 'framer-motion';
import type { AnswerRecord } from '../types/game';
import { tierById } from '../data/rarityTiers';
import { RarityGem } from './art/RarityGem';

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function toNumeral(n: number): string {
  return NUMERALS[n - 1] ?? String(n);
}

function Node({ index, answer, current }: { index: number; answer?: AnswerRecord; current: boolean }) {
  const tier = answer?.tierId ? tierById(answer.tierId) : null;
  const label = answer
    ? answer.status === 'passed'
      ? `Round ${index + 1}: passed`
      : `Round ${index + 1}: ${answer.points} points, ${tier?.name}`
    : current
      ? `Round ${index + 1}: current`
      : `Round ${index + 1}: upcoming`;

  return (
    <li className="relative grid h-9 w-9 place-items-center sm:h-11 sm:w-11" aria-label={label} aria-current={current ? 'step' : undefined}>
      {tier ? (
        <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}>
          <RarityGem tier={tier} size={30} />
        </motion.span>
      ) : answer ? (
        <span className="grid h-7 w-7 rotate-45 place-items-center border border-ash/40 bg-obsidian sm:h-8 sm:w-8">
          <span className="-rotate-45 text-xs text-ash">✕</span>
        </span>
      ) : (
        <>
          {current && (
            <span aria-hidden="true" className="absolute inset-0 rotate-45 animate-slow-pulse border border-gold shadow-[0_0_18px_rgba(200,170,110,0.55)]" />
          )}
          <span
            className={`grid h-7 w-7 rotate-45 place-items-center border sm:h-8 sm:w-8 ${
              current ? 'border-gold-pale bg-gold/15' : 'border-gold/25 bg-obsidian'
            }`}
          >
            <span className={`-rotate-45 font-display text-[11px] font-bold ${current ? 'text-gold-pale' : 'text-ash/70'}`}>
              {toNumeral(index + 1)}
            </span>
          </span>
        </>
      )}
    </li>
  );
}

/** One diamond waypoint per round; answered rounds turn into the gem they earned. */
export function GauntletTrack({ total, answers, current }: { total: number; answers: AnswerRecord[]; current: number }) {
  return (
    <nav aria-label="Rounds">
      <ol className="flex items-center justify-center">
        {Array.from({ length: total }, (_, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <li aria-hidden="true" className="h-px w-3 sm:w-8" style={{ background: i <= answers.length ? 'linear-gradient(90deg,#C8AA6E,#E8D9AE)' : 'rgba(200,170,110,.2)' }} />
            )}
            <Node index={i} answer={answers[i]} current={i === current} />
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
