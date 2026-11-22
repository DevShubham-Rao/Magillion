import { motion } from 'framer-motion';
import type { GameController } from '../hooks/useGame';
import { MAX_ATTEMPTS, MAX_SPEED_BONUS, ROUND_SECONDS } from '../data/gameRules';
import { planarPosition } from '../data/planes';
import { formatDateKey } from '../lib/dates';
import { toNumeral } from './GauntletTrack';
import { PlanarRail } from './Planeswalk';

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/**
 * The front door: the day's walk before the first prompt, or the way back in
 * after a reload mid-walk. The prompt stays hidden until the clock starts.
 */
export function PlaneswalkLanding({ game }: { game: GameController }) {
  const resuming = game.roundIndex > 0;
  const pos = planarPosition(game.totalScore);
  const count = game.questions.length;
  const countWord = NUMBER_WORDS[count] ?? String(count);

  return (
    <section aria-labelledby="landing-title" className="mx-auto w-full max-w-3xl pt-4 text-center lg:pt-10">
      <motion.p
        className="font-flavor text-lg italic text-parchment/65 sm:text-xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        Planeswalk #{game.puzzleNumber}, {formatDateKey(game.dateKey)}
      </motion.p>
      <motion.h2
        id="landing-title"
        className="gold-text mt-3 font-display text-[2.6rem] font-bold leading-[1.05] sm:text-6xl"
        initial={{ opacity: 0, y: 12, letterSpacing: '0.12em' }}
        animate={{ opacity: 1, y: 0, letterSpacing: '0.02em' }}
        transition={{ duration: 1.1, ease: 'easeOut' }}
      >
        The Daily Planeswalk
      </motion.h2>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.5 }}>
        {resuming ? (
          <p className="mx-auto mt-6 max-w-[46ch] text-[17px] leading-relaxed text-parchment/85">
            Your spark is on <span style={{ color: pos.plane.accent }}>{pos.plane.name}</span> with{' '}
            {game.totalScore.toLocaleString('en-US')} points. Round {toNumeral(game.roundIndex + 1)} of {toNumeral(count)} is
            waiting, and its clock starts when you step back in.
          </p>
        ) : (
          <p className="mx-auto mt-6 max-w-[46ch] text-[17px] leading-relaxed text-parchment/85">
            {countWord.charAt(0).toUpperCase() + countWord.slice(1)} prompts, one card each. The less a card is played, the
            farther it carries your spark: out from Dominaria, across the planes, toward the Blind Eternities.
          </p>
        )}

        <button type="button" className="btn-gold mt-8 px-8 text-base" onClick={game.beginRound} autoFocus>
          {resuming ? 'Resume the Planeswalk' : 'Begin the Planeswalk'}
        </button>
        <p className="mt-4 text-sm text-ash">
          {ROUND_SECONDS} seconds and {MAX_ATTEMPTS} attempts per prompt. Answer fast for up to {MAX_SPEED_BONUS} bonus points.
        </p>
      </motion.div>

      {/* Phones see the map here; wider screens have it beside the game. */}
      <motion.div
        className="mx-auto mt-10 h-[420px] max-w-[15rem] lg:hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.8 }}
      >
        <PlanarRail total={game.totalScore} />
      </motion.div>
    </section>
  );
}
