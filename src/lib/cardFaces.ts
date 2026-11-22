import type { CardFace, ImageUris, ScryfallCard } from '../types/mtg';

/**
 * Helpers that hide the differences between Scryfall's card layouts.
 *
 * Split, flip and adventure cards keep one image at the top level and list
 * their halves in `card_faces`. Transform and modal double-faced cards give
 * each face its own image. Everything else is single-faced.
 */

export function getFaces(card: ScryfallCard): CardFace[] {
  if (card.card_faces && card.card_faces.length > 0) {
    return card.card_faces.map((face) => ({
      name: face.name,
      manaCost: face.mana_cost ?? '',
      typeLine: face.type_line ?? '',
      oracleText: face.oracle_text ?? '',
      flavorText: face.flavor_text,
      power: face.power,
      toughness: face.toughness,
      loyalty: face.loyalty,
      defense: face.defense,
      artist: face.artist ?? card.artist,
      imageUris: face.image_uris ?? card.image_uris,
    }));
  }
  return [
    {
      name: card.name,
      manaCost: card.mana_cost ?? '',
      typeLine: card.type_line,
      oracleText: card.oracle_text ?? '',
      flavorText: card.flavor_text,
      power: card.power,
      toughness: card.toughness,
      loyalty: card.loyalty,
      defense: card.defense,
      artist: card.artist,
      imageUris: card.image_uris,
    },
  ];
}

/** True when each face is printed on its own side of the card. */
export function isDoubleSided(card: ScryfallCard): boolean {
  return Boolean(card.card_faces?.length && card.card_faces.every((f) => f.image_uris));
}

export function getOracleId(card: ScryfallCard): string {
  return card.oracle_id ?? card.card_faces?.[0]?.oracle_id ?? card.id;
}

/** Splits "Legendary Creature — Elf Druid" into its type and subtype halves. */
export function splitTypeLine(typeLine: string): { types: string; subtypes: string } {
  const [types = '', subtypes = ''] = typeLine.split(/\s+—\s+/);
  return { types, subtypes };
}

export function faceHasType(face: CardFace, type: string): boolean {
  return new RegExp(`\\b${type}\\b`, 'i').test(splitTypeLine(face.typeLine).types);
}

export function faceHasSubtype(face: CardFace, subtype: string): boolean {
  return new RegExp(`\\b${subtype}\\b`, 'i').test(splitTypeLine(face.typeLine).subtypes);
}

/** Removes parenthesised reminder text. */
export function stripReminderText(text: string): string {
  return text.replace(/\([^)]*\)/g, '');
}

/** Lowercase, accent-free, alphanumeric-only form used for name matching. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** The full name plus each face's name, so either half of a card matches. */
export function nameVariants(card: ScryfallCard): string[] {
  const names = [card.name, ...getFaces(card).map((f) => f.name)];
  return Array.from(new Set(names));
}

export function getImageUris(card: ScryfallCard, faceIndex = 0): ImageUris | undefined {
  if (card.image_uris) return card.image_uris;
  return card.card_faces?.[faceIndex]?.image_uris ?? card.card_faces?.[0]?.image_uris;
}

/** Front-face cost for double-sided cards, the joined cost for split cards. */
export function displayManaCost(card: ScryfallCard): string {
  if (card.mana_cost) return card.mana_cost;
  return getFaces(card)[0]?.manaCost ?? '';
}

export function displayTypeLine(card: ScryfallCard): string {
  if (isDoubleSided(card)) return getFaces(card)[0]?.typeLine ?? card.type_line;
  return card.type_line;
}

/** Article-correct type phrase for explanations: "an Artifact", "a Creature". */
export function describeType(typeLine: string): string {
  const { types } = splitTypeLine(typeLine);
  const phrase = types || typeLine;
  return /^[aeiou]/i.test(phrase) ? `an ${phrase}` : `a ${phrase}`;
}
