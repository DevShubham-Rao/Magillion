import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import type { GameMode, RevealState } from '../types/game';
import { FoilCard } from './FoilCard';
import { ParticleBurst } from './ParticleBurst';
import { RarityGem } from './art/RarityGem';
import { ScoreTally } from './ScoreTally';
import { ObscurityMeter } from './ObscurityMeter';
import { scryfallSearchUrl } from '../services/scryfallService';

interface RevealPanelProps {
  reveal: RevealState;
  mode: GameMode;
  roundLabel: string;
  isLastRound: boolean;
  onNext: () => void;
  onEndRun?: () => void;
}

export function RevealPanel({ reveal, mode, roundLabel, isLastRound, onNext, onEndRun }: RevealPanelProps) {
  const { card, score, question, validationNote } = reveal;
  const { tier } = score;
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => nextRef.current?.focus({ preventScroll: true }), 1400);
    return () => window.clearTimeout(id);
  }, []);

  const notes = [validationNote, ...score.notes].filter((n): n is string => Boolean(n));
  const nextLabel = mode === 'daily' ? (isLastRound ? 'See your results' : 'Next round') : 'Next prompt';
  const prismatic = tier.id === 'serialized';

  return (
    <section
      aria-labelledby="reveal-title"
      className="mx-auto grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-16"
    >
      <div className="relative mx-auto">
        <ParticleBurst tier={tier} />
        <FoilCard card={card} tier={tier} />
      </div>

      <motion.div
        className="text-center lg:text-left"
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.55 }}
      >
        <p className="text-sm text-ash">
          {roundLabel}
          <span className="mx-2 text-gold/50" aria-hidden="true">
            ◆
          </span>
          {question.prompt}
        </p>

        <div className="mt-5 flex items-center justify-center gap-4 lg:justify-start">
          <RarityGem tier={tier} size={52} />
          <div className="text-left">
            {tier.title !== tier.name && <p className="text-sm font-semibold text-ash">{tier.name}</p>}
            <h2
              id="reveal-title"
              className={`font-display text-2xl font-bold leading-tight sm:text-3xl ${prismatic ? 'animate-prismatic' : ''}`}
              style={
                prismatic
                  ? {
                      background: 'linear-gradient(90deg, #FFE38A, #9FF5E8, #8AB8FF, #F6A8FF, #FF9FB2)',
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      color: 'transparent',
                    }
                  : { color: tier.color }
              }
            >
              {tier.title}
            </h2>
            <p className="font-flavor text-lg italic text-parchment/70">{tier.tagline}</p>
          </div>
        </div>

        <ScoreTally points={score.points} className="mt-7 justify-center lg:justify-start" />

        <div className="mt-6 max-w-md lg:max-w-lg mx-auto lg:mx-0">
          <ObscurityMeter points={score.points} tier={tier} />
        </div>

        <dl className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-x-6 gap-y-1 text-left lg:mx-0">
          <dt className="text-xs text-ash">Commander popularity</dt>
          <dt className="text-xs text-ash">Card</dt>
          <dd className="tabular font-display text-lg font-semibold text-parchment">{score.rankLabel}</dd>
          <dd className="truncate font-display text-lg font-semibold text-parchment" title={card.name}>
            {card.name}
          </dd>
        </dl>
        <p className="mx-auto mt-2 max-w-md text-xs text-ash lg:mx-0">
          Rank #1 is the most-played card on EDHREC. The higher the rank, the fewer decks run it.
        </p>

        {notes.length > 0 && (
          <ul className="mx-auto mt-4 max-w-md space-y-1 font-flavor text-base italic text-gold-pale/85 lg:mx-0">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
          <button ref={nextRef} type="button" className="btn-gold" onClick={onNext}>
            {nextLabel}
          </button>
          {mode === 'practice' && onEndRun && (
            <button type="button" className="btn-ghost" onClick={onEndRun}>
              End run
            </button>
          )}
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm lg:justify-start">
          <a
            className="inline-flex items-center gap-1.5 text-gold-pale underline decoration-gold/40 underline-offset-4 hover:decoration-gold"
            href={card.scryfall_uri}
            target="_blank"
            rel="noreferrer"
          >
            View on Scryfall <ExternalLink size={14} aria-hidden="true" />
          </a>
          <a
            className="inline-flex items-center gap-1.5 text-gold-pale underline decoration-gold/40 underline-offset-4 hover:decoration-gold"
            href={scryfallSearchUrl(`${question.scryfallQueryHint} f:commander`)}
            target="_blank"
            rel="noreferrer"
          >
            Rarest answers to this prompt <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      </motion.div>
    </section>
  );
}
