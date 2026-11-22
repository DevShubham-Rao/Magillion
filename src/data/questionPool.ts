import type { CardFace, QuestionDefinition, ScryfallCard, ValidationResult } from '../types/mtg';
import {
  describeType,
  faceHasSubtype,
  faceHasType,
  getFaces,
  splitTypeLine,
  stripReminderText,
} from '../lib/cardFaces';
import { seededRandom, shuffle } from '../lib/random';

/**
 * Question engine
 * ===============
 *
 * Every prompt is a `QuestionDefinition` whose `validatorFn` inspects the
 * resolved Scryfall card. Validators look at every face, so the back of a
 * modal double-faced card or the instant half of an adventure counts, and
 * they explain failures in plain terms.
 *
 * Add a prompt by calling one of the factories below (or writing a validator
 * by hand) and appending it to `QUESTION_POOL`. Mark it `experimental` to
 * keep it out of the daily rotation while you test it in practice mode.
 */

export const DAILY_QUESTION_COUNT = 5;

/* ------------------------------------------------------------------------ */
/* Validator building blocks                                                 */
/* ------------------------------------------------------------------------ */

function pass(card: ScryfallCard, face: CardFace, how?: string): ValidationResult {
  const faces = getFaces(card);
  if (faces.length > 1 && face.name !== faces[0]?.name) {
    return { ok: true, matchedFace: face.name, note: how ?? `Counted through ${face.name}.` };
  }
  return { ok: true };
}

function fail(title: string, reason: string): ValidationResult {
  return { ok: false, title, reason };
}

function findFace(card: ScryfallCard, predicate: (face: CardFace) => boolean): CardFace | undefined {
  return getFaces(card).find(predicate);
}

function typeSummary(card: ScryfallCard): string {
  const faces = getFaces(card);
  if (faces.length === 1) return `${card.name} is ${describeType(card.type_line)}`;
  return `${card.name}'s faces are ${faces.map((f) => splitTypeLine(f.typeLine).types || f.typeLine).join(' and ')}`;
}

/** Keyword lines are comma-separated ability lists without a full stop. */
function faceHasKeywordLine(face: CardFace, keyword: string): boolean {
  const target = keyword.toLowerCase();
  return face.oracleText.split('\n').some((line) => {
    const bare = stripReminderText(line).trim();
    if (!bare || bare.endsWith('.')) return false;
    return bare
      .split(/,\s*/)
      .map((part) => part.trim().toLowerCase())
      .some((part) => part === target);
  });
}

/**
 * Activated abilities are written "[Cost]: [Effect]". Some are keywords
 * whose cost lives only in reminder text (Equip, Cycling, Crew, …), and basic
 * land types grant an intrinsic "{T}: Add" ability.
 */
const ACTIVATED_KEYWORDS = [
  'Equip',
  'Cycling',
  'Crew',
  'Ninjutsu',
  'Reconfigure',
  'Fortify',
  'Level up',
  'Outlast',
  'Scavenge',
  'Unearth',
  'Transmute',
  'Transfigure',
  'Embalm',
  'Eternalize',
  'Encore',
  'Reinforce',
  'Bloodrush',
  'Craft',
  'Saddle',
  'Station',
  'Forecast',
];
const ACTIVATED_KEYWORD_RE = new RegExp(`^(?:${ACTIVATED_KEYWORDS.join('|')}|\\w*cycling)\\b`, 'i');
const BASIC_LAND_TYPES = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];

/** Returns the line (or land type) that proves an activated ability, else null. */
export function faceHasActivatedAbility(face: CardFace): string | null {
  const lines = stripReminderText(face.oracleText)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const colonLine = lines.find((line) => line.includes(':'));
  if (colonLine) return colonLine;

  const keywordLine = lines.find((line) =>
    line.split(/[,;]\s*/).some((part) => ACTIVATED_KEYWORD_RE.test(part.trim())),
  );
  if (keywordLine) return keywordLine;

  const landType = BASIC_LAND_TYPES.find((t) => faceHasSubtype(face, t));
  if (landType) return `${landType} (intrinsic {T}: Add mana)`;
  return null;
}

/* ------------------------------------------------------------------------ */
/* Factories                                                                 */
/* ------------------------------------------------------------------------ */

interface BaseSpec {
  id: string;
  prompt: string;
  shortLabel: string;
  hint: string;
  status?: QuestionDefinition['status'];
}

/** "Name an Artifact." — any face whose type line includes `type`. */
export function typeQuestion(spec: BaseSpec & { type: string }): QuestionDefinition {
  return {
    id: spec.id,
    prompt: spec.prompt,
    shortLabel: spec.shortLabel,
    hint: spec.hint,
    category: 'card-type',
    status: spec.status ?? 'active',
    scryfallQueryHint: `t:${spec.type.toLowerCase()}`,
    validatorFn: (card) => {
      const face = findFace(card, (f) => faceHasType(f, spec.type));
      if (face) return pass(card, face, `Counted through ${face.name}, its ${spec.type.toLowerCase()} face.`);
      return fail('The spell fizzles', `${typeSummary(card)}, not ${describeType(spec.type)}.`);
    },
  };
}

