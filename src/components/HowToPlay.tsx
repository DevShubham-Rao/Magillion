import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { RARITY_TIERS } from '../data/rarityTiers';
import { RarityGem } from './art/RarityGem';
import { FiligreeDivider, FiligreeFrame } from './art/Filigree';

export function HowToPlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#05060a]/80 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="how-title"
            className="engraved-panel relative my-8 w-full max-w-2xl px-6 py-10 sm:px-12"
            initial={{ y: 16, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 10, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <FiligreeFrame size={52} inset={4} />
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-ash hover:bg-white/5 hover:text-parchment"
            >
              <X size={18} />
            </button>

            <h2 id="how-title" className="text-center font-display text-3xl font-bold text-parchment">
              How to play
            </h2>
            <FiligreeDivider className="mx-auto my-5 max-w-full" />

            <ol className="mx-auto max-w-prose list-decimal space-y-3 pl-5 text-[15px] leading-relaxed text-parchment/85 marker:font-display marker:text-gold">
              <li>Each round asks you to name a card, like “Name an Artifact.”</li>
              <li>
                Your card must be legal in Commander and fit the prompt. Banned cards, Un-cards and cards that don't fit
                are turned away with a reason, and you can try again at no cost.
              </li>
              <li>
                Points come from EDHREC rank. Sol Ring sits at #1 and scores 50; a card almost nobody plays scores up to
                1,000. Name the most obscure valid card you can think of.
              </li>
              <li>Each card answers once per gauntlet. Stuck? Pass the round for 0 points.</li>
              <li>
                Everyone gets the same five prompts each day. A new gauntlet opens at midnight UTC. Practice mode deals
                endless prompts whenever you like.
              </li>
            </ol>

            <h3 className="mt-8 text-center font-display text-lg font-semibold text-gold-pale">Obscurity tiers</h3>
            <ul className="mx-auto mt-4 max-w-md divide-y divide-gold/10">
              {RARITY_TIERS.map((tier) => (
                <li key={tier.id} className="flex items-center gap-3 py-2.5">
                  <RarityGem tier={tier} size={26} />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-sm font-bold" style={{ color: tier.id === 'serialized' ? '#F6D9FF' : tier.color }}>
                      {tier.name}
                    </p>
                    <p className="font-flavor text-[15px] italic text-parchment/65">{tier.tagline}</p>
                  </div>
                  <span className="tabular shrink-0 text-sm text-ash">
                    {tier.minPoints}–{tier.maxPoints.toLocaleString('en-US')}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-8 text-center">
              <button type="button" className="btn-gold" onClick={onClose}>
                Start playing
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
