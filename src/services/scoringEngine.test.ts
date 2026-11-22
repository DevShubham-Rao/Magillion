import { describe, expect, it } from 'vitest';
import {
  BANNED_IN_COMMANDER_RANK,
  CrossFormatAggregator,
  EdhrecPopularityProvider,
  RankTablePopularityProvider,
  ScoringEngine,
  createDefaultScoringEngine,
  edhrecRankToObscurity,
  effectiveEdhrecRank,
  estimateObscurity,
  pointsForEdhrecRank,
  shareToEquivalentRank,
  type CardSource,
} from './scoringEngine';
import { MetagameIndex } from './metagame';
import type { MetagameSnapshot } from '../types/metagame';
import { RARITY_TIERS, tierForPoints } from '../data/rarityTiers';
import { makeCard } from '../test/fixtures';
import type { ScryfallCard } from '../types/mtg';

function sourceFor(cards: ScryfallCard[], firstPrints: Record<string, string> = {}): CardSource {
  const map = new Map(cards.map((c) => [c.oracle_id as string, c]));
  return {
    getCardByOracleId: async (id) => map.get(id) ?? null,
    getFirstPrintReleaseDate: async (id) => firstPrints[id] ?? map.get(id)?.released_at ?? null,
    remember: (card) => map.set(card.oracle_id as string, card),
  };
}

describe('EDHREC curve', () => {
  it('pins the endpoints', () => {
    expect(pointsForEdhrecRank(1)).toBe(50);
    expect(pointsForEdhrecRank(20_000)).toBe(1000);
    expect(pointsForEdhrecRank(32_700)).toBe(1000);
    expect(pointsForEdhrecRank(null)).toBe(1000);
  });

  it('never decreases as rank grows', () => {
    let previous = -1;
    for (let rank = 1; rank <= 21_000; rank += 37) {
      const o = edhrecRankToObscurity(rank);
      expect(o).toBeGreaterThanOrEqual(previous);
      previous = o;
    }
  });

  it('lands well-known cards in sensible tiers (live ranks as of Nov 2026)', () => {
    expect(tierForPoints(pointsForEdhrecRank(1)).id).toBe('common'); // Sol Ring
    expect(tierForPoints(pointsForEdhrecRank(400)).id).toBe('common');
    expect(tierForPoints(pointsForEdhrecRank(1000)).id).toBe('uncommon');
    expect(tierForPoints(pointsForEdhrecRank(3234)).id).toBe('rare'); // Jace, the Mind Sculptor
    expect(tierForPoints(pointsForEdhrecRank(4294)).id).toBe('rare'); // Vraska, Golgari Queen
    expect(tierForPoints(pointsForEdhrecRank(9451)).id).toBe('mythic'); // Serra Angel
    expect(tierForPoints(pointsForEdhrecRank(13_306)).id).toBe('timeshifted'); // Fire // Ice
    expect(tierForPoints(pointsForEdhrecRank(19_000)).id).toBe('serialized');
  });
});

describe('rarity tiers', () => {
  it('cover 0–1,000 without gaps', () => {
    for (let p = 0; p <= 1000; p++) {
      const matches = RARITY_TIERS.filter((t) => p >= t.minPoints && p <= t.maxPoints);
      expect(matches).toHaveLength(1);
    }
  });
});

describe('EdhrecPopularityProvider', () => {
  const today = () => '2026-11-21';

  it('treats basic lands as the most played cards', async () => {
    const forest = makeCard({ name: 'Forest', type_line: 'Basic Land — Forest', edhrec_rank: null });
    const engine = createDefaultScoringEngine(sourceFor([forest]));
    const result = await engine.score(forest);
    expect(result.points).toBe(50);
    expect(result.notes.join(' ')).toMatch(/basic lands/i);
  });

  it('scores fresh cards provisionally until EDHREC catches up', async () => {
    const fresh = makeCard({ name: 'Gorn Captain', released_at: '2026-11-13', edhrec_rank: 32_700 });
    const provider = new EdhrecPopularityProvider(sourceFor([fresh]), undefined, today);
    const pop = await provider.getCardPopularity(fresh.oracle_id as string, 'commander');
    expect(pop.confidence).toBe('provisional');
    expect(pop.obscurity).toBeCloseTo(edhrecRankToObscurity(6000));
  });

  it('does not treat a recent reprint of an old card as fresh', async () => {
    const reprint = makeCard({ name: 'Old Card', released_at: '2026-11-13', edhrec_rank: 30_000 });
    const provider = new EdhrecPopularityProvider(
      sourceFor([reprint], { [reprint.oracle_id as string]: '1995-04-01' }),
      undefined,
      today,
    );
    const pop = await provider.getCardPopularity(reprint.oracle_id as string, 'commander');
    expect(pop.confidence).toBe('measured');
    expect(pop.obscurity).toBe(1);
  });
});

