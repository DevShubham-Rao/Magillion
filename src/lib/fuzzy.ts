import { normalizeName } from './cardFaces';

/**
 * Typo-tolerant card-name matching over Scryfall's full name catalog.
 *
 * Each typed word must match a word in the card name, either as a prefix
 * ("sculpt" → Sculptor) or within a small edit distance ("wizzer" →
 * Whizzer). Filler words like "the" are optional, and spacing differences
 * are caught by comparing names with all spaces and punctuation removed
 * ("boom pile" → Boompile).
 */

export const STOPWORDS = new Set(['the', 'of', 'a', 'an', 'and', 'to', 'in', 'from', 'with', 'for', 'on', 'at', 'by']);

export function nameWords(value: string): string[] {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Edits allowed for a word of this length. Short words must be typed exactly. */
export function maxEditsFor(length: number): number {
  if (length <= 3) return 0;
  if (length <= 5) return 1;
  if (length <= 8) return 2;
  return 3;
}

/**
 * Optimal-string-alignment distance (Levenshtein plus adjacent swaps),
 * abandoning early once every path exceeds `max`.
 */
export function editDistance(a: string, b: string, max = Number.POSITIVE_INFINITY): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  let prevPrev = new Array<number>(cols).fill(0);
  let prev = Array.from({ length: cols }, (_, j) => j);
  for (let i = 1; i < rows; i++) {
    const current = new Array<number>(cols).fill(0);
    current[0] = i;
    let rowMin = current[0];
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min((prev[j] as number) + 1, (current[j - 1] as number) + 1, (prev[j - 1] as number) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, (prevPrev[j - 2] as number) + 1);
      }
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = current;
  }
  return prev[cols - 1] as number;
}

/** 0 for a prefix match, the edit distance for a near miss, Infinity otherwise. */
export function wordCost(typed: string, target: string): number {
  if (target.startsWith(typed)) return 0;
  const limit = maxEditsFor(typed.length);
  if (limit === 0) return Number.POSITIVE_INFINITY;
  const whole = editDistance(typed, target, limit);
  // A half-typed word with a typo in it: compare to the start of the target.
  const partial =
    target.length > typed.length + 1 ? editDistance(typed, target.slice(0, typed.length), limit) + 0.5 : Number.POSITIVE_INFINITY;
  const best = Math.min(whole, partial);
  return best <= limit ? best : Number.POSITIVE_INFINITY;
}

interface IndexedName {
  name: string;
  words: string[];
  compact: string;
}

export interface NameMatch {
  name: string;
  /** Total edits needed; 0 means every typed word was a prefix of the name. */
  cost: number;
}

export class NameIndex {
  private readonly entries: IndexedName[];

  constructor(names: readonly string[]) {
    this.entries = names.map((name) => ({ name, words: nameWords(name), compact: normalizeName(name) }));
  }

  get size(): number {
    return this.entries.length;
  }

  /** Closest names to the input, best first. */
  search(input: string, limit = 10): NameMatch[] {
    const typedWords = nameWords(input);
    const significant = typedWords.filter((w) => !STOPWORDS.has(w));
    const tokens = significant.length > 0 ? significant : typedWords;
    const compactInput = normalizeName(input);
    if (tokens.length === 0 || compactInput.length < 3) return [];
    const compactLimit = maxEditsFor(compactInput.length);

    const matches: NameMatch[] = [];
    for (const entry of this.entries) {
      let cost = 0;
      let matched = true;
      for (const token of tokens) {
        let best = Number.POSITIVE_INFINITY;
        for (const word of entry.words) {
          const c = wordCost(token, word);
          if (c < best) best = c;
          if (best === 0) break;
        }
        if (best === Number.POSITIVE_INFINITY) {
          matched = false;
          break;
        }
        cost += best;
      }

      if (!matched) {
        // Spacing and punctuation differences ("boom pile" vs "Boompile").
        if (entry.compact.startsWith(compactInput)) {
          matched = true;
          cost = 0;
        } else if (compactLimit > 0 && Math.abs(entry.compact.length - compactInput.length) <= compactLimit) {
          const d = editDistance(compactInput, entry.compact, compactLimit);
          if (d <= compactLimit) {
            matched = true;
            cost = d;
          }
        }
      }

      if (matched) {
        // Prefer names without lots of extra words.
        const extra = Math.max(0, entry.words.length - tokens.length) * 0.01;
        matches.push({ name: entry.name, cost: cost + extra });
      }
    }

    matches.sort((a, b) => a.cost - b.cost || a.name.length - b.name.length);
    return matches.slice(0, limit);
  }
}
