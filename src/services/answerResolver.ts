import type { QuestionDefinition, ScryfallCard, ValidationPass } from '../types/mtg';
import { CARD_POOL_QUERY, checkCardEligibility } from './cardEligibility';
import { buildContainsQuery, buildExactNamesQuery, sanitizeInput, type ScryfallService } from './scryfallService';
import { getOracleId, nameVariants, normalizeName, splitTypeLine } from '../lib/cardFaces';
import { nameWords } from '../lib/fuzzy';

/**
 * Turns whatever the player typed into one card, without a suggestion list.
 *
 *  1. Exact name (either face): that card, fits or not.
 *  2. Partial name: among cards in this prompt's pool whose name starts with
 *     (or contains) what was typed, take the most-played one (across
 *     Commander and 60-card play when the context supplies that ranking). A vague answer
 *     always gets the lowest score its letters could earn.
 *  3. No fitting partial match: find the card the player most likely meant
 *     and explain why it doesn't fit.
 *  4. Nothing contains those letters: correct typos against Scryfall's full
 *     name catalog ("the wizzer" → The Whizzer, Classic Speedster).
 */

export type MatchKind = 'exact' | 'completed' | 'contains' | 'corrected';

const KIND_ORDER: Record<MatchKind, number> = { exact: 0, completed: 1, contains: 2, corrected: 3 };

export type RejectionReason = 'legality' | 'criteria' | 'duplicate';

export type Verdict =
  | { fits: true; validation: ValidationPass }
  | { fits: false; kind: RejectionReason; title: string; reason: string; promptOk: boolean };

export interface Candidate {
  card: ScryfallCard;
  kind: MatchKind;
  /** Edit cost for corrected names; 0 otherwise. */
  cost: number;
}

export type Resolution =
  | {
      status: 'accepted';
      card: ScryfallCard;
      kind: MatchKind;
      typed: string;
      validation: ValidationPass;
      /** Explains a completion or correction, e.g. "Finished “urza” as …". */
      note?: string;
    }
  | {
      status: 'rejected';
      card: ScryfallCard;
      kind: MatchKind;
      typed: string;
      reason: RejectionReason;
      title: string;
      message: string;
      /** Duplicates are a reminder, not a wrong answer. */
      costsAttempt: boolean;
      /** Set when the typed text was completed or corrected into this card. */
      readAs?: string;
    }
  | { status: 'not_found'; typed: string; message: string };

export interface ResolveContext {
  question: QuestionDefinition;
  usedOracleIds: ReadonlySet<string>;
  today?: string;
  /**
   * Lower = more played. Decides which of several matches a partial name
   * becomes. Defaults to EDHREC rank (`popularityKey`).
   */
  popularityKey?: (card: ScryfallCard) => number;
}

/** The services the resolver needs; `ScryfallService` provides all of them. */
export type ResolverSource = Pick<
  ScryfallService,
  'getCardByExactName' | 'getCardByFuzzyName' | 'searchByPopularity' | 'getNameIndex'
>;

const NON_TRADITIONAL_LAYOUTS = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'planar', 'scheme', 'vanguard']);
const NON_TRADITIONAL_TYPES = /\b(Vanguard|Plane|Phenomenon|Scheme|Conspiracy|Dungeon|Emblem|Token)\b/;

/** Cards that could ever sit in a library (so "urza" isn't read as the Vanguard card). */
export function isTraditionalCard(card: ScryfallCard): boolean {
  if (NON_TRADITIONAL_LAYOUTS.has(card.layout)) return false;
  return !NON_TRADITIONAL_TYPES.test(splitTypeLine(card.type_line).types);
}