describe('CrossFormatAggregator', () => {
  const card = makeCard({ name: 'Thoughtseize', edhrec_rank: 14_000 });
  const source = sourceFor([card]);
  const edhrec = new EdhrecPopularityProvider(source, undefined, () => '2026-11-21');
  const modern = new RankTablePopularityProvider('modern-table', 'Modern table', {
    modern: { ranks: new Map([[card.oracle_id as string, 2]]), poolSize: 1500 },
  });

  it('primary-only ignores other formats', async () => {
    const agg = new CrossFormatAggregator('commander', [
      { provider: edhrec, format: 'commander', weight: 1 },
      { provider: modern, format: 'modern', weight: 0.8 },
    ], { kind: 'primary-only' });
    const result = await new ScoringEngine(agg).score(card);
    expect(result.points).toBe(pointsForEdhrecRank(14_000));
  });

  it('max-popularity stops a Modern staple from farming points', async () => {
    const agg = new CrossFormatAggregator('commander', [
      { provider: edhrec, format: 'commander', weight: 1 },
      { provider: modern, format: 'modern', weight: 0.8 },
    ], { kind: 'max-popularity', weights: { modern: 0.8 } });
    const result = await new ScoringEngine(agg).score(card);
    expect(result.points).toBeLessThan(300);
  });

  it('weighted-penalty shaves points but respects the cap', async () => {
    const agg = new CrossFormatAggregator('commander', [
      { provider: edhrec, format: 'commander', weight: 1 },
      { provider: modern, format: 'modern', weight: 0.8 },
    ], { kind: 'weighted-penalty', weights: { modern: 0.8 }, maxPenalty: 0.5 });
    const result = await new ScoringEngine(agg).score(card);
    const base = pointsForEdhrecRank(14_000);
    expect(result.points).toBeLessThan(base);
    expect(result.points).toBeGreaterThanOrEqual(Math.round(50 + (base - 50) * 0.5) - 1);
  });
});

describe('banned in Commander', () => {
  it('counts a card banned in Commander but played in Vintage as rank #1,000', () => {
    const crypt = makeCard({ name: 'Mana Crypt', edhrec_rank: null, legalities: { commander: 'banned', vintage: 'restricted' } });
    expect(effectiveEdhrecRank(crypt)).toMatchObject({ rank: BANNED_IN_COMMANDER_RANK, reason: 'banned' });
  });

  it('gives no floor to cards banned in Vintage too (ante, dexterity)', () => {
    const ante = makeCard({ name: 'Contract from Below', edhrec_rank: null, legalities: { commander: 'banned', vintage: 'banned' } });
    expect(effectiveEdhrecRank(ante).rank).toBeNull();
  });
});

describe('60-card play', () => {
  const snapshot = (formats: MetagameSnapshot['formats']): MetagameSnapshot => ({
    version: 1,
    generatedAt: '2026-11-21T06:00:00Z',
    window: { from: '2026-10-23', to: '2026-11-21', days: 30 },
    source: 'test',
    minDecks: 3,
    formats,
  });

  const crypt = makeCard({ name: 'Mana Crypt', edhrec_rank: null, legalities: { commander: 'banned', vintage: 'restricted' } });
  const seize = makeCard({ name: 'Thoughtseize', edhrec_rank: 3_000 });
  const chaff = makeCard({ name: 'Draft Chaff', edhrec_rank: 25_000 });
  const index = new MetagameIndex(
    snapshot({
      vintage: { events: 10, decks: 200, cards: { [crypt.oracle_id as string]: 110 } },
      modern: { events: 40, decks: 1000, cards: { [seize.oracle_id as string]: 180 } },
    }),
  );
  const engineWith = (loaded: MetagameIndex | null, cards: ScryfallCard[]) =>
    createDefaultScoringEngine(sourceFor(cards), async () => loaded);

  it('passes the curve through its anchors and scales by reach', () => {
    expect(shareToEquivalentRank(0.25, 'modern')).toBe(Math.round(300 / 0.9));
    expect(shareToEquivalentRank(0.01, 'modern')).toBe(Math.round(4000 / 0.9));
    expect(shareToEquivalentRank(0.05, 'pauper')).toBeGreaterThan(shareToEquivalentRank(0.05, 'modern'));
  });

  it('scores Mana Crypt on Vintage, where it is played most', async () => {
    const result = await engineWith(index, [crypt]).score(crypt);
    expect(result.deciding?.popularity.format).toBe('vintage');
    expect(result.tier.id).toBe('common');
    expect(result.rankLabel).toBe('55% of Vintage decks');
    expect(result.notes.join(' ')).toMatch(/Banned in Commander/);
  });

  it('stops a Modern staple from scoring as a deep cut', async () => {
    const commanderOnly = await createDefaultScoringEngine(sourceFor([seize])).score(seize);
    const result = await engineWith(index, [seize]).score(seize);
    expect(result.points).toBeLessThan(commanderOnly.points);
    expect(result.deciding?.popularity.format).toBe('modern');
  });

  it('leaves cards nobody plays at the maximum', async () => {
    const result = await engineWith(index, [chaff]).score(chaff);
    expect(result.points).toBe(1000);
    expect(result.deciding?.popularity.format).toBe('commander');
  });

  it('falls back to Commander alone when the snapshot is missing', async () => {
    const result = await engineWith(null, [seize]).score(seize);
    expect(result.points).toBe(pointsForEdhrecRank(3_000));
    expect(result.notes.join(' ')).toMatch(/didn't load/);
  });

  it('estimates the same obscurity synchronously', async () => {
    for (const card of [crypt, seize, chaff]) {
      const result = await engineWith(index, [card]).score(card);
      expect(estimateObscurity(card, index)).toBeCloseTo(result.obscurity, 10);
    }
  });

  it('ranks ties together within a format', () => {
    const tied = new MetagameIndex(snapshot({ legacy: { events: 1, decks: 10, cards: { a: 5, b: 5, c: 2 } } }));
    expect(tied.lookup('a', 'legacy')?.rank).toBe(1);
    expect(tied.lookup('b', 'legacy')?.rank).toBe(1);
    expect(tied.lookup('c', 'legacy')?.rank).toBe(3);
    expect(tied.lookup('a', 'modern')).toBeNull();
  });
});
