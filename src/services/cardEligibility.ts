import type { ScryfallCard } from '../types/mtg';
import { utcDateKey } from '../lib/dates';
import { splitTypeLine } from '../lib/cardFaces';

/**
 * Stage one of validation: can this card go in a Commander deck at all?
 * Rejections here never cost the player their turn.
 */

export type EligibilityVerdict =
  | { ok: true }
  | { ok: false; kind: 'banned' | 'not_legal' | 'not_a_deck_card'; title: string; reason: string };

const NON_TRADITIONAL_TYPES = /\b(Conspiracy|Scheme|Plane|Phenomenon|Vanguard|Dungeon|Emblem)\b/;

function isMeldResult(card: ScryfallCard): boolean {
  return (
    card.layout === 'meld' &&
    Boolean(card.all_parts?.some((p) => p.component === 'meld_result' && p.name === card.name))
  );
}

function meldHalves(card: ScryfallCard): string {
  const parts = card.all_parts?.filter((p) => p.component === 'meld_part').map((p) => p.name) ?? [];
  return parts.length >= 2 ? `${parts[0]} and ${parts[1]}` : 'its two halves';
}

export function checkCommanderEligibility(card: ScryfallCard, today: string = utcDateKey()): EligibilityVerdict {
  const name = card.name;
  const { types } = splitTypeLine(card.type_line);

  if (/\bStickers\b/.test(types)) {
    return {
      ok: false,
      kind: 'not_a_deck_card',
      title: 'Not a card for your library',
      reason: `${name} is a sticker sheet. It sits beside the game and never goes in a 100-card deck.`,
    };
  }

  if (isMeldResult(card)) {
    return {
      ok: false,
      kind: 'not_a_deck_card',
      title: 'Born only of melding',
      reason: `${name} only exists once ${meldHalves(card)} meld. Name one of the halves instead.`,
    };
  }

  const status = card.legalities.commander ?? 'not_legal';
  if (status === 'legal') return { ok: true };

  if (status === 'banned') {
    return {
      ok: false,
      kind: 'banned',
      title: 'Sealed away by the Rules Committee',
      reason: `${name} is banned in Commander. Name another card; this attempt doesn't count.`,
    };
  }

  if (card.border_color === 'silver' || card.security_stamp === 'acorn' || card.set_type === 'funny') {
    return {
      ok: false,
      kind: 'not_legal',
      title: 'A jest from the Un-planes',
      reason: `${name} is an Un-card (silver-bordered or acorn-stamped), so it isn't legal in Commander.`,
    };
  }

  if (card.released_at > today) {
    return {
      ok: false,
      kind: 'not_legal',
      title: 'Not yet unleashed',
      reason: `${name} is a preview card. It becomes legal when its set releases on ${card.released_at}.`,
    };
  }

  if (!card.games.includes('paper') && card.digital) {
    return {
      ok: false,
      kind: 'not_legal',
      title: 'Bound to the digital planes',
      reason: `${name} exists only on MTG Arena or Magic Online and isn't part of the paper Commander pool.`,
    };
  }

  if (NON_TRADITIONAL_TYPES.test(types)) {
    return {
      ok: false,
      kind: 'not_legal',
      title: 'Not a constructed card',
      reason: `${name} is a ${types} card from a casual variant and can't be put in a Commander deck.`,
    };
  }

  return {
    ok: false,
    kind: 'not_legal',
    title: 'Outside the Commander pool',
    reason: `${name} isn't legal in Commander. Name another card; this attempt doesn't count.`,
  };
}
