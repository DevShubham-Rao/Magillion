import type {
  AggregationStrategy,
  Format,
  FormatContribution,
  FormatPopularityProvider,
  NormalizedPopularity,
  ScoreResult,
  ScryfallCard,
} from '../types/mtg';
import { tierForPoints } from '../data/rarityTiers';
import { getOracleId, splitTypeLine } from '../lib/cardFaces';
import { daysBetween, utcDateKey } from '../lib/dates';

/**
 * ScoringEngine
 * =============
 *
 * Turns "how much is this card played?" into points, independent of any UI.
 *
 *   card ──► CrossFormatAggregator ──► FormatPopularityProvider(s)
 *                    │                     └─ v1: EDHREC rank via Scryfall
 *                    ▼
 *         effective obscurity (0–1) ──► points (50–1,000) ──► rarity tier
 *
 * Providers normalise their raw data (ranks, deck counts, metagame share) to
 * a 0–1 popularity for one format. The aggregator combines formats with a
 * strategy, and the engine maps the result onto the points curve.
 */

/* ------------------------------------------------------------------------ */
/* v1: the EDHREC rank curve                                                 */
/* ------------------------------------------------------------------------ */

export interface EdhrecCurveConfig {
  /** Points for the single most-played card (EDHREC rank #1). */
  floorPoints: number;
  /** Points for unranked cards and anything at or beyond `ceilingRank`. */
  ceilingPoints: number;
  ceilingRank: number;
  /**
   * Where the curve bends. Below the knee points rise slowly (the top few
   * thousand cards are all staples); above it they climb steeply.
   */
  knee: number;
  /** Rank assumed for cards too new for EDHREC to have measured. */
  provisionalRank: number;
  /** A card whose first printing is younger than this is "fresh". */
  freshWindowDays: number;
}

export const DEFAULT_EDHREC_CURVE: EdhrecCurveConfig = {
  floorPoints: 50,
  ceilingPoints: 1000,
  ceilingRank: 25_000,
  knee: 4_000,
  provisionalRank: 6_000,
  freshWindowDays: 45,
};

/**
 * Shifted-logarithmic curve:
 *
 *   obscurity(r) = ln(1 + (r − 1) / knee) / ln(1 + (R − 1) / knee)
 *
 * With knee 4,000 and R 25,000 this gives, for example:
 *   #1 → 50 · #1,000 → 157 · #3,234 → 334 · #4,294 → 400
 *   #9,451 → 632 · #13,306 → 752 · #20,000 → 909 · #24,000 → 983
 *
 * Tier thresholds land near ranks 940 (Uncommon), 3,500 (Rare),
 * 8,600 (Mythic), 17,200 (Timeshifted) and 23,600 (Serialized).
 */
export function edhrecRankToObscurity(
  rank: number | null | undefined,
  curve: EdhrecCurveConfig = DEFAULT_EDHREC_CURVE,
): number {
  if (rank == null) return 1;
  if (rank <= 1) return 0;
  if (rank >= curve.ceilingRank) return 1;
  const value = Math.log1p((rank - 1) / curve.knee) / Math.log1p((curve.ceilingRank - 1) / curve.knee);
  return Math.min(1, Math.max(0, value));
}

export function obscurityToPoints(obscurity: number, curve: EdhrecCurveConfig = DEFAULT_EDHREC_CURVE): number {
  const o = Math.min(1, Math.max(0, obscurity));
  return Math.round(curve.floorPoints + (curve.ceilingPoints - curve.floorPoints) * o);
}

export function pointsForEdhrecRank(rank: number | null, curve: EdhrecCurveConfig = DEFAULT_EDHREC_CURVE): number {
  return obscurityToPoints(edhrecRankToObscurity(rank, curve), curve);
}

/* ------------------------------------------------------------------------ */
/* Providers                                                                 */
/* ------------------------------------------------------------------------ */

/** Where providers get card objects. `ScryfallService` implements this. */
export interface CardSource {
  getCardByOracleId(oracleId: string): Promise<ScryfallCard | null>;
  getFirstPrintReleaseDate(oracleId: string): Promise<string | null>;
  remember?(card: ScryfallCard): void;
}

function unavailable(format: Format, source: string, note?: string): NormalizedPopularity {
  return { format, source, rank: null, popularity: 0, obscurity: 1, confidence: 'unavailable', note };
}

function fromObscurity(
  format: Format,
  source: string,
  rank: number | null,
  obscurity: number,
  confidence: NormalizedPopularity['confidence'],
  note?: string,
): NormalizedPopularity {
  return { format, source, rank, popularity: 1 - obscurity, obscurity, confidence, note };
}

