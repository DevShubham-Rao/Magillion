import type {
  ScryfallCard,
  ScryfallCardSymbol,
  ScryfallError,
  ScryfallList,
} from '../types/mtg';
import { getOracleId, normalizeName } from '../lib/cardFaces';
import { NameIndex } from '../lib/fuzzy';

/**
 * Scryfall REST client.
 *
 * Scryfall's hard limits (scryfall.com/docs/api/rate-limits): /cards/search,
 * /cards/named, /cards/random and /cards/collection allow 2 requests per
 * second; everything else allows 10. A 429 locks the client out for 30
 * seconds, and ignoring it risks a ban, so after one we stop calling
 * entirely until the lockout ends. Results are cached in memory so repeated
 * lookups cost nothing. Browsers send their own User-Agent; we add `Accept`
 * as Scryfall's guidelines request.
 */

const API_ROOT = 'https://api.scryfall.com';
const CARD_ENDPOINT_GAP_MS = 500;
const GENERAL_GAP_MS = 100;
const RATE_LIMIT_LOCKOUT_MS = 31_000;
const CARD_ENDPOINTS = /^\/cards\/(search|named|random|collection)/;
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const CATALOG_STORAGE_KEY = 'magillion.catalog.v1';
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

export class ScryfallRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ScryfallRequestError';
    this.status = status;
  }
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ScryfallError };

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Hands out dispatch slots at least `gapMs` apart. Requests may overlap in
 * flight, but never start faster than Scryfall's limit.
 */
class RateLimitedQueue {
  private nextSlot = 0;
  private readonly gapMs: number;

  constructor(gapMs: number) {
    this.gapMs = gapMs;
  }

  async schedule<T>(task: () => Promise<T>): Promise<T> {
    const slot = Math.max(Date.now(), this.nextSlot);
    this.nextSlot = slot + this.gapMs;
    const wait = slot - Date.now();
    if (wait > 0) await delay(wait);
    return task();
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

/** Every word must appear somewhere in the card name (either face). */
export function buildContainsQuery(cleaned: string): string {
  return nameTokens(cleaned)
    .map((t) => `"${t}"`)
    .join(' ');
}

/** Exact-name clause for a list of names: (!"A" or !"B"). */
export function buildExactNamesQuery(names: readonly string[]): string {
  return `(${names.map((n) => `!"${n.replace(/"/g, '')}"`).join(' or ')})`;
}

/* ------------------------------------------------------------------------ */
/* Service                                                                   */
/* ------------------------------------------------------------------------ */

export class ScryfallService {
  private readonly cardQueue = new RateLimitedQueue(CARD_ENDPOINT_GAP_MS);
  private readonly generalQueue = new RateLimitedQueue(GENERAL_GAP_MS);
  private readonly cache = new TtlCache<ApiResult<unknown>>(CACHE_TTL_MS, CACHE_MAX_ENTRIES);
  private readonly byOracleId = new Map<string, ScryfallCard>();
  private symbology: Promise<Map<string, ScryfallCardSymbol>> | null = null;
  private nameIndex: Promise<NameIndex | null> | null = null;
  private lockedUntil = 0;

  /** Milliseconds until Scryfall will accept requests again after a 429. */
  get rateLimitCooldownMs(): number {
    return Math.max(0, this.lockedUntil - Date.now());
  }