/** "Name a Creature with Flying." — the keyword printed on a creature face. */
export function keywordCreatureQuestion(spec: BaseSpec & { keyword: string }): QuestionDefinition {
  const keyword = spec.keyword;
  return {
    id: spec.id,
    prompt: spec.prompt,
    shortLabel: spec.shortLabel,
    hint: spec.hint,
    category: 'keyword',
    status: spec.status ?? 'active',
    scryfallQueryHint: `t:creature keyword:"${keyword.toLowerCase()}"`,
    validatorFn: (card) => {
      const creatureFaces = getFaces(card).filter((f) => faceHasType(f, 'Creature'));
      if (creatureFaces.length === 0) {
        return fail('The spell fizzles', `${typeSummary(card)}. It isn't a creature, so it can't have ${keyword.toLowerCase()} itself.`);
      }
      const face = creatureFaces.find((f) => faceHasKeywordLine(f, keyword));
      if (face) return pass(card, face);
      return fail(
        'Grounded',
        `${card.name} is a creature, but ${keyword.toLowerCase()} isn't printed among its abilities. Keywords granted by other cards don't count.`,
      );
    },
  };
}

/** "Name a creature with power 7 or greater." — numeric stat threshold. */
export function statQuestion(
  spec: BaseSpec & { stat: 'power' | 'toughness' | 'loyalty'; atLeast: number },
): QuestionDefinition {
  return {
    id: spec.id,
    prompt: spec.prompt,
    shortLabel: spec.shortLabel,
    hint: spec.hint,
    category: 'stats',
    status: spec.status ?? 'experimental',
    scryfallQueryHint: `${spec.stat === 'power' ? 'pow' : spec.stat === 'toughness' ? 'tou' : 'loy'}>=${spec.atLeast}`,
    validatorFn: (card) => {
      const face = findFace(card, (f) => {
        const raw = f[spec.stat];
        const value = raw === undefined ? NaN : Number.parseInt(raw, 10);
        return Number.isFinite(value) && value >= spec.atLeast;
      });
      if (face) return pass(card, face);
      const printed = getFaces(card)
        .map((f) => f[spec.stat])
        .filter(Boolean)
        .join(' / ');
      return fail(
        'Not mighty enough',
        printed
          ? `${card.name} has ${spec.stat} ${printed}. The prompt needs ${spec.atLeast} or more.`
          : `${card.name} has no printed ${spec.stat}.`,
      );
    },
  };
}

/** "Name a Dragon." — creature type or other subtype, for lore prompts. */
export function subtypeQuestion(spec: BaseSpec & { subtype: string }): QuestionDefinition {
  return {
    id: spec.id,
    prompt: spec.prompt,
    shortLabel: spec.shortLabel,
    hint: spec.hint,
    category: 'lore',
    status: spec.status ?? 'experimental',
    scryfallQueryHint: `t:${spec.subtype.toLowerCase()}`,
    validatorFn: (card) => {
      const face = findFace(card, (f) => faceHasSubtype(f, spec.subtype));
      if (face) return pass(card, face);
      return fail('Wrong lineage', `${card.name} (${card.type_line}) isn't ${describeType(spec.subtype)}.`);
    },
  };
}

/* ------------------------------------------------------------------------ */
/* The pool                                                                  */
/* ------------------------------------------------------------------------ */

