import type {
  ScryfallCard,
  ScryfallCardSymbol,
  ScryfallError,
  ScryfallList,
} from '../types/mtg';
import { getOracleId, nameVariants, normalizeName } from '../lib/cardFaces';

/**
 * Scryfall REST client.
 *
 * Scryfall asks for 50–100 ms between requests (≈10/s). Every call goes
 * through one serial queue that enforces a 100 ms gap, and results are kept in
 * an in-memory TTL cache so retyping a query or revisiting a card costs
 * nothing. Browsers send their own User-Agent; we add `Accept` as Scryfall's
 * guidelines request.
 */

const API_ROOT = 'https://api.scryfall.com';
const MIN_REQUEST_GAP_MS = 100;
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const MAX_SUGGESTIONS = 8;

export class ScryfallRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ScryfallRequestError';
    this.status = status;
  }
}

/** Thrown when a queued request was superseded before it was sent. */
export class StaleRequestError extends Error {
  constructor() {
    super('Request superseded');
    this.name = 'StaleRequestError';
  }
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ScryfallError };

interface RequestOptions {
  /** Checked just before dispatch; a stale request is skipped entirely. */
  isStale?: () => boolean;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

class RateLimitedQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private lastDispatch = 0;
  private readonly gapMs: number;

  constructor(gapMs: number) {
    this.gapMs = gapMs;
  }

  schedule<T>(task: () => Promise<T>, isStale?: () => boolean): Promise<T> {
    const run = this.tail.then(async () => {
      if (isStale?.()) throw new StaleRequestError();
      const wait = this.lastDispatch + this.gapMs - Date.now();
      if (wait > 0) await delay(wait);
      if (isStale?.()) throw new StaleRequestError();
      this.lastDispatch = Date.now();
      return task();
    });
    this.tail = run.catch(() => undefined);
    return run;
  }
}

class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expires: number }>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(ttlMs: number, maxEntries: number) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  get(key: string): V | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Refresh recency for LRU eviction.
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expires: Date.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

export interface SearchSuggestion {
  card: ScryfallCard;
  /** 0 exact, 1 prefix, 2 word prefix, 3 substring, 4 fuzzy. */
  matchRank: number;
  /** The name or face name that matched best. */
  matchedName: string;
}

export type ResolveOutcome =
  | { status: 'found'; card: ScryfallCard }
  | { status: 'ambiguous'; message: string }
  | { status: 'not_found'; message: string };

/* ------------------------------------------------------------------------ */
/* Query building                                                            */
/* ------------------------------------------------------------------------ */