/**
 * v1 provider: Commander popularity from the `edhrec_rank` Scryfall embeds
 * in every card object (#1 = the most-played card on EDHREC).
 *
 * Two corrections keep the daily game fair:
 *  - Basic lands are excluded from EDHREC rankings but appear in nearly every
 *    deck, so they count as rank #1 rather than "unranked".
 *  - Cards whose first printing is under `freshWindowDays` old haven't been
 *    measured yet. They score as `provisionalRank` until EDHREC catches up.
 */
export class EdhrecPopularityProvider implements FormatPopularityProvider {
  readonly id = 'edhrec-scryfall';
  readonly label = 'EDHREC via Scryfall';
  readonly formats = ['commander'] as const;

  private readonly source: CardSource;
  private readonly curve: EdhrecCurveConfig;
  private readonly today: () => string;

  constructor(source: CardSource, curve: EdhrecCurveConfig = DEFAULT_EDHREC_CURVE, today: () => string = utcDateKey) {
    this.source = source;
    this.curve = curve;
    this.today = today;
  }

  async getCardPopularity(oracleId: string, format: Format): Promise<NormalizedPopularity> {
    if (format !== 'commander') return unavailable(format, this.label);
    const card = await this.source.getCardByOracleId(oracleId);
    if (!card) return unavailable(format, this.label, 'Card not found on Scryfall.');

    if (/\bBasic\b/.test(splitTypeLine(card.type_line).types)) {
      return fromObscurity(
        format,
        this.label,
        null,
        0,
        'measured',
        "EDHREC doesn't rank basic lands, but nearly every deck runs them, so they count as #1.",
      );
    }

    const rank = card.edhrec_rank ?? null;
    const today = this.today();
    const printAge = daysBetween(card.released_at, today);

    if (printAge >= 0 && printAge <= this.curve.freshWindowDays) {
      const firstPrint = (await this.source.getFirstPrintReleaseDate(oracleId)) ?? card.released_at;
      const age = daysBetween(firstPrint, today);
      if (age >= 0 && age <= this.curve.freshWindowDays && (rank === null || rank > this.curve.provisionalRank)) {
        return fromObscurity(
          format,
          this.label,
          rank,
          edhrecRankToObscurity(this.curve.provisionalRank, this.curve),
          'provisional',
          `First printed ${age} day${age === 1 ? '' : 's'} ago, so EDHREC is still counting decks. Scored as rank #${this.curve.provisionalRank.toLocaleString('en-US')} for now.`,
        );
      }
    }

    if (rank === null) {
      return fromObscurity(format, this.label, null, 1, 'measured', 'No EDHREC decklist runs this card.');
    }
    return fromObscurity(format, this.label, rank, edhrecRankToObscurity(rank, this.curve), 'measured');
  }
}

/**
 * Generic provider for any format whose popularity arrives as a ranked list
 * (MTGDecks, MTGGoldfish or MTGTop8 exports, a scraped metagame snapshot,
 * your own backend). Feed it `oracleId → rank` per format plus the size of
 * the played pool; cards absent from the table count as unplayed.
 *
 *   const modern = new RankTablePopularityProvider('mtgdecks-modern', 'MTGDecks', {
 *     modern: { ranks: new Map([[ragavanOracleId, 3], ...]), poolSize: 1800 },
 *   });
 */
export class RankTablePopularityProvider implements FormatPopularityProvider {
  readonly id: string;
  readonly label: string;
  readonly formats: readonly Format[];
  private readonly tables: Partial<Record<Format, { ranks: Map<string, number>; poolSize: number }>>;

  constructor(
    id: string,
    label: string,
    tables: Partial<Record<Format, { ranks: Map<string, number>; poolSize: number }>>,
  ) {
    this.id = id;
    this.label = label;
    this.tables = tables;
    this.formats = Object.keys(tables) as Format[];
  }

  async getCardPopularity(oracleId: string, format: Format): Promise<NormalizedPopularity> {
    const table = this.tables[format];
    if (!table) return unavailable(format, this.label);
    const rank = table.ranks.get(oracleId) ?? null;
    if (rank === null) return fromObscurity(format, this.label, null, 1, 'measured');
    const knee = Math.max(1, table.poolSize / 6);
    const obscurity = Math.min(1, Math.log1p((rank - 1) / knee) / Math.log1p(Math.max(1, table.poolSize - 1) / knee));
    return fromObscurity(format, this.label, rank, obscurity, 'measured');
  }
}

/* ------------------------------------------------------------------------ */
/* Cross-format aggregation                                                  */
/* ------------------------------------------------------------------------ */

export interface ProviderRegistration {
  provider: FormatPopularityProvider;
  format: Format;
  /** Default weight when the strategy doesn't set one. 0–1. */
  weight: number;
}

