import { AnimatePresence, motion } from 'framer-motion';
import { ShieldX, X } from 'lucide-react';
import type { Rejection, RejectionKind } from '../types/game';

const ACCENT: Record<RejectionKind, string> = {
  legality: '#D9714F',
  criteria: '#E5B84B',
  duplicate: '#8FB3D9',
  lookup: '#A3B8CC',
  network: '#9A958A',
};

/** Explains why a card was turned away. Never costs the player the round. */
export function RejectionBanner({ rejection, onDismiss }: { rejection: Rejection | null; onDismiss: () => void }) {
  return (
    <AnimatePresence mode="wait">
      {rejection && (
        <motion.div
          key={`${rejection.title}-${rejection.cardName ?? ''}`}
          role="alert"
          initial={{ opacity: 0, y: -8, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1, x: [0, -6, 5, -3, 0] }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.4 }}
          className="relative flex items-start gap-4 overflow-hidden rounded-[3px] border p-3 pr-11 text-left sm:p-4 sm:pr-12"
          style={{
            borderColor: `${ACCENT[rejection.kind]}66`,
            background: `linear-gradient(100deg, ${ACCENT[rejection.kind]}1f, rgba(14,16,24,.94) 55%)`,
          }}
        >
          {rejection.cardArt ? (
            <img
              src={rejection.cardArt}
              alt=""
              className="h-14 w-20 shrink-0 rounded-[2px] object-cover opacity-80 grayscale-[0.5] sm:h-16 sm:w-24"
              style={{ boxShadow: `0 0 0 1px ${ACCENT[rejection.kind]}88` }}
            />
          ) : (
            <ShieldX size={28} className="mt-0.5 shrink-0" style={{ color: ACCENT[rejection.kind] }} aria-hidden="true" />
          )}
          <div className="min-w-0">
            <p className="font-display text-[15px] font-bold" style={{ color: ACCENT[rejection.kind] }}>
              {rejection.title}
            </p>
            <p className="mt-0.5 text-sm leading-relaxed text-parchment/85">{rejection.reason}</p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full text-ash hover:bg-white/5 hover:text-parchment"
          >
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