/** How the typed text relates to a card's name or either face name. */
export function classifyName(card: ScryfallCard, typed: string): MatchKind {
  const compact = normalizeName(typed);
  const typedWords = nameWords(typed);
  let best: MatchKind = 'contains';
  for (const variant of nameVariants(card)) {
    const n = normalizeName(variant);
    if (n === compact) return 'exact';
    if (n.startsWith(compact)) {
      best = 'completed';
      continue;
    }
    const words = nameWords(variant);
    if (typedWords.length > 0 && typedWords.every((t) => words.some((w) => w.startsWith(t)))) best = 'completed';
  }
  return best;
}

/** Lower means fewer points: basic lands first, unranked cards last. */
export function popularityKey(card: ScryfallCard): number {
  if (/\bBasic\b/.test(splitTypeLine(card.type_line).types)) return 0;
  return card.edhrec_rank ?? Number.POSITIVE_INFINITY;
}

const compare = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1);

function preferenceOrder(ctx: ResolveContext) {
  const key = ctx.popularityKey ?? popularityKey;
  return (a: Candidate, b: Candidate): number =>
    compare(KIND_ORDER[a.kind], KIND_ORDER[b.kind]) ||
    compare(a.cost, b.cost) ||
    compare(key(a.card), key(b.card)) ||
    compare(popularityKey(a.card), popularityKey(b.card));
}

export function evaluateCard(card: ScryfallCard, ctx: ResolveContext): Verdict {
  const eligibility = checkCardEligibility(card, ctx.today);
  const validation = ctx.question.validatorFn(card);
  if (!eligibility.ok) {
    return { fits: false, kind: 'legality', title: eligibility.title, reason: eligibility.reason, promptOk: validation.ok };
  }
  if (ctx.usedOracleIds.has(getOracleId(card))) {
    return {
      fits: false,
      kind: 'duplicate',
      title: 'Already called upon',
      reason: `You already named ${card.name}. Each card can answer only once.`,
      promptOk: true,
    };
  }
  if (!validation.ok) return { fits: false, kind: 'criteria', title: validation.title, reason: validation.reason, promptOk: false };
  return { fits: true, validation };
}

function acceptanceNote(best: Candidate, sameKindCount: number, typed: string): string | undefined {
  const name = best.card.name;
  if (best.kind === 'exact') return undefined;
  if (best.kind === 'corrected') return `Corrected “${typed}” to ${name}.`;
  if (sameKindCount > 1) {
    return `“${typed}” matched ${sameKindCount} cards that fit, so it counts as the most-played one: ${name}.`;
  }
  return `Finished “${typed}” as ${name}.`;
}

/**
 * Picks the answer from candidates: the best-matching card that fits, and
 * among equally good matches the most-played (lowest-scoring) one. With
 * nothing that fits, returns the likeliest intended card as a rejection.
 */
export function chooseCandidate(candidates: Candidate[], ctx: ResolveContext, typed: string): Resolution | null {
  if (candidates.length === 0) return null;
  const byPreference = preferenceOrder(ctx);
  const evaluated = candidates.map((c) => ({ ...c, verdict: evaluateCard(c.card, ctx) }));

  const fitting = evaluated.filter((c) => c.verdict.fits).sort(byPreference);
  const best = fitting[0];
  if (best && best.verdict.fits) {
    const sameKind = fitting.filter((c) => c.kind === best.kind).length;
    const validationNote = best.verdict.validation.note;
    const note = [acceptanceNote(best, sameKind, typed), validationNote].filter(Boolean).join(' ');
    return {
      status: 'accepted',
      card: best.card,
      kind: best.kind,
      typed,
      validation: best.verdict.validation,
      note: note || undefined,
    };
  }

  // Nothing fits. Prefer the card that at least answers the prompt (an
  // Un-card, melded, already used) so the explanation is about the real problem.
  const intended = [...evaluated].sort(
    (a, b) =>
      compare(a.kind === 'exact' ? 0 : 1, b.kind === 'exact' ? 0 : 1) ||
      compare(!a.verdict.fits && a.verdict.promptOk ? 0 : 1, !b.verdict.fits && b.verdict.promptOk ? 0 : 1) ||
      byPreference(a, b),
  )[0];
  if (!intended || intended.verdict.fits) return null;
  return {
    status: 'rejected',
    card: intended.card,
    kind: intended.kind,
    typed,
    reason: intended.verdict.kind,
    title: intended.verdict.title,
    message: intended.verdict.reason,
    costsAttempt: intended.verdict.kind !== 'duplicate',
    readAs: intended.kind === 'exact' ? undefined : intended.card.name,
  };
}

