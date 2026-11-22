import { METAGAME_FORMATS, type MetagameFormat, type MetagameFormatTable } from '../../src/types/metagame.ts';

/**
 * Pure parsing and counting for the metagame builder, kept apart from the
 * network code so it can be unit tested.
 */

/** One published event, reduced to what the counts need. */
export interface EventDecks {
  slug: string;
  format: MetagameFormat;
  /** Publish date from the slug, YYYY-MM-DD. */
  date: string;
  /** Distinct card names per deck (main and sideboard). */
  decks: string[][];
}

export interface EventLink {
  slug: string;
  format: MetagameFormat;
  date: string;
}

/** Same rule as the game's `normalizeName`: no accents, case or punctuation. */
export function normalizeCardName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Reads an event slug such as `modern-challenge-32-2026-11-2112858938`.
 * The day is always two digits, followed directly by the event id.
 * Returns null for formats the game doesn't track (Premodern, Duel Commander,
 * Limited).
 */
export function parseEventSlug(slug: string): EventLink | null {
  const format = METAGAME_FORMATS.find((f) => slug.startsWith(`${f}-`));
  if (!format) return null;
  const date = /-(\d{4})-(\d{2})-(\d{2})\d+$/.exec(slug);
  if (!date) return null;
  return { slug, format, date: `${date[1]}-${date[2]}-${date[3]}` };
}

/** Event links on a monthly index page (`/decklists/YYYY/MM`). */
export function parseEventLinks(html: string): EventLink[] {
  const seen = new Set<string>();
  const links: EventLink[] = [];
  for (const match of html.matchAll(/href="\/decklist\/([a-z0-9-]+)"/g)) {
    const slug = match[1];
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const link = parseEventSlug(slug);
    if (link) links.push(link);
  }
  return links;
}

interface RawCardEntry {
  card_attributes?: { card_name?: string };
}

interface RawDeck {
  main_deck?: RawCardEntry[];
  sideboard_deck?: RawCardEntry[];
}

/**
 * Event pages embed their decklists as `window.MTGO.decklists.data = {…};`.
 * Returns each deck's distinct card names, or null if the page doesn't carry
 * any. Every published event has decks: when mtgo.com's backend is slow it
 * serves the event's details without the `decklists` field, and the same
 * page loads in full later. So no decks means "try again", never "empty".
 */
export function extractDecklists(html: string): string[][] | null {
  const marker = 'window.MTGO.decklists.data = ';
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const end = html.indexOf(';\n', start);
  const json = html.slice(start + marker.length, end < 0 ? undefined : end).trim();
  let data: { decklists?: RawDeck[] };
  try {
    data = JSON.parse(json) as { decklists?: RawDeck[] };
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  if (!Array.isArray(data.decklists) || data.decklists.length === 0) return null;
  return data.decklists.map((deck) => {
    const names = new Set<string>();
    for (const entry of [...(deck.main_deck ?? []), ...(deck.sideboard_deck ?? [])]) {
      const name = entry.card_attributes?.card_name?.trim();
      if (name) names.add(name);
    }
    return [...names];
  });
}

/** Minimal slice of a Scryfall card from the oracle-cards bulk file. */
export interface BulkCard {
  name: string;
  layout: string;
  oracle_id?: string;
  card_faces?: { name: string; oracle_id?: string }[];
  legalities?: Record<string, string>;
}

const SKIPPED_LAYOUTS = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'vanguard', 'planar', 'scheme']);

/**
 * Maps every way Magic Online writes a card name to its oracle id: the full
 * name ("Wear // Tear" and MTGO's "Wear/Tear" normalise alike) and the front
 * face of double-faced and adventure cards. Real tournament cards win name
 * clashes.
 */
export function buildNameIndex(cards: Iterable<BulkCard>): Map<string, string> {
  const index = new Map<string, { id: string; real: boolean }>();
  for (const card of cards) {
    if (SKIPPED_LAYOUTS.has(card.layout)) continue;
    const id = card.oracle_id ?? card.card_faces?.[0]?.oracle_id;
    if (!id) continue;
    const real = (card.legalities?.vintage ?? 'not_legal') !== 'not_legal';
    const keys = new Set([normalizeCardName(card.name)]);
    const front = card.card_faces?.[0]?.name;
    if (front) keys.add(normalizeCardName(front));
    for (const key of keys) {
      if (!key) continue;
      const existing = index.get(key);
      if (!existing || (real && !existing.real)) index.set(key, { id, real });
    }
  }
  return new Map([...index].map(([key, value]) => [key, value.id]));
}

export interface CountResult {
  formats: Partial<Record<MetagameFormat, MetagameFormatTable>>;
  /** MTGO names with no Scryfall match, with how many decks ran them. */
  unmatched: Map<string, number>;
}

/**
 * Counts, per format, how many decks run each card at least once. Cards in
 * fewer than `minDecks` decks are dropped: one brewer's pet card isn't fame.
 */
export function countDecks(events: EventDecks[], names: Map<string, string>, minDecks: number): CountResult {
  const formats: Partial<Record<MetagameFormat, MetagameFormatTable>> = {};
  const unmatched = new Map<string, number>();
  const raw = new Map<MetagameFormat, Map<string, number>>();

  for (const event of events) {
    const table = (formats[event.format] ??= { events: 0, decks: 0, cards: {} });
    const counts = raw.get(event.format) ?? new Map<string, number>();
    raw.set(event.format, counts);
    table.events += 1;
    for (const deck of event.decks) {
      table.decks += 1;
      const ids = new Set<string>();
      for (const name of deck) {
        const id = names.get(normalizeCardName(name));
        if (id) ids.add(id);
        else unmatched.set(name, (unmatched.get(name) ?? 0) + 1);
      }
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  for (const [format, counts] of raw) {
    const table = formats[format];
    if (!table) continue;
    const kept = [...counts].filter(([, n]) => n >= minDecks).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    table.cards = Object.fromEntries(kept);
  }
  return { formats, unmatched };
}

/**
 * Unmatched names worth looking up one by one, most played first. A name in
 * fewer than `minDecks` decks across all formats can't reach `minDecks` in
 * any one of them, so it would be dropped anyway.
 */
export function namesWorthResolving(unmatched: Map<string, number>, minDecks: number): string[] {
  return [...unmatched]
    .filter(([, n]) => n >= minDecks)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
}

/** Months (YYYY, MM) touched by an inclusive date range. */
export function monthsBetween(from: string, to: string): { year: string; month: string }[] {
  const months: { year: string; month: string }[] = [];
  let [year, month] = from.split('-').map(Number) as [number, number];
  const [endYear, endMonth] = to.split('-').map(Number) as [number, number];
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push({ year: String(year), month: String(month).padStart(2, '0') });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

export function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
