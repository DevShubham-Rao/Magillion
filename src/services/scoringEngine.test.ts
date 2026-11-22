import { describe, expect, it } from 'vitest';
import {
  CrossFormatAggregator,
  EdhrecPopularityProvider,
  RankTablePopularityProvider,
  ScoringEngine,
  createDefaultScoringEngine,
  edhrecRankToObscurity,
  pointsForEdhrecRank,
  type CardSource,
} from './scoringEngine';
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
    expect(pointsForEdhrecRank(25_000)).toBe(1000);
    expect(pointsForEdhrecRank(32_700)).toBe(1000);
    expect(pointsForEdhrecRank(null)).toBe(1000);
  });

  it('never decreases as rank grows', () => {
    let previous = -1;
    for (let rank = 1; rank <= 26_000; rank += 37) {
      const o = edhrecRankToObscurity(rank);
      expect(o).toBeGreaterThanOrEqual(previous);
      previous = o;
    }
  });

  it('lands well-known cards in sensible tiers (live ranks as of Nov 2026)', () => {
    expect(tierForPoints(pointsForEdhrecRank(1)).id).toBe('common'); // Sol Ring
    expect(tierForPoints(pointsForEdhrecRank(3234)).id).toBe('uncommon'); // Jace, the Mind Sculptor
    expect(tierForPoints(pointsForEdhrecRank(4294)).id).toBe('rare'); // Vraska, Golgari Queen
    expect(tierForPoints(pointsForEdhrecRank(9451)).id).toBe('mythic'); // Serra Angel
    expect(tierForPoints(pointsForEdhrecRank(20_000)).id).toBe('timeshifted');
    expect(tierForPoints(pointsForEdhrecRank(24_500)).id).toBe('serialized');
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
