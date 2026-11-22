import type { LegalityStatus, ScryfallCard } from '../types/mtg';
import { utcDateKey } from '../lib/dates';
import { splitTypeLine } from '../lib/cardFaces';

/**
 * Stage one of validation: is this a real paper Magic card at all?
 *
 * The pool is every card that has ever been part of a sanctioned format:
 * legal, restricted or banned in Vintage or Commander. That lets in Mana
 * Crypt, Black Lotus and the rest of the banned lists, and keeps out
 * Un-cards, digital-only Alchemy cards, tokens, casual-variant cards and
 * meld results. A few black-bordered Unfinity cards are tournament legal,
 * and they count.
 */

export type EligibilityVerdict =
  | { ok: true }
  | { ok: false; kind: 'not_legal' | 'not_a_deck_card'; title: string; reason: string };

/** Scryfall search clause for the same pool, used when completing names. */
export const CARD_POOL_QUERY = '(f:vintage or banned:vintage or f:commander or banned:commander)';

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

const inPool = (status: LegalityStatus | undefined) => status !== undefined && status !== 'not_legal';

/** True for cards that are, or once were, part of a sanctioned format. */
export function isTournamentCard(card: ScryfallCard): boolean {
  return inPool(card.legalities.vintage) || inPool(card.legalities.commander);
}

export function checkCardEligibility(card: ScryfallCard, today: string = utcDateKey()): EligibilityVerdict {
  const name = card.name;
  const { types } = splitTypeLine(card.type_line);

  if (/\bStickers\b/.test(types)) {
    return {
      ok: false,
      kind: 'not_a_deck_card',
      title: 'Not a card for your library',
      reason: `${name} is a sticker sheet. It sits beside the game and never goes in a deck.`,
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

  // Conspiracies are listed as banned in Vintage, so check this first.
  if (NON_TRADITIONAL_TYPES.test(types)) {
    return {
      ok: false,
      kind: 'not_a_deck_card',
      title: 'Not a constructed card',
      reason: `${name} is a ${types} card from a casual variant. It never goes in a deck.`,
    };
  }

  // Before the preview check: Scryfall may hand back an old card's newest,
  // not-yet-released printing (a basic land in next season's set).
  if (isTournamentCard(card)) return { ok: true };

  if (card.released_at > today) {
    return {
      ok: false,
      kind: 'not_legal',
      title: 'Not yet unleashed',
      reason: `${name} is a preview card. It counts once its set releases on ${card.released_at}.`,
    };
  }

  if (card.border_color === 'silver' || card.security_stamp === 'acorn' || card.set_type === 'funny') {
    return {
      ok: false,
      kind: 'not_legal',
      title: 'A jest from the Un-planes',
      reason: `${name} is an Un-card (silver-bordered or acorn-stamped). It isn't legal in any format, so it doesn't count.`,
    };
  }

  if (!card.games.includes('paper') || card.digital) {
    return {
      ok: false,
      kind: 'not_legal',
      title: 'Bound to the digital planes',
      reason: `${name} exists only on MTG Arena or Magic Online. Only cards printed on paper count.`,
    };
  }

  return {
    ok: false,
    kind: 'not_legal',
    title: 'Not a tournament card',
    reason: `${name} has never been legal in any format, so it doesn't count.`,
  };
}