export async function resolveAnswer(input: string, ctx: ResolveContext, source: ResolverSource): Promise<Resolution> {
  const typed = input.trim();
  const cleaned = sanitizeInput(typed);
  const compactLength = normalizeName(cleaned).length;
  if (compactLength < 2) {
    return { status: 'not_found', typed, message: 'Type a card name first.' };
  }

  const contains = buildContainsQuery(cleaned);
  const canComplete = compactLength >= 3;

  // Steps 1 and 2 are both likely to be needed, so ask for them together.
  const exactPromise = source.getCardByExactName(cleaned);
  const poolPromise = canComplete
    ? source.searchByPopularity(`${contains} game:paper ${CARD_POOL_QUERY} (${ctx.question.scryfallQueryHint})`)
    : Promise.resolve({ cards: [] as ScryfallCard[], total: 0 });
  // Don't leave a rejected pool search unobserved if the exact match settles it.
  poolPromise.catch(() => undefined);

  // 1. The exact name of a real card is taken at its word.
  const exact = await exactPromise;
  if (exact && isTraditionalCard(exact)) {
    const resolution = chooseCandidate([{ card: exact, kind: 'exact', cost: 0 }], ctx, typed);
    if (resolution) return resolution;
  }

  if (!canComplete) {
    return {
      status: 'not_found',
      typed,
      message: `No card is named “${typed}”. Type at least three letters and Magillion will finish the name.`,
    };
  }

  const toCandidates = (cards: ScryfallCard[], kind?: MatchKind): Candidate[] =>
    cards.filter(isTraditionalCard).map((card) => ({ card, kind: kind ?? classifyName(card, cleaned), cost: 0 }));

  // 2. Partial name, completed within this prompt's pool.
  const pool = await poolPromise;
  const fromPool = chooseCandidate(toCandidates(pool.cards), ctx, typed);
  if (fromPool?.status === 'accepted') return fromPool;

  // 3. Any card with those words, to explain why it doesn't fit.
  const anywhere = await source.searchByPopularity(`${contains} game:paper`);
  const fromAnywhere = chooseCandidate(toCandidates([...pool.cards, ...anywhere.cards]), ctx, typed);
  if (fromAnywhere) return fromAnywhere;

  // 4. Typos: match against every card name.
  const index = await source.getNameIndex();
  if (index) {
    const matches = index.search(cleaned, 12);
    const bestCost = matches[0]?.cost;
    if (bestCost !== undefined) {
      const close = matches.filter((m) => m.cost <= bestCost + 0.5).slice(0, 10);
      const costByName = new Map(close.map((m) => [m.name, m.cost]));
      const found = await source.searchByPopularity(`${buildExactNamesQuery(close.map((m) => m.name))} game:paper`);
      const corrected = chooseCandidate(
        found.cards
          .filter(isTraditionalCard)
          .map((card) => ({ card, kind: 'corrected' as const, cost: costByName.get(card.name) ?? bestCost })),
        ctx,
        typed,
      );
      if (corrected) return corrected;
    }
  } else {
    const fuzzy = await source.getCardByFuzzyName(cleaned);
    if (fuzzy && isTraditionalCard(fuzzy)) {
      const corrected = chooseCandidate([{ card: fuzzy, kind: 'corrected', cost: 1 }], ctx, typed);
      if (corrected) return corrected;
    }
  }

  return {
    status: 'not_found',
    typed,
    message: `No card matches “${typed}”, even allowing for typos. Check the spelling and try again.`,
  };
}
