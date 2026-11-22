import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion';
import { Repeat2 } from 'lucide-react';
import type { CardFace, RarityTier, ScryfallCard } from '../types/mtg';
import { getFaces, getImageUris, isDoubleSided } from '../lib/cardFaces';
import { CardBack } from './art/CardBack';
import { RarityGem } from './art/RarityGem';
import { ManaCost, OracleText } from './ManaCost';
import { audioCues } from '../services/audioCues';

/**
 * The revealed card: Scryfall art in a Magillion frame forged from the
 * answer's tier metal. It turns over from the card back, then tilts toward
 * the pointer with a holographic layer whose strength scales with rarity.
 */

const RAINBOW =
  'linear-gradient(115deg, transparent 8%, rgba(255,64,160,.75) 22%, rgba(255,214,64,.75) 34%, rgba(64,255,190,.75) 46%, rgba(64,170,255,.75) 58%, rgba(196,64,255,.75) 70%, transparent 86%)';

function foilGradient(tier: RarityTier): string {
  if (tier.order <= 2) {
    return 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,.7) 45%, rgba(255,255,255,.15) 52%, rgba(255,255,255,.6) 58%, transparent 72%)';
  }
  if (tier.order === 3) {
    return 'linear-gradient(115deg, transparent 22%, rgba(255,222,140,.9) 40%, rgba(255,255,240,.7) 50%, rgba(255,196,90,.9) 60%, transparent 80%)';
  }
  return RAINBOW;
}

function plateStyle(tier: RarityTier): CSSProperties {
  return {
    background:
      'linear-gradient(180deg, rgba(255,255,255,.11), rgba(255,255,255,0) 62%), linear-gradient(90deg, #272b37, #1a1d27)',
    boxShadow: `inset 0 0 0 1px ${tier.color}70, 0 1px 0 rgba(0,0,0,.6)`,
  };
}

interface FoilCardProps {
  card: ScryfallCard;
  tier: RarityTier;
  className?: string;
}