export const QUESTION_POOL: readonly QuestionDefinition[] = [
  typeQuestion({
    id: 'planeswalker',
    type: 'Planeswalker',
    prompt: 'Name a Planeswalker.',
    shortLabel: 'Planeswalker',
    hint: 'Any card with the Planeswalker type on at least one face, including the backs of double-faced cards.',
  }),
  {
    id: 'legendary-creature',
    prompt: 'Name a Legendary Creature.',
    shortLabel: 'Legendary Creature',
    hint: 'Legendary and Creature must appear on the same face. Legendary artifact and enchantment creatures count.',
    category: 'supertype',
    status: 'active',
    scryfallQueryHint: 't:legendary t:creature',
    validatorFn: (card) => {
      const face = findFace(card, (f) => faceHasType(f, 'Legendary') && faceHasType(f, 'Creature'));
      if (face) return pass(card, face);
      const legendary = findFace(card, (f) => faceHasType(f, 'Legendary'));
      if (legendary) {
        return fail('Legend, but not a creature', `${typeSummary(card)}. It's legendary, but no face is a creature.`);
      }
      return fail('No legend here', `${typeSummary(card)}, not a legendary creature.`);
    },
  },
  {
    id: 'commander-legal',
    prompt: 'Name a Commander-legal card.',
    shortLabel: 'Commander-legal card',
    hint: 'Anything you could put in a 100-card Commander deck. Banned and Un-cards are turned away.',
    category: 'format',
    status: 'active',
    scryfallQueryHint: 'f:commander',
    validatorFn: () => ({ ok: true }),
  },
  typeQuestion({
    id: 'enchantment',
    type: 'Enchantment',
    prompt: 'Name an Enchantment.',
    shortLabel: 'Enchantment',
    hint: 'Auras, Sagas, Classes, Rooms, Cases and enchantment creatures all qualify.',
  }),
  typeQuestion({
    id: 'artifact',
    type: 'Artifact',
    prompt: 'Name an Artifact.',
    shortLabel: 'Artifact',
    hint: 'Equipment, Vehicles, artifact creatures and artifact lands all count.',
  }),
  typeQuestion({
    id: 'instant',
    type: 'Instant',
    prompt: 'Name an Instant.',
    shortLabel: 'Instant',
    hint: 'Split cards and adventures count when one half is an instant.',
  }),
  typeQuestion({
    id: 'sorcery',
    type: 'Sorcery',
    prompt: 'Name a Sorcery.',
    shortLabel: 'Sorcery',
    hint: 'Split cards, adventures and the spell side of modal double-faced cards count.',
  }),
  typeQuestion({
    id: 'land',
    type: 'Land',
    prompt: 'Name a Land.',
    shortLabel: 'Land',
    hint: 'Basic lands are legal answers, though they score as the most-played cards in the game.',
  }),
  keywordCreatureQuestion({
    id: 'flying-creature',
    keyword: 'Flying',
    prompt: 'Name a Creature with Flying.',
    shortLabel: 'Creature with Flying',
    hint: 'Flying must be printed on the creature itself. Abilities that grant flying later don’t count.',
  }),
  {
    id: 'activated-ability',
    prompt: 'Name a card with an activated ability.',
    shortLabel: 'Activated ability',
    hint: 'Look for “cost: effect”, like {T}: Add {G}. Keyword costs such as Equip and Cycling count; reminder text alone doesn’t.',
    category: 'mechanic',
    status: 'active',
    scryfallQueryHint: 'o:":"',
    validatorFn: (card) => {
      for (const face of getFaces(card)) {
        if (faceHasActivatedAbility(face)) return pass(card, face);
      }
      return fail(
        'No cost, no effect',
        `${card.name} has no “cost: effect” ability outside its reminder text, so it has nothing to activate.`,
      );
    },
  },

  /* Experimental prompts: playable in practice mode once enabled. */
  statQuestion({
    id: 'power-seven',
    stat: 'power',
    atLeast: 7,
    prompt: 'Name a creature with power 7 or greater.',
    shortLabel: 'Power 7+',
    hint: 'Printed power only. * counts as 0.',
  }),
  subtypeQuestion({
    id: 'dragon',
    subtype: 'Dragon',
    prompt: 'Name a Dragon.',
    shortLabel: 'Dragon',
    hint: 'Any card with the Dragon subtype, including Dragon planeswalkers and Sagas that become Dragons.',
  }),
  subtypeQuestion({
    id: 'phyrexian',
    subtype: 'Phyrexian',
    prompt: 'Name a Phyrexian.',
    shortLabel: 'Phyrexian',
    hint: 'The Phyrexian creature type on any face.',
  }),
];

export const ACTIVE_QUESTIONS = QUESTION_POOL.filter((q) => q.status === 'active');

const BY_ID = new Map(QUESTION_POOL.map((q) => [q.id, q]));

export function questionById(id: string): QuestionDefinition | undefined {
  return BY_ID.get(id);
}

/* ------------------------------------------------------------------------ */
/* Selection                                                                 */
/* ------------------------------------------------------------------------ */

/** The same five prompts, in the same order, for everyone on a UTC day. */
export function selectDailyQuestions(dateKey: string, count = DAILY_QUESTION_COUNT): QuestionDefinition[] {
  return shuffle(ACTIVE_QUESTIONS, seededRandom(`magillion:daily:${dateKey}`)).slice(0, count);
}

/** A random practice prompt that avoids the most recent ones. */
export function drawPracticeQuestion(
  recentIds: readonly string[] = [],
  rng: () => number = Math.random,
  pool: readonly QuestionDefinition[] = ACTIVE_QUESTIONS,
): QuestionDefinition {
  const avoid = new Set(recentIds.slice(-Math.min(4, pool.length - 1)));
  const candidates = pool.filter((q) => !avoid.has(q.id));
  const source = candidates.length > 0 ? candidates : pool;
  return source[Math.floor(rng() * source.length)] as QuestionDefinition;
}