  private async request<T>(path: string): Promise<ApiResult<T>> {
    const cached = this.cache.get(path);
    if (cached) return cached as ApiResult<T>;
    if (this.rateLimitCooldownMs > 0) {
      throw new ScryfallRequestError('Scryfall asked us to slow down', 429);
    }

    const queue = CARD_ENDPOINTS.test(path) ? this.cardQueue : this.generalQueue;
    const result = await queue.schedule<ApiResult<T>>(async () => {
      if (this.rateLimitCooldownMs > 0) throw new ScryfallRequestError('Scryfall asked us to slow down', 429);
      let response: Response;
      try {
        response = await fetch(`${API_ROOT}${path}`, { headers: { Accept: 'application/json' } });
      } catch {
        throw new ScryfallRequestError('Scryfall could not be reached', 0);
      }
      if (response.status === 429) {
        this.lockedUntil = Date.now() + RATE_LIMIT_LOCKOUT_MS;
        throw new ScryfallRequestError('Scryfall asked us to slow down', 429);
      }
      const body: unknown = await response.json().catch(() => null);
      if (response.ok) return { ok: true, data: body as T };
      if (body && typeof body === 'object' && (body as ScryfallError).object === 'error') {
        return { ok: false, error: body as ScryfallError };
      }
      throw new ScryfallRequestError(`Scryfall responded with ${response.status}`, response.status);
    });

    // Successes and definitive "no such card" answers are safe to reuse.
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

  /** A card whose full name or either face name matches exactly. */
  async getCardByExactName(name: string): Promise<ScryfallCard | null> {
    const cleaned = sanitizeInput(name);
    if (!cleaned) return null;
    const result = await this.request<ScryfallCard>(`/cards/named?exact=${encodeURIComponent(cleaned)}`);
    if (!result.ok) return null;
    this.remember(result.data);
    return result.data;
  }

  /** Scryfall's own fuzzy matcher; used when the local name index isn't ready. */
  async getCardByFuzzyName(name: string): Promise<ScryfallCard | null> {
    const cleaned = sanitizeInput(name);
    if (!cleaned) return null;
    const result = await this.request<ScryfallCard>(`/cards/named?fuzzy=${encodeURIComponent(cleaned)}`);
    if (!result.ok) return null;
    this.remember(result.data);
    return result.data;
  }

  /**
   * First page of a search, most-played first. Searching by EDHREC order
   * means the first page always holds the lowest-scoring matches.
   */
  async searchByPopularity(query: string): Promise<{ cards: ScryfallCard[]; total: number }> {
    const result = await this.request<ScryfallList<ScryfallCard>>(
      `/cards/search?unique=cards&order=edhrec&dir=asc&q=${encodeURIComponent(query)}`,
    );
    if (!result.ok) return { cards: [], total: 0 };
    for (const card of result.data.data) this.remember(card);
    return { cards: result.data.data, total: result.data.total_cards ?? result.data.data.length };
  }

  async getCardByOracleId(oracleId: string): Promise<ScryfallCard | null> {
    const known = this.byOracleId.get(oracleId);
    if (known) return known;
    const { cards } = await this.searchByPopularity(`oracleid:${oracleId}`);
    return cards[0] ?? null;
  }

  /** Release date of a card's earliest printing (YYYY-MM-DD). */
  async getFirstPrintReleaseDate(oracleId: string): Promise<string | null> {
    const result = await this.request<ScryfallList<ScryfallCard>>(
      `/cards/search?unique=prints&order=released&dir=asc&q=${encodeURIComponent(`oracleid:${oracleId}`)}`,
    );
    return result.ok ? (result.data.data[0]?.released_at ?? null) : null;
  }

  /**
   * Index of every English card name (≈35k), for typo correction. Cached in
   * localStorage for a day so it downloads at most once daily.
   */
  getNameIndex(): Promise<NameIndex | null> {
    if (!this.nameIndex) {
      this.nameIndex = (async () => {
        try {
          const stored = globalThis.localStorage?.getItem(CATALOG_STORAGE_KEY);
          if (stored) {
            const parsed = JSON.parse(stored) as { fetchedAt: number; names: string[] };
            if (Date.now() - parsed.fetchedAt < CATALOG_TTL_MS && parsed.names.length > 1000) {
              return new NameIndex(parsed.names);
            }
          }
        } catch {
          // Corrupt or blocked storage: fall through to the network.
        }
        const result = await this.request<{ data: string[] }>('/catalog/card-names');
        if (!result.ok) return null;
        try {
          globalThis.localStorage?.setItem(
            CATALOG_STORAGE_KEY,
            JSON.stringify({ fetchedAt: Date.now(), names: result.data.data }),
          );
        } catch {
          // Quota exceeded: keep it in memory only.
        }
        return new NameIndex(result.data.data);
      })().catch(() => {
        this.nameIndex = null;
        return null;
      });
    }
    return this.nameIndex;
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
