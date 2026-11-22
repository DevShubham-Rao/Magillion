import type { CardFace, QuestionCategory, QuestionDefinition, ScryfallCard, ValidationResult } from '../types/mtg';
import {
  describeType,
  faceHasSubtype,
  faceHasType,
  getFaces,
  normalizeName,
  splitTypeLine,
  stripReminderText,
} from '../lib/cardFaces';

/**
 * Building blocks for prompts. Every prompt is a `QuestionDefinition` whose
 * `validatorFn` inspects the resolved Scryfall card. Validators look at every
 * face, so the back of a modal double-faced card or the instant half of an
 * adventure counts, and they explain failures in plain terms.
 *
 * `scryfallQueryHint` must be valid Scryfall syntax and match every card the
 * validator accepts (it may match more): the answer box completes partial
 * names inside it, and the "rarest answers" link searches it.
 */

/* ------------------------------------------------------------------------ */
/* Shared helpers                                                            */
/* ------------------------------------------------------------------------ */

export function pass(card: ScryfallCard, face: CardFace, how?: string): ValidationResult {
  const faces = getFaces(card);
  if (faces.length > 1 && face.name !== faces[0]?.name) {
    return { ok: true, matchedFace: face.name, note: how ?? `Counted through ${face.name}.` };
  }
  return { ok: true };
}

export function fail(title: string, reason: string): ValidationResult {
  return { ok: false, title, reason };
}

export function findFace(card: ScryfallCard, predicate: (face: CardFace) => boolean): CardFace | undefined {
  return getFaces(card).find(predicate);
}

export function typeSummary(card: ScryfallCard): string {
  const faces = getFaces(card);
  if (faces.length === 1) return `${card.name} is ${describeType(card.type_line)}`;
  return `${card.name}'s faces are ${faces.map((f) => splitTypeLine(f.typeLine).types || f.typeLine).join(' and ')}`;
}

const COLOR_NAMES: Record<string, string> = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };
export type ColorLetter = 'W' | 'U' | 'B' | 'R' | 'G';

export function colorName(letter: string): string {
  return COLOR_NAMES[letter] ?? letter;
}

/** Every color on any face, in WUBRG order. */
export function cardColors(card: ScryfallCard): string[] {
  const all = new Set(card.colors ?? getFaces(card).flatMap((f) => f.colors));
  return ['W', 'U', 'B', 'R', 'G'].filter((c) => all.has(c));
}

function describeColors(colors: string[]): string {
  if (colors.length === 0) return 'colorless';
  return colors.map(colorName).join(' and ');
}

/** Rules text without reminder text, one face at a time. */
function rulesText(face: CardFace): string {
  return stripReminderText(face.oracleText);
}

function isLandFace(face: CardFace | undefined): boolean {
  return Boolean(face && faceHasType(face, 'Land'));
}

/* ------------------------------------------------------------------------ */
/* Keywords                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * True when `keyword` is printed as an ability on this face: on a keyword
 * line ("Flying, haste", "Kicker {1}{G}", "Protection from red") or as a
 * keyword or ability word followed by a dash ("Ward—Pay 2 life.",
 * "Landfall — Whenever…"). Text that only mentions the word ("Creatures
 * with flying can't block it") doesn't count, and neither does reminder text.
 */
export function faceHasKeyword(face: CardFace, keyword: string | RegExp): boolean {
  const matchesStart = (text: string) => {
    if (typeof keyword !== 'string') return keyword.test(text);
    const target = keyword.toLowerCase();
    return text === target || text.startsWith(`${target} `) || text.startsWith(`${target}—`);
  };
  return face.oracleText.split('\n').some((line) => {
    const bare = stripReminderText(line).trim().toLowerCase().replace(/\s+—/g, '—');
    if (!bare) return false;
    if (bare.endsWith('.') || bare.includes(':')) {
      // A sentence only counts when it opens with "Keyword—".
      const dash = bare.indexOf('—');
      return dash > 0 && matchesStart(bare.slice(0, dash).trim());
    }
    return bare.split(/,\s*|;\s*/).some((part) => matchesStart(part.trim()));
  });
}

interface BaseSpec {
  id: string;
  prompt: string;
  shortLabel: string;
  hint: string;
  status?: QuestionDefinition['status'];
}

function define(
  spec: BaseSpec,
  category: QuestionCategory,
  scryfallQueryHint: string,
  validatorFn: QuestionDefinition['validatorFn'],
): QuestionDefinition {
  return {
    id: spec.id,
    prompt: spec.prompt,
    shortLabel: spec.shortLabel,
    hint: spec.hint,
    category,
    status: spec.status ?? 'active',
    scryfallQueryHint,
    validatorFn,
  };
}

/* ------------------------------------------------------------------------ */
/* Factories                                                                 */
/* ------------------------------------------------------------------------ */

/** "Name an Artifact." Any face whose type line includes `type`. */
export function typeQuestion(spec: BaseSpec & { type: string }): QuestionDefinition {
  return define(spec, 'card-type', `t:${spec.type.toLowerCase()}`, (card) => {
    const face = findFace(card, (f) => faceHasType(f, spec.type));
    if (face) return pass(card, face, `Counted through ${face.name}, its ${spec.type.toLowerCase()} face.`);
    return fail('The spell fizzles', `${typeSummary(card)}, not ${describeType(spec.type)}.`);
  });
}

