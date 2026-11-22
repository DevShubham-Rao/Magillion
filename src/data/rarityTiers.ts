import type { RarityTier, RarityTierId } from '../types/mtg';

/**
 * The six obscurity tiers. Point ranges are inclusive and contiguous across
 * 0–1,000; visuals scale with `order` so a rarer answer is always louder.
 */
export const RARITY_TIERS: readonly RarityTier[] = [
  {
    id: 'common',
    order: 1,
    name: 'Common Staple',
    title: 'Common Staple',
    tagline: 'Ubiquitous format mainstays.',
    minPoints: 0,
    maxPoints: 150,
    color: '#7A828E',
    stops: ['#B4BBC6', '#7A828E', '#3E434B'],
    frameGradient:
      'linear-gradient(145deg, #5A616B 0%, #9BA3AE 22%, #4A5058 45%, #7A828E 68%, #3A3F47 100%)',
    glow: '0 0 0 1px rgba(122,130,142,.35), 0 24px 60px -24px rgba(0,0,0,.9)',
    foilIntensity: 0.06,
    particleCount: 0,
    emoji: '⬛',
  },
  {
    id: 'uncommon',
    order: 2,
    name: 'Uncommon Pick',
    title: 'Uncommon Pick',
    tagline: 'Recognizable roleplayers.',
    minPoints: 151,
    maxPoints: 350,
    color: '#A3B8CC',
    stops: ['#E6EEF6', '#A3B8CC', '#55687A'],
    frameGradient:
      'linear-gradient(145deg, #6F8296 0%, #DCE6EF 20%, #8EA3B7 42%, #C3D2DF 64%, #56697C 100%)',
    glow: '0 0 28px -6px rgba(163,184,204,.45), 0 24px 60px -24px rgba(0,0,0,.9)',
    foilIntensity: 0.14,
    particleCount: 8,
    emoji: '⬜',
  },
  {
    id: 'rare',
    order: 3,
    name: 'Rare Find',
    title: 'Rare Find',
    tagline: 'Deep-cut deckbuilding tech.',
    minPoints: 351,
    maxPoints: 600,
    color: '#E5B84B',
    stops: ['#FBE7A6', '#E5B84B', '#8C6420'],
    frameGradient:
      'linear-gradient(145deg, #8C6420 0%, #F7DC8E 20%, #C9962F 42%, #F2CF6E 62%, #7A5419 100%)',
    glow: '0 0 40px -6px rgba(229,184,75,.5), 0 24px 60px -24px rgba(0,0,0,.9)',
    foilIntensity: 0.24,
    particleCount: 16,
    emoji: '🟨',
  },
  {
    id: 'mythic',
    order: 4,
    name: 'Mythic Relic',
    title: 'Mythic Relic',
    tagline: 'Forgotten legends of the multiverse.',
    minPoints: 601,
    maxPoints: 850,
    color: '#E85D2A',
    stops: ['#FFC08A', '#E85D2A', '#7E1E12'],
    frameGradient:
      'linear-gradient(145deg, #7E1E12 0%, #FF9E5E 20%, #D4441E 42%, #F7834A 62%, #6B160D 100%)',
    glow: '0 0 54px -4px rgba(232,93,42,.55), 0 24px 60px -24px rgba(0,0,0,.9)',
    foilIntensity: 0.34,
    particleCount: 26,
    emoji: '🟧',
  },
  {
    id: 'timeshifted',
    order: 5,
    name: 'Timeshifted Anomaly',
    title: 'Timeshifted Anomaly',
    tagline: 'Bizarre edge-cases few planeswalkers recall.',
    minPoints: 851,
    maxPoints: 975,
    color: '#A855F7',
    stops: ['#E9C9FF', '#A855F7', '#4C1584'],
    frameGradient:
      'linear-gradient(145deg, #4C1584 0%, #D8A6FF 18%, #8B3FE0 40%, #E066C8 62%, #3B0F6B 100%)',
    glow: '0 0 64px -2px rgba(168,85,247,.6), 0 24px 60px -24px rgba(0,0,0,.9)',
    foilIntensity: 0.46,
    particleCount: 38,
    emoji: '🟪',
  },
  {
    id: 'serialized',
    order: 6,
    name: 'Serialized 1-of-1',
    title: 'Lost to the Blind Eternities',
    tagline: 'True arcane mastery.',
    minPoints: 976,
    maxPoints: 1000,
    color: '#F2D5FF',
    stops: ['#9FF5E8', '#F6A8FF', '#FFE38A'],
    frameGradient:
      'conic-gradient(from 210deg, #FFE38A, #9FF5E8, #8AB8FF, #F6A8FF, #FF9FB2, #FFE38A)',
    glow: '0 0 80px 0 rgba(246,168,255,.55), 0 0 140px -10px rgba(159,245,232,.45), 0 24px 60px -24px rgba(0,0,0,.9)',
    foilIntensity: 0.7,
    particleCount: 56,
    emoji: '🌈',
  },
];

const BY_ID = new Map(RARITY_TIERS.map((t) => [t.id, t]));

export function tierById(id: RarityTierId): RarityTier {
  return BY_ID.get(id) ?? (RARITY_TIERS[0] as RarityTier);
}

export function tierForPoints(points: number): RarityTier {
  const clamped = Math.max(0, Math.min(1000, Math.round(points)));
  return (
    RARITY_TIERS.find((t) => clamped >= t.minPoints && clamped <= t.maxPoints) ??
    (RARITY_TIERS[0] as RarityTier)
  );
}

/** Emoji for the share grid; a passed round has no tier. */
export const PASS_EMOJI = '✖️';