/**
 * Combines per-format popularity into one effective obscurity.
 *
 * Why this exists: a Modern staple like Ragavan or Thoughtseize may be only
 * middling in Commander, and v1 would happily pay 700+ points for it. With
 * a Modern provider registered, either strategy closes that gap:
 *
 *  - `max-popularity` treats a card as only as obscure as it is in its most
 *    played format. Thoughtseize at 0.95 Modern popularity with weight 0.8
 *    has an effective popularity of max(commander, 0.76), so it can't score
 *    above about 280 points.
 *
 *  - `weighted-penalty` keeps Commander as the baseline and shaves off
 *    Σ(weight × popularity) elsewhere, capped at `maxPenalty`. Gentler, and
 *    better when secondary data is noisy.
 *
 * Providers that report `unavailable` are ignored, so registering a format
 * with partial data never punishes a card the provider doesn't know.
 */
export class CrossFormatAggregator {
  private readonly primaryFormat: Format;
  private readonly registrations: ProviderRegistration[];
  private readonly strategy: AggregationStrategy;

  constructor(primaryFormat: Format, registrations: ProviderRegistration[], strategy: AggregationStrategy) {
    this.primaryFormat = primaryFormat;
    this.registrations = registrations;
    this.strategy = strategy;
  }

  get strategyKind(): AggregationStrategy['kind'] {
    return this.strategy.kind;
  }

  private weightFor(registration: ProviderRegistration): number {
    if (registration.format === this.primaryFormat) return 1;
    if (this.strategy.kind === 'primary-only') return 0;
    return this.strategy.weights[registration.format] ?? registration.weight;
  }

  async aggregate(oracleId: string): Promise<{ obscurity: number; contributions: FormatContribution[] }> {
    const contributions = await Promise.all(
      this.registrations.map(async (registration): Promise<FormatContribution> => {
        const popularity = await registration.provider
          .getCardPopularity(oracleId, registration.format)
          .catch(() => unavailable(registration.format, registration.provider.label, 'Provider failed.'));
        return { popularity, weight: this.weightFor(registration) };
      }),
    );

    const usable = contributions.filter((c) => c.popularity.confidence !== 'unavailable');
    const primary = usable.find((c) => c.popularity.format === this.primaryFormat);
    const primaryObscurity = primary?.popularity.obscurity ?? 1;
    const secondaries = usable.filter((c) => c !== primary && c.weight > 0);

    let obscurity = primaryObscurity;
    switch (this.strategy.kind) {
      case 'primary-only':
        break;
      case 'max-popularity': {
        let maxPopularity = 1 - primaryObscurity;
        for (const c of secondaries) maxPopularity = Math.max(maxPopularity, c.popularity.popularity * c.weight);
        obscurity = 1 - maxPopularity;
        break;
      }
      case 'weighted-penalty': {
        const raw = secondaries.reduce((sum, c) => sum + c.popularity.popularity * c.weight, 0);
        obscurity = primaryObscurity * (1 - Math.min(this.strategy.maxPenalty, raw));
        break;
      }
    }

    return { obscurity: Math.min(1, Math.max(0, obscurity)), contributions };
  }
}

/* ------------------------------------------------------------------------ */
/* Engine                                                                    */
/* ------------------------------------------------------------------------ */

export function formatRankLabel(rank: number | null): string {
  return rank == null ? 'Not ranked on EDHREC' : `EDHREC Rank #${rank.toLocaleString('en-US')}`;
}

export class ScoringEngine {
  private readonly aggregator: CrossFormatAggregator;
  private readonly curve: EdhrecCurveConfig;
  private readonly source?: CardSource;

  constructor(aggregator: CrossFormatAggregator, curve: EdhrecCurveConfig = DEFAULT_EDHREC_CURVE, source?: CardSource) {
    this.aggregator = aggregator;
    this.curve = curve;
    this.source = source;
  }

  async score(card: ScryfallCard): Promise<ScoreResult> {
    this.source?.remember?.(card);
    const { obscurity, contributions } = await this.aggregator.aggregate(getOracleId(card));
    const points = obscurityToPoints(obscurity, this.curve);
    const edhrecRank = card.edhrec_rank ?? null;
    const notes = contributions.map((c) => c.popularity.note).filter((n): n is string => Boolean(n));
    return {
      points,
      obscurity,
      tier: tierForPoints(points),
      edhrecRank,
      rankLabel: formatRankLabel(edhrecRank),
      contributions,
      strategy: this.aggregator.strategyKind,
      notes,
    };
  }
}

/** v1 wiring: Commander only, EDHREC rank via Scryfall. */
export function createDefaultScoringEngine(source: CardSource): ScoringEngine {
  const edhrec = new EdhrecPopularityProvider(source);
  const aggregator = new CrossFormatAggregator(
    'commander',
    [{ provider: edhrec, format: 'commander', weight: 1 }],
    { kind: 'primary-only' },
  );
  return new ScoringEngine(aggregator, DEFAULT_EDHREC_CURVE, source);
}
