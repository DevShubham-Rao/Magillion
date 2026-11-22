import { METAGAME_FORMATS, type MetagameFormat, type MetagameSnapshot } from '../types/metagame';

/**
 * The 60-card popularity snapshot (`public/data/metagame.json`), loaded once
 * and indexed for lookups. The file ships with the site and is rebuilt
 * nightly from Magic Online's official decklists.
 */

export interface MetagameEntry {
  /** Decks in the window that run the card. */
  decks: number;
  /** Fraction of the format's decks that run it, 0–1. */
  share: number;
  /** Position by deck count within the format (1 = most played). */
  rank: number;
  /** Decks the share was measured over. */
  sampleSize: number;
}

export class MetagameIndex {
  readonly snapshot: MetagameSnapshot;
  private readonly ranks = new Map<MetagameFormat, Map<string, number>>();

  constructor(snapshot: MetagameSnapshot) {
    this.snapshot = snapshot;
    for (const format of METAGAME_FORMATS) {
      const table = snapshot.formats[format];
      if (!table) continue;
      const sorted = Object.entries(table.cards).sort((a, b) => b[1] - a[1]);
      const ranks = new Map<string, number>();
      let rank = 0;
      let previous = Number.POSITIVE_INFINITY;
      sorted.forEach(([id, count], i) => {
        if (count < previous) rank = i + 1;
        previous = count;
        ranks.set(id, rank);
      });
      this.ranks.set(format, ranks);
    }
  }

  /** Formats with at least one measured deck. */
  get formats(): MetagameFormat[] {
    return METAGAME_FORMATS.filter((f) => (this.snapshot.formats[f]?.decks ?? 0) > 0);
  }

  has(format: MetagameFormat): boolean {
    return (this.snapshot.formats[format]?.decks ?? 0) > 0;
  }

  lookup(oracleId: string, format: MetagameFormat): MetagameEntry | null {
    const table = this.snapshot.formats[format];
    const decks = table?.cards[oracleId];
    if (!table || !decks || table.decks === 0) return null;
    return { decks, share: decks / table.decks, rank: this.ranks.get(format)?.get(oracleId) ?? 0, sampleSize: table.decks };
  }
}

export function isMetagameSnapshot(value: unknown): value is MetagameSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<MetagameSnapshot>;
  return v.version === 1 && typeof v.formats === 'object' && v.formats !== null && typeof v.window === 'object';
}

const SNAPSHOT_URL = `${import.meta.env.BASE_URL}data/metagame.json`;

let loaded: MetagameIndex | null = null;
let pending: Promise<MetagameIndex | null> | null = null;

/**
 * Loads the snapshot once. Resolves to null if it's missing or malformed;
 * scoring then falls back to Commander play alone.
 */
export function loadMetagame(url: string = SNAPSHOT_URL): Promise<MetagameIndex | null> {
  if (!pending) {
    pending = fetch(url)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        loaded = isMetagameSnapshot(data) ? new MetagameIndex(data) : null;
        return loaded;
      })
      .catch(() => {
        // Let a later call try again.
        pending = null;
        return null;
      });
  }
  return pending;
}

/** The snapshot if it has already loaded, without waiting. */
export function peekMetagame(): MetagameIndex | null {
  return loaded;
}