/** Strips Scryfall search syntax so player input is only ever a name. */
export function sanitizeInput(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[“”"]/g, '')
    .replace(/[:<>=!(){}[\]\\/|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameTokens(cleaned: string): string[] {
  return cleaned
    .split(' ')
    .map((t) => t.replace(/^[-+~]+/, '').replace(/[.,;]+$/, ''))
    .filter((t) => normalizeName(t).length > 0);
}

/** Name-contains query: every word must appear somewhere in the card name. */
export function buildContainsQuery(cleaned: string): string {
  return `${nameTokens(cleaned)
    .map((t) => `"${t}"`)
    .join(' ')} game:paper`;
}

/** Prefix-or-exact query used when the contains query is too broad to rank. */
export function buildPrefixQuery(cleaned: string): string {
  const words = cleaned
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const pattern = words.join('.*');
  return `(name:/^${pattern}/ or !"${cleaned}") game:paper`;
}

/* ------------------------------------------------------------------------ */
/* Ranking                                                                   */
/* ------------------------------------------------------------------------ */

function wordPrefixMatch(name: string, needle: string): boolean {
  const words = name
    .normalize('NFKD')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  for (let i = 1; i < words.length; i++) {
    if (words.slice(i).join('').startsWith(needle)) return true;
  }
  return false;
}

export function rankMatch(card: ScryfallCard, input: string): { rank: number; name: string } {
  const needle = normalizeName(input);
  let best = { rank: 4, name: card.name };
  for (const variant of nameVariants(card)) {
    const n = normalizeName(variant);
    let rank = 4;
    if (n === needle) rank = 0;
    else if (n.startsWith(needle)) rank = 1;
    else if (wordPrefixMatch(variant, needle)) rank = 2;
    else if (n.includes(needle)) rank = 3;
    if (rank < best.rank) best = { rank, name: variant };
  }
  return best;
}

export function rankSuggestions(cards: ScryfallCard[], input: string, limit = MAX_SUGGESTIONS): SearchSuggestion[] {
  const seen = new Set<string>();
  const ranked: SearchSuggestion[] = [];
  for (const card of cards) {
    const key = getOracleId(card);
    if (seen.has(key)) continue;
    seen.add(key);
    const { rank, name } = rankMatch(card, input);
    ranked.push({ card, matchRank: rank, matchedName: name });
  }
  ranked.sort(
    (a, b) =>
      a.matchRank - b.matchRank ||
      a.matchedName.length - b.matchedName.length ||
      a.card.name.localeCompare(b.card.name),
  );
  return ranked.slice(0, limit);
}

/* ------------------------------------------------------------------------ */
/* Service                                                                   */
/* ------------------------------------------------------------------------ */

export class ScryfallService {
  private readonly queue = new RateLimitedQueue(MIN_REQUEST_GAP_MS);
  private readonly cache = new TtlCache<ApiResult<unknown>>(CACHE_TTL_MS, CACHE_MAX_ENTRIES);
  private readonly byOracleId = new Map<string, ScryfallCard>();
  private symbology: Promise<Map<string, ScryfallCardSymbol>> | null = null;

  private async request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
    const cached = this.cache.get(path);
    if (cached) return cached as ApiResult<T>;

    const result = await this.queue.schedule<ApiResult<T>>(async () => {
      let response: Response;
      try {
        response = await fetch(`${API_ROOT}${path}`, { headers: { Accept: 'application/json' } });
      } catch {
        throw new ScryfallRequestError('Scryfall could not be reached', 0);
      }
      const body: unknown = await response.json().catch(() => null);
      if (response.ok) return { ok: true, data: body as T };
      if (body && typeof body === 'object' && (body as ScryfallError).object === 'error') {
        return { ok: false, error: body as ScryfallError };
      }
      throw new ScryfallRequestError(`Scryfall responded with ${response.status}`, response.status);
    }, options.isStale);

    // Successes and definitive "no such card" answers are safe to reuse.
    // Rate limits and server errors are not.
    if (result.ok || result.error.status === 404 || result.error.status === 400) {
      this.cache.set(path, result);
    }
    if (!result.ok && (result.error.status === 429 || result.error.status >= 500)) {
      throw new ScryfallRequestError(result.error.details, result.error.status);
    }
    return result;
  }

  /** Records a card so popularity providers can look it up by oracle id. */
  remember(card: ScryfallCard): void {
    this.byOracleId.set(getOracleId(card), card);
  }

  private rememberAll(cards: ScryfallCard[]): void {
    for (const card of cards) this.remember(card);
  }

  /**
   * Live suggestions for the search box. Matches either half of split, MDFC
   * and adventure cards, tolerates spacing and punctuation differences
   * ("Boom Pile" → Boompile), and falls back to Scryfall's fuzzy matcher for
   * typos. Suggestions are not filtered by format so banned cards can still
   * be named and explained.
   */
  async searchSuggestions(input: string, options: RequestOptions = {}): Promise<SearchSuggestion[]> {
    const cleaned = sanitizeInput(input);
    if (normalizeName(cleaned).length < 2 || nameTokens(cleaned).length === 0) return [];

    // 1. Names that start with the input, plus an exact match on either face
    //    ("ice" → Fire // Ice). Small, targeted, and usually enough.
    const prefix = await this.request<ScryfallList<ScryfallCard>>(
      `/cards/search?unique=cards&order=name&q=${encodeURIComponent(buildPrefixQuery(cleaned))}`,
      options,
    );
    let cards: ScryfallCard[] = prefix.ok ? prefix.data.data : [];

    // 2. Too few: widen to every name containing each word. This finds back
    //    faces ("tibalt" → Valki // Tibalt) and mid-name words ("sculptor").
    if (cards.length < MAX_SUGGESTIONS) {
      const contains = await this.request<ScryfallList<ScryfallCard>>(
        `/cards/search?unique=cards&order=name&q=${encodeURIComponent(buildContainsQuery(cleaned))}`,
        options,
      );
      if (contains.ok) cards = [...cards, ...contains.data.data];
    }

    // Nothing contains those words: let Scryfall's fuzzy matcher guess.
    if (cards.length === 0) {
      const fuzzy = await this.request<ScryfallCard>(
        `/cards/named?fuzzy=${encodeURIComponent(cleaned)}`,
        options,
      );
      if (fuzzy.ok) cards = [fuzzy.data];
    }

    this.rememberAll(cards);
    return rankSuggestions(cards, cleaned);
  }

  /** Resolves free text (the Enter key) with Scryfall's fuzzy matcher. */
  async resolveByName(input: string): Promise<ResolveOutcome> {
    const cleaned = sanitizeInput(input);
    if (!cleaned) return { status: 'not_found', message: 'Type a card name first.' };
    const result = await this.request<ScryfallCard>(`/cards/named?fuzzy=${encodeURIComponent(cleaned)}`);
    if (result.ok) {
      this.remember(result.data);
      return { status: 'found', card: result.data };
    }
    if (result.error.type === 'ambiguous') {
      return {
        status: 'ambiguous',
        message: `Several cards answer to “${cleaned}”. Pick one from the list or add more of the name.`,
      };
    }
    return {
      status: 'not_found',
      message: `Scryfall has no card named “${cleaned}”. Check the spelling or pick a suggestion.`,
    };
  }

  async getCardByOracleId(oracleId: string): Promise<ScryfallCard | null> {
    const known = this.byOracleId.get(oracleId);
    if (known) return known;
    const result = await this.request<ScryfallList<ScryfallCard>>(
      `/cards/search?unique=cards&q=${encodeURIComponent(`oracleid:${oracleId}`)}`,
    );
    const card = result.ok ? result.data.data[0] : undefined;
    if (!card) return null;
    this.remember(card);
    return card;
  }

  /** Release date of a card's earliest printing (YYYY-MM-DD). */
  async getFirstPrintReleaseDate(oracleId: string): Promise<string | null> {
    const result = await this.request<ScryfallList<ScryfallCard>>(
      `/cards/search?unique=prints&order=released&dir=asc&q=${encodeURIComponent(`oracleid:${oracleId}`)}`,
    );
    return result.ok ? (result.data.data[0]?.released_at ?? null) : null;
  }

  /** Mana and card symbols keyed by their text form, e.g. "{W/U}". */
  getSymbology(): Promise<Map<string, ScryfallCardSymbol>> {
    if (!this.symbology) {
      this.symbology = this.request<ScryfallList<ScryfallCardSymbol>>('/symbology')
        .then((result) => {
          const map = new Map<string, ScryfallCardSymbol>();
          if (result.ok) for (const symbol of result.data.data) map.set(symbol.symbol, symbol);
          return map;
        })
        .catch(() => {
          this.symbology = null;
          return new Map<string, ScryfallCardSymbol>();
        });
    }
    return this.symbology;
  }
}

export const scryfall = new ScryfallService();

/** Scryfall search page for a query, sorted with the least-played cards first. */
export function scryfallSearchUrl(query: string): string {
  return `https://scryfall.com/search?order=edhrec&dir=desc&q=${encodeURIComponent(query)}`;
}
