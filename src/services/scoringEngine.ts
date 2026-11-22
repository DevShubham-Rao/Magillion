import type {
  AggregationStrategy,
  Format,
  FormatContribution,
  FormatPopularityProvider,
  NormalizedPopularity,
  ScoreResult,
  ScryfallCard,
} from '../types/mtg';
import { METAGAME_FORMATS, METAGAME_FORMAT_NAMES, type MetagameFormat } from '../types/metagame';
import { tierForPoints } from '../data/rarityTiers';
import { getOracleId, splitTypeLine } from '../lib/cardFaces';
import { daysBetween, utcDateKey } from '../lib/dates';
import type { MetagameIndex } from './metagame';

/**
 * ScoringEngine
 * =============
 *
 * Turns "how much is this card played?" into points, independent of any UI.
 *
 *   card ──► CrossFormatAggregator ──► FormatPopularityProvider(s)
 *                    │                     ├─ Commander: EDHREC rank via Scryfall
 *                    │                     └─ Standard, Pioneer, Modern, Legacy,
 *                    │                        Vintage, Pauper: share of recent
 *                    │                        Magic Online decks
 *                    ▼
 *         effective obscurity (0–1) ──► points (50–1,000) ──► rarity tier
 *
 * Every provider ends up on one scale, an EDHREC-equivalent rank fed through
 * one curve, and a card counts only as obscure as it is in its most-played
 * format.
 */

/* ------------------------------------------------------------------------ */
/* The EDHREC rank curve                                                     */
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

/**
 * About 32,700 cards carry an EDHREC rank, and the back half is mostly
 * draft filler nobody remembers. The ceiling sits at #20,000 so a real deep
 * cut can reach the top tier without needing to know the filler.
 */
export const DEFAULT_EDHREC_CURVE: EdhrecCurveConfig = {
  floorPoints: 50,
  ceilingPoints: 1000,
  ceilingRank: 20_000,
  knee: 1_800,
  provisionalRank: 6_000,
  freshWindowDays: 45,
};

/**
 * Shifted-logarithmic curve:
 *
 *   obscurity(r) = ln(1 + (r − 1) / knee) / ln(1 + (R − 1) / knee)
 *
 * With knee 1,800 and R 20,000 this gives, for example:
 *   #1 → 50 · #1,000 → 218 · #3,234 → 442 · #4,294 → 514
 *   #9,451 → 748 · #13,306 → 860 · #15,000 → 901 · #20,000+ → 1,000
 *
 * Tier thresholds land near ranks 545 (Uncommon), 2,160 (Rare),
 * 5,840 (Mythic), 12,900 (Timeshifted) and 18,650 (Serialized).
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
/* Ranks the curve is fed                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Scryfall drops the EDHREC rank of anything banned in Commander. Cards are
 * banned for being everywhere, so one that's still legal or restricted in
 * Vintage counts as this rank (an Uncommon Pick) instead of unranked.
 * Ante and dexterity cards, banned in Vintage too, get no such floor.
 */
export const BANNED_IN_COMMANDER_RANK = 1_000;

const isBasicLand = (card: ScryfallCard) => /\bBasic\b/.test(splitTypeLine(card.type_line).types);

export interface EffectiveEdhrecRank {
  rank: number | null;
  reason: 'ranked' | 'basic' | 'banned' | 'unranked';
  /** Why the rank differs from Scryfall's, when it does. */
  note?: string;
}

export function effectiveEdhrecRank(card: ScryfallCard): EffectiveEdhrecRank {
  if (isBasicLand(card)) {
    return {
      rank: 1,
      reason: 'basic',
      note: "EDHREC doesn't rank basic lands, but nearly every deck runs them, so they count as #1.",
    };
  }
  if (card.edhrec_rank != null) return { rank: card.edhrec_rank, reason: 'ranked' };
  const vintage = card.legalities.vintage;
  if (card.legalities.commander === 'banned' && (vintage === 'legal' || vintage === 'restricted')) {
    return {
      rank: BANNED_IN_COMMANDER_RANK,
      reason: 'banned',
      note: `Banned in Commander, so EDHREC has no rank for it. Banned cards are infamous, so it counts as Commander rank #${BANNED_IN_COMMANDER_RANK.toLocaleString('en-US')}.`,
    };
  }
  return { rank: null, reason: 'unranked' };
}

