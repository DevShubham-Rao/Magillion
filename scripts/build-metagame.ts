/**
 * Builds public/data/metagame.json: how many recent Magic Online decks run
 * each card, per 60-card format.
 *
 *   node scripts/build-metagame.ts [--days 30] [--out public/data/metagame.json]
 *
 * 1. Downloads Scryfall's oracle-cards bulk file (data.scryfall.io has no
 *    rate limit) to map Magic Online card names to oracle ids.
 * 2. Reads the monthly decklist indexes on mtgo.com, then every Standard,
 *    Pioneer, Modern, Legacy, Vintage and Pauper league and challenge
 *    published in the window. Pages are fetched one at a time, a second
 *    apart, and events older than two days are cached in .cache/ so nightly
 *    runs only fetch what's new.
 * 3. Looks up any card names the bulk file didn't cover (Magic Online's
 *    alternate names for some Universes Beyond cards) on Scryfall.
 * 4. Counts decks per card and writes a compact snapshot for the game.
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { createGunzip } from 'node:zlib';
import type { MetagameSnapshot } from '../src/types/metagame.ts';
import { METAGAME_FORMAT_NAMES, METAGAME_FORMATS } from '../src/types/metagame.ts';
import {
  addDays,
  buildNameIndex,
  countDecks,
  extractDecklists,
  monthsBetween,
  namesWorthResolving,
  normalizeCardName,
  parseEventLinks,
  type BulkCard,
  type EventDecks,
  type EventLink,
} from './metagame/parse.ts';

const USER_AGENT = 'MagillionMetagameBuilder/1.0';
const MTGO_ROOT = 'https://www.mtgo.com';
const MTGO_GAP_MS = 1000;
const MIN_DECKS = 3;
const CACHE_DIR = '.cache';
const SETTLED_AFTER_DAYS = 2;
/** Refuse to write a snapshot if more than this share of events couldn't be read. */
const MAX_SKIPPED_SHARE = 0.15;
/**
 * Or if any format has fewer decks than this. Each format normally logs
 * hundreds a month; a handful means the run went wrong, and shares from a
 * tiny sample would mislead.
 */
const MIN_FORMAT_DECKS = 40;

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const days = Number(argument('days', '30'));
const outPath = argument('out', 'public/data/metagame.json');
const today = new Date().toISOString().slice(0, 10);
const from = addDays(today, -(days - 1));

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const REQUEST_TIMEOUT_MS = 60_000;

/**
 * GET with retries. Server errors, timeouts and 429s back off and retry;
 * 404 is final. A redirect is returned as-is (`redirect: 'manual'`) so the
 * caller can decide whether it's transient.
 */
async function fetchWithRetry(url: string, init: RequestInit = {}, attempts = 4): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { 'User-Agent': USER_AGENT, ...init.headers },
      });
      if (response.ok || response.status === 404 || (response.status >= 300 && response.status < 400)) return response;
      lastError = new Error(`${response.status} ${response.statusText}`);
      await sleep(attempt * (response.status === 429 ? 30_000 : 5_000));
    } catch (error) {
      lastError = error;
      await sleep(attempt * 5_000);
    }
  }
  throw new Error(`Failed to fetch ${url}: ${String(lastError)}`);
}

/* ------------------------------------------------------------------------ */
/* Scryfall bulk data                                                        */
/* ------------------------------------------------------------------------ */

async function loadOracleCards(): Promise<BulkCard[]> {
  const meta = (await (
    await fetchWithRetry('https://api.scryfall.com/bulk-data/oracle-cards', { headers: { Accept: 'application/json' } })
  ).json()) as { updated_at: string; jsonl_download_uri?: string; download_uri?: string };

  const dir = join(CACHE_DIR, 'scryfall');
  mkdirSync(dir, { recursive: true });
  const stamp = meta.updated_at.replace(/[^0-9]/g, '').slice(0, 14);
  const isJsonl = Boolean(meta.jsonl_download_uri);
  const file = join(dir, `oracle-cards-${stamp}.${isJsonl ? 'jsonl.gz' : 'json'}`);
  if (!existsSync(file)) {
    const uri = meta.jsonl_download_uri ?? meta.download_uri;
    if (!uri) throw new Error('Scryfall bulk-data entry has no download link');
    console.log(`Downloading ${uri}`);
    const response = await fetchWithRetry(uri);
    if (!response.body) throw new Error('Empty bulk download');
    await pipeline(Readable.fromWeb(response.body as WebReadableStream), createWriteStream(file));
  }

  const cards: BulkCard[] = [];
  if (isJsonl) {
    const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
    for await (const line of lines) {
      const trimmed = line.trim().replace(/,$/, '');
      if (!trimmed.startsWith('{')) continue;
      cards.push(JSON.parse(trimmed) as BulkCard);
    }
  } else {
    cards.push(...(JSON.parse(readFileSync(file, 'utf8')) as BulkCard[]));
  }
  return cards;
}

