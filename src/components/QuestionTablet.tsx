import { motion } from 'framer-motion';
import type { QuestionDefinition } from '../types/mtg';
import { FiligreeDivider, FiligreeFrame } from './art/Filigree';
import { SymbolText } from './ManaCost';

/** The engraved slab carrying the round's prompt. */
export function QuestionTablet({ question }: { question: QuestionDefinition }) {
  return (
    <section aria-live="polite" className="engraved-panel relative px-6 pb-7 pt-9 text-center sm:px-14 sm:pb-8 sm:pt-10">
      <FiligreeFrame size={58} inset={4} />
      <motion.h2
        key={question.id}
        initial={{ opacity: 0, y: 8, filter: 'blur(6px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="mx-auto max-w-[18ch] font-display text-[2rem] font-semibold leading-[1.12] text-parchment sm:text-5xl"
        style={{ textShadow: '0 2px 0 rgba(0,0,0,.6), 0 0 34px rgba(200,170,110,.18)' }}
      >
        {question.prompt}
      </motion.h2>
      <FiligreeDivider className="mx-auto my-5 max-w-full" />
      <motion.p
        key={`${question.id}-hint`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.25 }}
        className="mx-auto max-w-[52ch] font-flavor text-lg italic leading-snug text-parchment/70 sm:text-xl"
      >
        <SymbolText text={question.hint} size={15} />
      </motion.p>
    </section>
  );
}