export interface ShareAnchor {
  share: number;
  rank: number;
}

export interface MetagameCurveConfig {
  /**
   * Two points the share → rank power law passes through. With the
   * defaults, a card in a quarter of a format's decks is as well known as
   * EDHREC #300, and one in 1% of decks as EDHREC #4,000.
   */
  anchors: readonly [ShareAnchor, ShareAnchor];
  /**
   * How widely each format's staples are known compared with Commander's.
   * The equivalent rank is divided by this, so smaller formats count for a
   * little less.
   */
  reach: Record<MetagameFormat, number>;
}

export const DEFAULT_METAGAME_CURVE: MetagameCurveConfig = {
  anchors: [
    { share: 0.25, rank: 300 },
    { share: 0.01, rank: 4_000 },
  ],
  reach: { modern: 0.9, legacy: 0.85, pioneer: 0.85, standard: 0.8, vintage: 0.75, pauper: 0.7 },
};

/**
 * EDHREC-equivalent rank for a 60-card deck share.
 *
 *   rank(s) = r₁ × (s₁ / s)^k / reach,   k = ln(r₂ / r₁) / ln(s₁ / s₂)
 *
 * In Modern (reach 0.9): 40% → #228 (95 pts), 25% → #333 (114),
 * 5% → #1,217 (247), 1% → #4,444 (524), 0.3% → #11,711 (818),
 * 0.15% → past #20,000 (1,000, no effect).
 */
export function shareToEquivalentRank(
  share: number,
  format: MetagameFormat,
  curve: MetagameCurveConfig = DEFAULT_METAGAME_CURVE,
): number {
  const [a, b] = curve.anchors;
  const k = Math.log(b.rank / a.rank) / Math.log(a.share / b.share);
  const rank = a.rank * Math.pow(a.share / Math.max(share, 1e-6), k);
  return Math.max(1, Math.round(rank / curve.reach[format]));
}

export function isMetagameFormat(format: Format): format is MetagameFormat {
  return (METAGAME_FORMATS as readonly string[]).includes(format);
}

/**
 * Synchronous best guess at a card's obscurity, for ordering candidates
 * (which "urza" is the most played?). Same math as `ScoringEngine.score`,
 * minus the fresh-card adjustment, which needs a network lookup.
 */
export function estimateObscurity(
  card: ScryfallCard,
  metagame: MetagameIndex | null,
  curve: EdhrecCurveConfig = DEFAULT_EDHREC_CURVE,
  metagameCurve: MetagameCurveConfig = DEFAULT_METAGAME_CURVE,
): number {
  let obscurity = edhrecRankToObscurity(effectiveEdhrecRank(card).rank, curve);
  if (!metagame) return obscurity;
  const oracleId = getOracleId(card);
  for (const format of metagame.formats) {
    const entry = metagame.lookup(oracleId, format);
    if (!entry) continue;
    const rank = shareToEquivalentRank(entry.share, format, metagameCurve);
    obscurity = Math.min(obscurity, edhrecRankToObscurity(rank, curve));
  }
  return obscurity;
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
 * Commander popularity from the `edhrec_rank` Scryfall embeds in every card
 * object (#1 = the most-played card on EDHREC), corrected by
 * `effectiveEdhrecRank` for basic lands and cards banned in Commander.
 *
 * Cards whose first printing is under `freshWindowDays` old haven't been
 * measured yet. They score as `provisionalRank` until EDHREC catches up.
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

    const effective = effectiveEdhrecRank(card);
    const rank = card.edhrec_rank ?? null;
    const measured = (scoredRank: number | null, note?: string): NormalizedPopularity => ({
      ...fromObscurity(format, this.label, rank, edhrecRankToObscurity(scoredRank, this.curve), 'measured', note),
      scoredRank,
    });
    if (effective.reason === 'basic') return measured(1, effective.note);

    const today = this.today();
    const printAge = daysBetween(card.released_at, today);
    if (printAge >= 0 && printAge <= this.curve.freshWindowDays) {
      const firstPrint = (await this.source.getFirstPrintReleaseDate(oracleId)) ?? card.released_at;
      const age = daysBetween(firstPrint, today);
      if (age >= 0 && age <= this.curve.freshWindowDays && (rank === null || rank > this.curve.provisionalRank)) {
        return {
          ...fromObscurity(
            format,
            this.label,
            rank,
            edhrecRankToObscurity(this.curve.provisionalRank, this.curve),
            'provisional',
            `First printed ${age} day${age === 1 ? '' : 's'} ago, so EDHREC is still counting decks. Scored as rank #${this.curve.provisionalRank.toLocaleString('en-US')} for now.`,
          ),
          scoredRank: this.curve.provisionalRank,
        };
      }
    }

    return measured(effective.rank, effective.note);
  }
}