/**
 * "Name an Artifact Creature." One face must carry every type in `all` and
 * none in `none`. Types include supertypes (Legendary, Snow, World, Basic).
 */
export function faceTypesQuestion(
  spec: BaseSpec & { all: string[]; none?: string[]; category?: QuestionCategory; query: string },
): QuestionDefinition {
  return define(spec, spec.category ?? 'supertype', spec.query, (card) => {
    const face = findFace(
      card,
      (f) => spec.all.every((t) => faceHasType(f, t)) && !(spec.none ?? []).some((t) => faceHasType(f, t)),
    );
    if (face) return pass(card, face);
    const blocked = spec.none?.find((t) => getFaces(card).some((f) => spec.all.every((a) => faceHasType(f, a)) && faceHasType(f, t)));
    if (blocked) return fail('Close, but not quite', `${typeSummary(card)}. The prompt rules out ${blocked.toLowerCase()} cards.`);
    return fail('The spell fizzles', `${typeSummary(card)}. No single face is ${describeType(spec.all.join(' '))}.`);
  });
}

/** "Name a Creature with Flying." The keyword printed on a creature face. */
export function keywordCreatureQuestion(spec: BaseSpec & { keyword: string }): QuestionDefinition {
  const keyword = spec.keyword;
  return define(spec, 'keyword', `t:creature keyword:"${keyword.toLowerCase()}"`, (card) => {
    const creatureFaces = getFaces(card).filter((f) => faceHasType(f, 'Creature'));
    if (creatureFaces.length === 0) {
      return fail('The spell fizzles', `${typeSummary(card)}. It isn't a creature, so it can't have ${keyword.toLowerCase()} itself.`);
    }
    const face = creatureFaces.find((f) => faceHasKeyword(f, keyword));
    if (face) return pass(card, face);
    return fail(
      'Missing the keyword',
      `${card.name} is a creature, but ${keyword.toLowerCase()} isn't printed among its abilities. Keywords granted by other cards don't count.`,
    );
  });
}

/**
 * "Name a card with Flashback." The keyword or ability word printed on any
 * face. `match` widens it, e.g. every kind of cycling.
 */
export function keywordQuestion(
  spec: BaseSpec & { keyword: string; match?: RegExp; query?: string; category?: QuestionCategory },
): QuestionDefinition {
  const label = spec.keyword;
  return define(spec, spec.category ?? 'keyword', spec.query ?? `keyword:"${label.toLowerCase()}"`, (card) => {
    const face = findFace(card, (f) => faceHasKeyword(f, spec.match ?? label));
    if (face) return pass(card, face);
    return fail('Missing the keyword', `${card.name} doesn't have ${label} printed on it. Reminder text and granted abilities don't count.`);
  });
}

/** "Name a creature with power 7 or greater." A printed stat on any face. */
export function statQuestion(
  spec: BaseSpec & {
    stat: 'power' | 'toughness' | 'loyalty';
    atLeast?: number;
    exactly?: number;
    alsoToughness?: number;
  },
): QuestionDefinition {
  const short = spec.stat === 'power' ? 'pow' : spec.stat === 'toughness' ? 'tou' : 'loy';
  const query =
    spec.exactly !== undefined
      ? `${short}=${spec.exactly}${spec.alsoToughness !== undefined ? ` tou=${spec.alsoToughness}` : ''}`
      : `${short}>=${spec.atLeast ?? 0}`;
  const wanted =
    spec.exactly !== undefined
      ? spec.alsoToughness !== undefined
        ? `${spec.exactly}/${spec.alsoToughness}`
        : `exactly ${spec.exactly}`
      : `${spec.atLeast} or more`;
  return define(spec, 'stats', query, (card) => {
    const face = findFace(card, (f) => {
      const raw = f[spec.stat];
      if (raw === undefined || !/^\d+$/.test(raw.trim())) return false;
      const value = Number.parseInt(raw, 10);
      if (spec.exactly !== undefined) {
        if (value !== spec.exactly) return false;
        if (spec.alsoToughness !== undefined) return f.toughness?.trim() === String(spec.alsoToughness);
        return true;
      }
      return value >= (spec.atLeast ?? 0);
    });
    if (face) return pass(card, face);
    const printed = getFaces(card)
      .map((f) => (spec.alsoToughness !== undefined && f.power ? `${f.power}/${f.toughness}` : f[spec.stat]))
      .filter(Boolean)
      .join(' and ');
    return fail(
      'Wrong numbers',
      printed
        ? `${card.name} has ${spec.alsoToughness !== undefined ? 'power and toughness' : spec.stat} ${printed}. The prompt needs ${wanted}.`
        : `${card.name} has no printed ${spec.stat}.`,
    );
  });
}

/**
 * "Name a Dragon." A subtype on any face. Creature types also accept
 * Changelings, which have every creature type.
 */