/** Scryfall asks for at most two search requests a second. */
const SCRYFALL_SEARCH_GAP_MS = 600;

/**
 * Magic Online prints some Universes Beyond cards under other names ("Zora,
 * Spider Fancier" is Aunt May). Scryfall keeps those names only on the
 * Magic Online printing, which the oracle-cards file leaves out, but its
 * search matches them. Each name is looked up once; hits are cached in
 * .cache/scryfall/aliases.json, misses are retried on the next run.
 */
async function resolveAliases(lookups: string[], names: Map<string, string>): Promise<number> {
  const file = join(CACHE_DIR, 'scryfall', 'aliases.json');
  const cache = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>) : {};
  let resolved = 0;
  let fetched = false;
  for (const name of lookups) {
    let id: string | undefined = cache[name];
    if (!id) {
      await sleep(SCRYFALL_SEARCH_GAP_MS);
      fetched = true;
      const query = encodeURIComponent(`!"${name.replace(/"/g, '')}" include:extras`);
      const response = await fetchWithRetry(`https://api.scryfall.com/cards/search?q=${query}&unique=prints`, {
        headers: { Accept: 'application/json' },
      });
      if (response.ok) {
        const body = (await response.json()) as { data?: BulkCard[] };
        const card = body.data?.find((c) => c.oracle_id ?? c.card_faces?.[0]?.oracle_id);
        id = card?.oracle_id ?? card?.card_faces?.[0]?.oracle_id;
      } else {
        await response.body?.cancel();
      }
      if (id) cache[name] = id;
    }
    if (id) {
      names.set(normalizeCardName(name), id);
      resolved += 1;
    }
  }
  if (fetched) writeFileSync(file, JSON.stringify(cache, null, 2));
  return resolved;
}

/* ------------------------------------------------------------------------ */
/* Magic Online decklists                                                    */
/* ------------------------------------------------------------------------ */

let lastMtgoRequest = 0;
const MTGO_REDIRECT_RETRIES = 4;

/**
 * One mtgo.com page, at most one request per `MTGO_GAP_MS`. When the site's
 * backend hiccups it redirects event pages to the decklist index (the same
 * page loads fine moments later), so a redirect is retried with backoff
 * before the page counts as unavailable.
 */
async function fetchMtgoPage(path: string): Promise<string | null> {
  for (let attempt = 0; attempt <= MTGO_REDIRECT_RETRIES; attempt++) {
    if (attempt > 0) await sleep(attempt * 5_000);
    const wait = lastMtgoRequest + MTGO_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastMtgoRequest = Date.now();
    const response = await fetchWithRetry(`${MTGO_ROOT}${path}`, { redirect: 'manual', headers: { Accept: 'text/html' } });
    if (response.status === 404) return null;
    if (response.ok) return response.text();
    await response.body?.cancel();
  }
  return null;
}

const INDEX_ATTEMPTS = 4;

async function listEvents(): Promise<EventLink[]> {
  const links: EventLink[] = [];
  for (const { year, month } of monthsBetween(from, today)) {
    // When mtgo.com is slow, an index page can load with an empty event list.
    // A missing month would silently drop part of the window, so it's fatal,
    // unless the month only just began and may really have nothing yet.
    let found: EventLink[] = [];
    for (let attempt = 0; attempt < INDEX_ATTEMPTS && found.length === 0; attempt++) {
      if (attempt > 0) await sleep(attempt * 60_000);
      const html = await fetchMtgoPage(`/decklists/${year}/${month}`);
      found = html ? parseEventLinks(html) : [];
    }
    if (found.length === 0 && `${year}-${month}-01` <= addDays(today, -2)) {
      throw new Error(`The ${year}-${month} decklist index listed no events; keeping the previous snapshot.`);
    }
    links.push(...found);
  }
  return links.filter((l) => l.date >= from && l.date <= today);
}