/**
 * 60-card popularity: the share of recent Magic Online decks (league 5-0s
 * and challenge top finishes) that run a card, converted to an EDHREC-
 * equivalent rank by `shareToEquivalentRank`. Cards in no recent deck count
 * as unplayed in that format. If the snapshot can't load, every format
 * reports `unavailable` and scoring falls back to Commander alone.
 */
export class MetagamePopularityProvider implements FormatPopularityProvider {
  readonly id = 'mtgo-decklists';
  readonly label = 'Magic Online decklists';
  readonly formats = METAGAME_FORMATS;

  private readonly load: () => Promise<MetagameIndex | null>;
  private readonly curve: MetagameCurveConfig;
  private readonly edhrecCurve: EdhrecCurveConfig;

  constructor(
    load: () => Promise<MetagameIndex | null>,
    curve: MetagameCurveConfig = DEFAULT_METAGAME_CURVE,
    edhrecCurve: EdhrecCurveConfig = DEFAULT_EDHREC_CURVE,
  ) {
    this.load = load;
    this.curve = curve;
    this.edhrecCurve = edhrecCurve;
  }

  async getCardPopularity(oracleId: string, format: Format): Promise<NormalizedPopularity> {
    if (!isMetagameFormat(format)) return unavailable(format, this.label);
    const index = await this.load();
    if (!index) {
      return unavailable(format, this.label, "Recent 60-card decklists didn't load, so this score uses Commander play only.");
    }
    if (!index.has(format)) return unavailable(format, this.label);
    const sampleSize = index.snapshot.formats[format]?.decks ?? 0;
    const entry = index.lookup(oracleId, format);
    if (!entry) {
      return { ...fromObscurity(format, this.label, null, 1, 'measured'), scoredRank: null, share: 0, sampleSize };
    }
    const scoredRank = shareToEquivalentRank(entry.share, format, this.curve);
    return {
      ...fromObscurity(format, this.label, entry.rank, edhrecRankToObscurity(scoredRank, this.edhrecCurve), 'measured'),
      scoredRank,
      share: entry.share,
      sampleSize,
    };
  }
}

/**
 * Generic provider for any format whose popularity arrives as a ranked list
 * (your own backend, another site's export). Feed it `oracleId → rank` per
 * format plus the size of the played pool; cards absent from the table
 * count as unplayed.
 *
 *   const modern = new RankTablePopularityProvider('my-modern', 'My data', {
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

export interface Aggregate {
  obscurity: number;
  contributions: FormatContribution[];
  /** The contribution that set the result (the primary format unless another beat it). */
  deciding: FormatContribution | null;
}

