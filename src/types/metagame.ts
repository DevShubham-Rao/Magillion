/**
 * Shape of `public/data/metagame.json`, the 60-card popularity snapshot built
 * nightly by `scripts/build-metagame.ts` from Magic Online's official
 * decklists. Shared by the builder (Node) and the game (browser), so it must
 * stay free of imports.
 */

/** 60-card formats with official Magic Online decklists. */
export const METAGAME_FORMATS = ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'pauper'] as const;

export type MetagameFormat = (typeof METAGAME_FORMATS)[number];

export const METAGAME_FORMAT_NAMES: Record<MetagameFormat, string> = {
  standard: 'Standard',
  pioneer: 'Pioneer',
  modern: 'Modern',
  legacy: 'Legacy',
  vintage: 'Vintage',
  pauper: 'Pauper',
};

export interface MetagameFormatTable {
  /** Published events (leagues and challenges) in the window. */
  events: number;
  /** Decklists in those events. */
  decks: number;
  /** Oracle id → number of decks running at least one copy, main or sideboard. */
  cards: Record<string, number>;
}

export interface MetagameSnapshot {
  version: 1;
  generatedAt: string;
  /** Inclusive UTC date range the decklists were published in. */
  window: { from: string; to: string; days: number };
  source: string;
  /** Cards in fewer decks than this were dropped as noise. */
  minDecks: number;
  formats: Partial<Record<MetagameFormat, MetagameFormatTable>>;
}