export function FoilCard({ card, tier, className }: FoilCardProps) {
  const reduce = useReducedMotion();
  const faces = getFaces(card);
  const doubleSided = isDoubleSided(card);
  const [faceIndex, setFaceIndex] = useState(0);
  const [turns, setTurns] = useState(0);

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 150, damping: 18, mass: 0.6 });
  const sy = useSpring(py, { stiffness: 150, damping: 18, mass: 0.6 });
  const rotateY = useTransform(sx, [0, 1], [-15, 15]);
  const rotateX = useTransform(sy, [0, 1], [12, -12]);
  const bgX = useTransform(sx, [0, 1], [0, 100]);
  const bgY = useTransform(sy, [0, 1], [0, 100]);
  const glareX = useTransform(sx, [0, 1], [5, 95]);
  const glareY = useTransform(sy, [0, 1], [5, 95]);
  const foilPosition = useMotionTemplate`${bgX}% ${bgY}%`;
  const glare = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.42), rgba(255,255,255,0) 46%)`;

  const idle = useRef<Array<{ stop: () => void }>>([]);
  const stopIdle = useCallback(() => {
    idle.current.forEach((c) => c.stop());
    idle.current = [];
  }, []);
  const startIdle = useCallback(
    (delay = 0) => {
      if (reduce) return;
      stopIdle();
      idle.current = [
        animate(px, [px.get(), 0.78, 0.26, 0.5], { duration: 7, repeat: Infinity, ease: 'easeInOut', delay }),
        animate(py, [py.get(), 0.34, 0.66, 0.5], { duration: 7, repeat: Infinity, ease: 'easeInOut', delay }),
      ];
    },
    [px, py, reduce, stopIdle],
  );

  useEffect(() => {
    startIdle(1.6);
    return stopIdle;
  }, [startIdle, stopIdle]);

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (reduce) return;
    const rect = event.currentTarget.getBoundingClientRect();
    px.set((event.clientX - rect.left) / rect.width);
    py.set((event.clientY - rect.top) / rect.height);
  };

  const turnOver = () => {
    setFaceIndex((i) => (i + 1) % faces.length);
    setTurns((t) => t + 1);
    audioCues.flip();
  };

  const face: CardFace = (doubleSided ? faces[faceIndex] : faces[0]) ?? (faces[0] as CardFace);
  const textFaces = doubleSided ? [face] : card.card_faces?.length ? faces : [face];
  const name = doubleSided ? face.name : card.name;
  const manaCost = doubleSided ? face.manaCost : (card.mana_cost ?? face.manaCost);
  const typeLine = doubleSided ? face.typeLine : card.type_line;
  const art = getImageUris(card, faceIndex)?.art_crop;
  const artist = face.artist ?? card.artist;
  const statFace = doubleSided ? face : (faces.find((f) => f.power || f.loyalty || f.defense) ?? face);
  const stat =
    statFace.power !== undefined && statFace.toughness !== undefined
      ? `${statFace.power}/${statFace.toughness}`
      : (statFace.loyalty ?? statFace.defense ?? null);
  const prismatic = tier.id === 'serialized';

  return (
    <div className={className}>
      <div style={{ perspective: 1300 }}>
        <motion.div
          className="relative aspect-[63/88] w-[272px] sm:w-[316px]"
          style={{ rotateX: reduce ? 0 : rotateX, rotateY: reduce ? 0 : rotateY, transformStyle: 'preserve-3d' }}
          onPointerEnter={stopIdle}
          onPointerMove={onPointerMove}
          onPointerLeave={() => {
            px.set(0.5);
            py.set(0.5);
            startIdle(2);
          }}
        >
          <motion.div
            className="relative h-full w-full"
            style={{ transformStyle: 'preserve-3d' }}
            initial={reduce ? false : { rotateY: 180, scale: 0.86, y: 24 }}
            animate={{ rotateY: 0, scale: 1, y: 0 }}
            transition={{ duration: 1.05, ease: [0.2, 0.75, 0.2, 1], delay: 0.1 }}
          >
            {/* Front */}
            <motion.div
              key={turns}
              className="absolute inset-0"
              style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
              initial={turns === 0 || reduce ? false : { rotateY: -90 }}
              animate={{ rotateY: 0 }}
              transition={{ duration: 0.38, ease: 'easeOut' }}
            >
              <div className="relative h-full w-full rounded-[18px] p-[8px]" style={{ boxShadow: tier.glow }}>
                {/* Frame metal sits on its own layer so a prismatic hue shift never tints the art. */}
                <div
                  aria-hidden="true"
                  className={`absolute inset-0 rounded-[18px] ${prismatic ? 'animate-prismatic' : ''}`}
                  style={{ background: tier.frameGradient }}
                />
                <div
                  className="relative flex h-full flex-col gap-[5px] rounded-[11px] bg-[#0d0f15] p-[6px]"
                  style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.08)' }}
                >
                  <div className="flex items-center justify-between gap-2 rounded-[6px] px-2.5 py-[5px]" style={plateStyle(tier)}>
                    <h3 className="min-w-0 truncate font-display text-[13px] font-bold leading-tight text-[#F4ECD6] sm:text-[14px]" title={name}>
                      {name}
                    </h3>
                    <ManaCost cost={manaCost} size={14} className="shrink-0" />
                  </div>

                  <div
                    className="relative shrink-0 overflow-hidden rounded-[3px] bg-[#05060a]"
                    style={{ aspectRatio: '626 / 457', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.7), 0 0 0 1px rgba(200,170,110,.35)' }}
                  >
                    {art ? (
                      <img
                        src={art}
                        alt={`${name} artwork${artist ? ` by ${artist}` : ''}`}
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <div className="grid h-full place-items-center font-flavor italic text-ash">No artwork on Scryfall</div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 rounded-[6px] px-2.5 py-[4px]" style={plateStyle(tier)}>
                    <p className="min-w-0 truncate font-display text-[10.5px] font-semibold text-[#EDE3C8] sm:text-[11.5px]" title={typeLine}>
                      {typeLine}
                    </p>
                    <RarityGem tier={tier} size={16} />
                  </div>

                  <div
                    className={`parchment thin-scroll relative min-h-0 flex-1 overflow-y-auto rounded-[3px] px-3 pt-2 font-flavor text-[13.5px] font-semibold leading-[1.22] sm:text-[14.5px] ${stat ? 'pb-6' : 'pb-2'}`}
                  >
                    {textFaces.map((f, i) => (
                      <div key={f.name} className={i > 0 ? 'mt-2 border-t border-[#8a6f3c]/30 pt-2' : ''}>
                        {textFaces.length > 1 && (
                          <p className="mb-1 flex items-center justify-between gap-2 font-display text-[10.5px] font-bold text-[#4a3a1f]">
                            <span>{f.name}</span>
                            <ManaCost cost={f.manaCost} size={11} />
                          </p>
                        )}
                        <OracleText text={f.oracleText} symbolSize={12} />
                        {f.flavorText && <p className="mt-1.5 font-medium italic opacity-80">{f.flavorText}</p>}
                      </div>
                    ))}
                    {textFaces.every((f) => !f.oracleText && !f.flavorText) && (
                      <p className="italic opacity-60">No rules text.</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 px-1 pb-[1px] font-sans text-[9px] text-[#cfc5ad]/75">
                    <span className="truncate">{artist ? `Illus. ${artist}` : ''}</span>
                    <span className="shrink-0 truncate">{card.set_name}</span>
                  </div>

                  {stat && (
                    <div
                      className="absolute bottom-[21px] right-[12px] rounded-[6px] px-2 py-[1px] font-display text-[14px] font-bold text-[#F4ECD6]"
                      style={plateStyle(tier)}
                    >
                      {stat}
                    </div>
                  )}
                </div>

                {/* Holographic foil and glare */}
                <motion.div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-[18px] mix-blend-color-dodge"
                  style={{
                    backgroundImage: foilGradient(tier),
                    backgroundSize: '240% 240%',
                    backgroundPosition: foilPosition,
                    opacity: tier.foilIntensity,
                  }}
                />
                {tier.order >= 5 && (
                  <motion.div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-[18px] mix-blend-overlay"
                    style={{
                      backgroundImage:
                        'radial-gradient(circle, rgba(255,255,255,.95) 0 0.8px, transparent 1.4px), radial-gradient(circle, rgba(255,255,255,.7) 0 0.6px, transparent 1.2px)',
                      backgroundSize: '17px 17px, 11px 11px',
                      backgroundPosition: foilPosition,
                      opacity: tier.order === 6 ? 0.55 : 0.3,
                    }}
                  />
                )}
                <motion.div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-[18px] mix-blend-soft-light"
                  style={{ backgroundImage: glare, opacity: 0.35 + tier.foilIntensity * 0.6 }}
                />
              </div>
            </motion.div>

            {/* Back */}
            <div
              className="absolute inset-0"
              style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
            >
              <CardBack />
            </div>
          </motion.div>
        </motion.div>
      </div>

      {doubleSided && faces.length > 1 && (
        <div className="mt-4 flex justify-center">
          <button type="button" className="btn-ghost" onClick={turnOver}>
            <Repeat2 size={16} aria-hidden="true" />
            Turn over to {faces[(faceIndex + 1) % faces.length]?.name}
          </button>
        </div>
      )}
    </div>
  );
}