/**
 * Combines per-format popularity into one effective obscurity.
 *
 *  - `max-popularity` treats a card as only as obscure as it is in its most
 *    played format. Each secondary format's popularity is scaled by its
 *    weight before comparing. This is what the game uses.
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

  async aggregate(oracleId: string): Promise<Aggregate> {
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
    let deciding: FormatContribution | null = primary ?? null;
    switch (this.strategy.kind) {
      case 'primary-only':
        break;
      case 'max-popularity': {
        let maxPopularity = 1 - primaryObscurity;
        for (const c of secondaries) {
          const weighted = c.popularity.popularity * c.weight;
          if (weighted > maxPopularity) {
            maxPopularity = weighted;
            deciding = c;
          }
        }
        obscurity = 1 - maxPopularity;
        break;
      }
      case 'weighted-penalty': {
        const raw = secondaries.reduce((sum, c) => sum + c.popularity.popularity * c.weight, 0);
        obscurity = primaryObscurity * (1 - Math.min(this.strategy.maxPenalty, raw));
        break;
      }
    }

    return { obscurity: Math.min(1, Math.max(0, obscurity)), contributions, deciding };
  }
}

/* ------------------------------------------------------------------------ */
/* Engine                                                                    */
/* ------------------------------------------------------------------------ */

export function formatRankLabel(rank: number | null): string {
  return rank == null ? 'Not ranked on EDHREC' : `EDHREC Rank #${rank.toLocaleString('en-US')}`;
}

/** "24%", "3.4%", "0.6%". */
export function formatShare(share: number): string {
  const pct = share * 100;
  return `${pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%`;
}

export const FORMAT_NAMES: Record<Format, string> = {
  commander: 'Commander',
  premodern: 'Premodern',
  ...METAGAME_FORMAT_NAMES,
};

/** One line describing a format's measurement, e.g. "24% of Modern decks". */
export function describePopularity(popularity: NormalizedPopularity): string {
  const name = FORMAT_NAMES[popularity.format];
  if (popularity.format === 'commander') {
    if (popularity.rank != null) return formatRankLabel(popularity.rank);
    if (popularity.scoredRank === 1) return 'Basic land';
    if (popularity.scoredRank === BANNED_IN_COMMANDER_RANK) return 'Banned in Commander';
    return 'Not ranked on EDHREC';
  }
  if (popularity.share && popularity.share > 0) return `${formatShare(popularity.share)} of ${name} decks`;
  return `No recent ${name} decks`;
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
    const { obscurity, contributions, deciding } = await this.aggregator.aggregate(getOracleId(card));
    const points = obscurityToPoints(obscurity, this.curve);
    const edhrecRank = card.edhrec_rank ?? null;
    const notes = [...new Set(contributions.map((c) => c.popularity.note).filter((n): n is string => Boolean(n)))];
    return {
      points,
      obscurity,
      tier: tierForPoints(points),
      edhrecRank,
      rankLabel: deciding ? describePopularity(deciding.popularity) : formatRankLabel(edhrecRank),
      contributions,
      deciding,
      strategy: this.aggregator.strategyKind,
      notes,
    };
  }
}

/**
 * Commander via EDHREC plus, when a metagame loader is given, every 60-card
 * format in the snapshot, combined with `max-popularity`: a card scores as
 * obscure as it is in its most-played format. Format reach is applied
 * inside the metagame curve, so every registration weighs 1.
 */
export function createDefaultScoringEngine(
  source: CardSource,
  loadMetagame?: () => Promise<MetagameIndex | null>,
): ScoringEngine {
  const registrations: ProviderRegistration[] = [
    { provider: new EdhrecPopularityProvider(source), format: 'commander', weight: 1 },
  ];
  if (loadMetagame) {
    const metagame = new MetagamePopularityProvider(loadMetagame);
    for (const format of METAGAME_FORMATS) registrations.push({ provider: metagame, format, weight: 1 });
  }
  const aggregator = new CrossFormatAggregator(
    'commander',
    registrations,
    loadMetagame ? { kind: 'max-popularity', weights: {} } : { kind: 'primary-only' },
  );
  return new ScoringEngine(aggregator, DEFAULT_EDHREC_CURVE, source);
}