async function loadEvent(link: EventLink): Promise<EventDecks | null> {
  const dir = join(CACHE_DIR, 'mtgo');
  const file = join(dir, `${link.slug}.json`);
  if (existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, 'utf8')) as EventDecks;
    // Older builds cached half-loaded pages as empty events; fetch those again.
    if (cached.decks.length > 0) return cached;
  }

  const html = await fetchMtgoPage(`/decklist/${link.slug}`);
  const decks = html ? extractDecklists(html) : null;
  if (!decks) {
    console.warn(`  Skipped ${link.slug}: ${html ? 'the page loaded without its decklists' : 'mtgo.com kept redirecting it'}`);
    return null;
  }
  const event: EventDecks = { ...link, decks };
  // Recent pages can still gain decks; only cache settled ones.
  if (link.date <= addDays(today, -SETTLED_AFTER_DAYS)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(event));
  }
  return event;
}

/* ------------------------------------------------------------------------ */
/* Main                                                                      */
/* ------------------------------------------------------------------------ */

async function main() {
  console.log(`Metagame window ${from} to ${today} (${days} days)`);
  const bulk = await loadOracleCards();
  const names = buildNameIndex(bulk);
  const cardNames = new Map(bulk.map((c) => [c.oracle_id ?? c.card_faces?.[0]?.oracle_id ?? '', c.name]));
  console.log(`Indexed ${names.size.toLocaleString('en-US')} card names from ${bulk.length.toLocaleString('en-US')} cards`);

  const links = await listEvents();
  console.log(`Found ${links.length} events`);
  const events: EventDecks[] = [];
  let missed: EventLink[] = [];
  for (const [i, link] of links.entries()) {
    const event = await loadEvent(link);
    if (event) events.push(event);
    else missed.push(link);
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${links.length} events read`);
  }
  // mtgo.com's slow spells come and go, so give missed pages one more pass
  // after a pause.
  if (missed.length > 0) {
    console.log(`Retrying ${missed.length} skipped events in a minute`);
    await sleep(60_000);
    const retry = missed;
    missed = [];
    for (const link of retry) {
      const event = await loadEvent(link);
      if (event) events.push(event);
      else missed.push(link);
    }
  }
  const skipped = missed.length;
  if (skipped > links.length * MAX_SKIPPED_SHARE) {
    throw new Error(`${skipped} of ${links.length} events couldn't be read; keeping the previous snapshot.`);
  }

  const firstCount = countDecks(events, names, MIN_DECKS);
  const lookups = namesWorthResolving(firstCount.unmatched, MIN_DECKS);
  const aliased = lookups.length > 0 ? await resolveAliases(lookups, names) : 0;
  if (lookups.length > 0) console.log(`Matched ${aliased} of ${lookups.length} unmatched names through Scryfall search`);
  const { formats, unmatched } = aliased > 0 ? countDecks(events, names, MIN_DECKS) : firstCount;
  const thin = METAGAME_FORMATS.filter((f) => (formats[f]?.decks ?? 0) < MIN_FORMAT_DECKS);
  if (thin.length > 0) {
    throw new Error(
      `Too few decks for ${thin.map((f) => METAGAME_FORMAT_NAMES[f]).join(', ')} (under ${MIN_FORMAT_DECKS}); keeping the previous snapshot.`,
    );
  }
  const snapshot: MetagameSnapshot = {
    version: 1,
    generatedAt: new Date().toISOString(),
    window: { from, to: today, days },
    source: 'Magic Online official decklists (mtgo.com/decklists): league 5-0s and challenge top finishes',
    minDecks: MIN_DECKS,
    formats: Object.fromEntries(METAGAME_FORMATS.filter((f) => formats[f]).map((f) => [f, formats[f]])),
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(snapshot)}\n`);

  for (const format of METAGAME_FORMATS) {
    const table = formats[format];
    if (!table) {
      console.log(`${METAGAME_FORMAT_NAMES[format]}: no events`);
      continue;
    }
    const top = Object.entries(table.cards)
      .slice(0, 5)
      .map(([id, n]) => `${cardNames.get(id) ?? id} ${Math.round((100 * n) / table.decks)}%`)
      .join(', ');
    console.log(
      `${METAGAME_FORMAT_NAMES[format]}: ${table.events} events, ${table.decks} decks, ${Object.keys(table.cards).length} cards. Top: ${top}`,
    );
  }
  const missing = [...unmatched].sort((a, b) => b[1] - a[1]);
  if (missing.length > 0) {
    console.log(`${missing.length} MTGO names had no Scryfall match: ${missing.slice(0, 15).map(([n, c]) => `${n} (${c})`).join(', ')}`);
  }
  console.log(`Wrote ${outPath} from ${events.length} events (${skipped} skipped)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