export function subtypeQuestion(
  spec: BaseSpec & { subtype: string; creatureType?: boolean; category?: QuestionCategory },
): QuestionDefinition {
  const subtype = spec.subtype;
  const term = subtype.includes(' ') || subtype.includes("'") ? `"${subtype.toLowerCase()}"` : subtype.toLowerCase();
  const query = spec.creatureType ? `(t:${term} or keyword:changeling)` : `t:${term}`;
  return define(spec, spec.category ?? 'lore', query, (card) => {
    const face = findFace(card, (f) => faceHasSubtype(f, subtype));
    if (face) return pass(card, face);
    if (spec.creatureType) {
      const changeling = findFace(
        card,
        (f) => (faceHasType(f, 'Creature') || faceHasType(f, 'Kindred') || faceHasType(f, 'Tribal')) && faceHasKeyword(f, 'Changeling'),
      );
      if (changeling) return { ok: true, note: 'Changeling has every creature type, so it counts.' };
    }
    return fail('Wrong lineage', `${card.name} (${card.type_line}) isn't ${describeType(subtype)}.`);
  });
}

/** "Name a card with “extra turn” in its rules text." Reminder text doesn't count. */
export function textQuestion(
  spec: BaseSpec & { pattern: RegExp; query: string; category?: QuestionCategory; failTitle?: string; failReason?: string },
): QuestionDefinition {
  return define(spec, spec.category ?? 'text', spec.query, (card) => {
    const face = findFace(card, (f) => spec.pattern.test(rulesText(f)));
    if (face) return pass(card, face);
    return fail(spec.failTitle ?? 'Not in the text', `${card.name} ${spec.failReason ?? "doesn't have that in its rules text. Reminder text doesn't count."}`);
  });
}

/** "Name a mono-red card." Exact color sets, read across every face. */
export function colorsQuestion(
  spec: BaseSpec & { accept: (colors: string[]) => boolean; query: string; wanted: string; nonland?: boolean },
): QuestionDefinition {
  return define(spec, 'color', spec.query, (card) => {
    if (spec.nonland && isLandFace(getFaces(card)[0])) {
      return fail('Lands are left out', `${card.name} is a land, and this prompt asks for a nonland card.`);
    }
    const colors = cardColors(card);
    if (spec.accept(colors)) return { ok: true };
    return fail('Wrong colors', `${card.name} is ${describeColors(colors)}. The prompt asks for ${spec.wanted}.`);
  });
}

/** "Name a blue Instant." One face has the type and the color. */
export function colorTypeQuestion(spec: BaseSpec & { color: ColorLetter; type: string }): QuestionDefinition {
  const color = colorName(spec.color);
  return define(spec, 'color', `t:${spec.type.toLowerCase()} c:${spec.color.toLowerCase()}`, (card) => {
    const typed = getFaces(card).filter((f) => faceHasType(f, spec.type));
    if (typed.length === 0) return fail('The spell fizzles', `${typeSummary(card)}, not ${describeType(spec.type)}.`);
    const face = typed.find((f) => f.colors.includes(spec.color));
    if (face) return pass(card, face);
    return fail('Wrong color', `${card.name} is ${describeColors(typed[0]?.colors ?? [])}, not ${color}.`);
  });
}

/** Anything checked against the whole card: mana value, layout, legality, name. */
export function cardQuestion(
  spec: BaseSpec & {
    category: QuestionCategory;
    query: string;
    accept: (card: ScryfallCard) => boolean | CardFace;
    failTitle: string;
    failReason: (card: ScryfallCard) => string;
  },
): QuestionDefinition {
  return define(spec, spec.category, spec.query, (card) => {
    const result = spec.accept(card);
    if (result === true) return { ok: true };
    if (result) return pass(card, result);
    return fail(spec.failTitle, spec.failReason(card));
  });
}

/* ------------------------------------------------------------------------ */
/* Activated abilities                                                       */
/* ------------------------------------------------------------------------ */

/**
 * Activated abilities are written "[Cost]: [Effect]". Some are keywords
 * whose cost lives only in reminder text (Equip, Cycling, Crew, …), and basic
 * land types grant an intrinsic "{T}: Add" ability.
 */
export const ACTIVATED_KEYWORDS = [
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

  const keywordLine = lines.find((line) => line.split(/[,;]\s*/).some((part) => ACTIVATED_KEYWORD_RE.test(part.trim())));
  if (keywordLine) return keywordLine;

  const landType = BASIC_LAND_TYPES.find((t) => faceHasSubtype(face, t));
  if (landType) return `${landType} (intrinsic {T}: Add mana)`;
  return null;
}

/* ------------------------------------------------------------------------ */
/* Names                                                                     */
/* ------------------------------------------------------------------------ */

/** The full name and each face's name. */
export function cardNames(card: ScryfallCard): string[] {
  return Array.from(new Set([card.name, ...getFaces(card).map((f) => f.name)]));
}

export function startsWithLetter(card: ScryfallCard, letter: string): boolean {
  const target = letter.toLowerCase();
  return cardNames(card).some((name) => normalizeName(name).startsWith(target));
}
