import { AnimatePresence, motion } from 'framer-motion';
import { PLANES, planarPosition, type Plane } from '../data/planes';

/** A four-point spark: the player's planeswalker spark on the path. */
export function Spark({ color, size = 23 }: { color: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ filter: `drop-shadow(0 0 6px ${color})` }}>
      <path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z" fill={color} />
      <circle cx="12" cy="12" r="2.4" fill="#fffaf0" />
    </svg>
  );
}

/** The backdrop takes on the colors of whichever plane you're on. */
export function PlanarSky({ plane }: { plane: Plane }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
      <AnimatePresence initial={false}>
        <motion.div
          key={plane.id}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.8, ease: 'easeInOut' }}
          style={{
            background: `radial-gradient(1100px 650px at 50% -8%, ${plane.sky.glow}, transparent 62%), linear-gradient(180deg, ${plane.sky.top} 0%, ${plane.sky.bottom} 72%)`,
          }}
        />
      </AnimatePresence>
    </div>
  );
}

const STATION = 23;

function statusText(total: number): string {
  const { plane, next } = planarPosition(total);
  const here = `On ${plane.name} with ${total.toLocaleString('en-US')} points.`;
  return next ? `${here} ${(next.reach - total).toLocaleString('en-US')} more to reach ${next.name}.` : `${here} You've walked past every plane.`;
}

/**
 * The whole walk as a vertical path, Dominaria at the top and the Blind
 * Eternities at the bottom. The spark slides down as the day's total grows.
 */
export function PlanarRail({ total, className }: { total: number; className?: string }) {
  const pos = planarPosition(total);
  return (
    <nav aria-label="Your planeswalk" className={`relative h-full ${className ?? ''}`}>
      <p className="sr-only" role="status">
        {statusText(total)}
      </p>
      <div
        aria-hidden="true"
        className="absolute w-px"
        style={{
          right: STATION / 2,
          top: STATION / 2,
          bottom: STATION / 2,
          background: 'linear-gradient(180deg, rgba(200,170,110,.5), rgba(242,213,255,.18) 80%, rgba(242,213,255,.05))',
        }}
      />
      <motion.div
        aria-hidden="true"
        className="absolute w-[3px] rounded-full"
        style={{
          right: STATION / 2 - 1,
          top: STATION / 2,
          background: `linear-gradient(180deg, #C8AA6E, ${pos.plane.accent})`,
          boxShadow: `0 0 10px ${pos.plane.accent}`,
        }}
        initial={false}
        animate={{ height: `calc(${pos.depth} * (100% - ${STATION}px))` }}
        transition={{ type: 'spring', stiffness: 60, damping: 18 }}
      />
      <ol className="relative flex h-full flex-col justify-between">
        {PLANES.map((plane, i) => {
          const reached = i <= pos.index;
          const current = i === pos.index;
          return (
            <li key={plane.id} className="flex items-center justify-end gap-3" aria-current={current ? 'location' : undefined}>
              <div className="min-w-0 text-right leading-tight">
                <p
                  className={`font-display text-[13px] font-semibold ${
                    current ? 'text-parchment' : reached ? 'text-parchment/65' : 'text-ash/55'
                  }`}
                  style={current ? { color: plane.accent } : undefined}
                >
                  {plane.name}
                </p>
                <p className="tabular text-[11px] text-ash/65">{plane.reach.toLocaleString('en-US')}</p>
              </div>
              <span className="grid shrink-0 place-items-center" style={{ width: STATION, height: STATION }}>
                <span
                  className="block h-2.5 w-2.5 rounded-full"
                  style={{
                    background: reached ? plane.accent : 'transparent',
                    border: `1px solid ${plane.accent}`,
                    opacity: reached ? 1 : 0.4,
                  }}
                />
              </span>
            </li>
          );
        })}
      </ol>
      <motion.div
        aria-hidden="true"
        className="absolute right-0"
        initial={false}
        animate={{ top: `calc(${pos.depth} * (100% - ${STATION}px))` }}
        transition={{ type: 'spring', stiffness: 60, damping: 18 }}
      >
        <motion.div animate={{ scale: [1, 1.18, 1] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}>
          <Spark color={pos.plane.accent} size={STATION} />
        </motion.div>
      </motion.div>
    </nav>
  );
}

/** Phones get the walk as one line: where you are and how far to the next plane. */
export function PlanarBar({ total, className }: { total: number; className?: string }) {
  const pos = planarPosition(total);
  return (
    <div className={`mx-auto w-full max-w-3xl ${className ?? ''}`}>
      <p className="sr-only" role="status">
        {statusText(total)}
      </p>
      <div aria-hidden="true" className="flex items-center gap-2.5">
        <Spark color={pos.plane.accent} size={18} />
        <span className="font-display text-sm font-semibold" style={{ color: pos.plane.accent }}>
          {pos.plane.name}
        </span>
        <span className="ml-auto text-xs text-ash">
          {pos.next ? `${(pos.next.reach - total).toLocaleString('en-US')} to ${pos.next.name}` : 'Past every plane'}
        </span>
      </div>
      <div aria-hidden="true" className="mt-2 h-[3px] overflow-hidden rounded-full bg-white/8">
        <motion.div
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${pos.plane.accent}, ${pos.next?.accent ?? pos.plane.accent})` }}
          initial={false}
          animate={{ width: `${Math.max(4, pos.progress * 100)}%` }}
          transition={{ type: 'spring', stiffness: 60, damping: 18 }}
        />
      </div>
    </div>
  );
}

/** Shown on the reveal when an answer carries you onto a new plane. */
export function PlaneArrival({ plane, skipped }: { plane: Plane; skipped: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, delay: 1.6, ease: 'easeOut' }}
      className="mx-auto mb-8 flex max-w-xl items-center gap-4 rounded-[3px] border px-5 py-3.5 text-left"
      style={{ borderColor: `${plane.accent}66`, background: `linear-gradient(90deg, ${plane.accent}1f, transparent)` }}
      role="status"
    >
      <Spark color={plane.accent} size={30} />
      <div>
        <p className="font-display text-lg font-bold" style={{ color: plane.accent }}>
          You walked to {plane.name}
          {skipped > 0 && (
            <span className="ml-2 text-sm font-semibold text-parchment/60">
              passing {skipped} plane{skipped === 1 ? '' : 's'} on the way
            </span>
          )}
        </p>
        <p className="font-flavor text-base italic text-parchment/70">{plane.line}</p>
      </div>
    </motion.div>
  );
}
