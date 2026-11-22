/**
 * Core domain types for Magillion.
 *
 * Scryfall object shapes follow https://scryfall.com/docs/api/cards. Only the
 * fields the game reads are declared; everything else Scryfall returns is
 * carried along untouched.
 */

/* ------------------------------------------------------------------------ */
/* Formats                                                                   */
/* ------------------------------------------------------------------------ */

export const FORMATS = [
  'commander',
  'modern',
  'standard',
  'pioneer',
  'pauper',
  'premodern',
  'legacy',
  'vintage',
] as const;

export type Format = (typeof FORMATS)[number];

export type LegalityStatus = 'legal' | 'not_legal' | 'banned' | 'restricted';

/* ------------------------------------------------------------------------ */
/* Scryfall objects                                                          */
/* ------------------------------------------------------------------------ */

export type CardLayout =
  | 'normal'
  | 'split'
  | 'flip'
  | 'transform'
  | 'modal_dfc'
  | 'meld'
  | 'leveler'
  | 'class'
  | 'case'
  | 'saga'
  | 'adventure'
  | 'mutate'
  | 'prototype'
  | 'battle'
  | 'planar'
  | 'scheme'
  | 'vanguard'
  | 'token'
  | 'double_faced_token'
  | 'emblem'
  | 'augment'
  | 'host'
  | 'art_series'
  | 'reversible_card'
  | (string & {});

export interface ImageUris {
  small: string;
  normal: string;
  large: string;
  png: string;
  art_crop: string;
  border_crop: string;
}

export interface ScryfallCardFace {
  object: 'card_face';
  name: string;
  oracle_id?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  flavor_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  colors?: string[];
  artist?: string;
  image_uris?: ImageUris;
}

export interface ScryfallRelatedCard {
  object: 'related_card';
  id: string;
  component: 'token' | 'meld_part' | 'meld_result' | 'combo_piece';
  name: string;
  type_line: string;
  uri: string;
}

export interface ScryfallCard {
  object: 'card';
  id: string;
  oracle_id?: string;
  name: string;
  lang: string;
  layout: CardLayout;
  released_at: string;
  uri: string;
  scryfall_uri: string;
  prints_search_uri?: string;
  mana_cost?: string;
  cmc?: number;
  type_line: string;
  oracle_text?: string;
  flavor_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  colors?: string[];
  color_identity: string[];
  keywords: string[];
  legalities: Partial<Record<Format, LegalityStatus>> & Record<string, LegalityStatus>;
  games: string[];
  digital: boolean;
  reserved: boolean;
  set: string;
  set_name: string;
  set_type: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'mythic' | 'special' | 'bonus';
  artist?: string;
  border_color: 'black' | 'white' | 'borderless' | 'silver' | 'gold' | 'yellow' | (string & {});
  security_stamp?: 'oval' | 'triangle' | 'acorn' | 'circle' | 'arena' | 'heart' | (string & {});
  edhrec_rank?: number | null;
  penny_rank?: number | null;
  game_changer?: boolean;
  image_uris?: ImageUris;
  card_faces?: ScryfallCardFace[];
  all_parts?: ScryfallRelatedCard[];
}

export interface ScryfallList<T> {
  object: 'list';
  data: T[];
  has_more: boolean;
  next_page?: string;
  total_cards?: number;
  warnings?: string[];
}

export interface ScryfallError {
  object: 'error';
  code: string;
  status: number;
  details: string;
  type?: string;
  warnings?: string[];
}

export interface ScryfallCardSymbol {
  object: 'card_symbol';
  symbol: string;
  svg_uri?: string;
  english: string;
  represents_mana: boolean;
}

/** A face normalised from either `card_faces` or the top-level card fields. */
export interface CardFace {
  name: string;
  manaCost: string;
  typeLine: string;
  oracleText: string;
  flavorText?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  artist?: string;
  imageUris?: ImageUris;
}

/* ------------------------------------------------------------------------ */
/* Questions                                                                 */
/* ------------------------------------------------------------------------ */

export type QuestionCategory =
  | 'card-type'
  | 'supertype'
  | 'keyword'
  | 'mechanic'
  | 'format'
  | 'stats'
  | 'lore'
  | 'plane';

/** `active` questions rotate into gauntlets; `experimental` ones are opt-in. */
export type QuestionStatus = 'active' | 'experimental';

export interface ValidationPass {
  ok: true;
  /** The face that satisfied the prompt when it wasn't the front face. */
  matchedFace?: string;
  note?: string;
}

export interface ValidationFailure {
  ok: false;
  title: string;
  reason: string;
}

export type ValidationResult = ValidationPass | ValidationFailure;

export interface QuestionDefinition {
  id: string;
  /** The prompt as shown to the player, e.g. "Name a Planeswalker." */
  prompt: string;
  /** Short label used in summaries and share text, e.g. "Planeswalker". */
  shortLabel: string;
  /** Rules clarification shown under the prompt. */
  hint: string;
  category: QuestionCategory;
  status: QuestionStatus;
  /**
   * Scryfall search syntax describing the valid pool (without the format
   * filter). Used for the post-reveal "rarest answers" link and as
   * documentation for anyone adding questions.
   */
  scryfallQueryHint: string;
  validatorFn: (card: ScryfallCard) => ValidationResult;
}

/* ------------------------------------------------------------------------ */
/* Rarity tiers                                                              */
/* ------------------------------------------------------------------------ */

export type RarityTierId =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'mythic'
  | 'timeshifted'
  | 'serialized';

export interface RarityTier {
  id: RarityTierId;
  order: 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  /** Longer ceremonial name used on the reveal. */
  title: string;
  tagline: string;
  minPoints: number;
  maxPoints: number;
  /** Primary swatch for text and meters. */
  color: string;
  /** Gradient stops for gems and frames, light to dark. */
  stops: readonly [string, string, string];
  /** CSS gradient for the metallic card frame. */
  frameGradient: string;
  /** CSS box-shadow glow used around the revealed card. */
  glow: string;
  /** 0–1 opacity of the holographic foil layer. */
  foilIntensity: number;
  /** Motes released by the reveal burst. */
  particleCount: number;
  /** Square used in the share grid. */
  emoji: string;
}

/* ------------------------------------------------------------------------ */
/* Popularity providers & scoring                                            */
/* ------------------------------------------------------------------------ */

export type PopularityConfidence = 'measured' | 'provisional' | 'unavailable';

/**
 * A provider's view of how played a card is in one format, normalised so
 * providers with different raw data (ranks, deck counts, metagame share) can
 * be compared.
 */
export interface NormalizedPopularity {
  format: Format;
  /** Human-readable data source, e.g. "EDHREC via Scryfall". */
  source: string;
  /** The provider's raw rank (1 = most played), when it has one. */
  rank: number | null;
  /** 0 = never played, 1 = the most played card in the format. */
  popularity: number;
  /** 1 − popularity, kept explicit so callers never invert by mistake. */
  obscurity: number;
  confidence: PopularityConfidence;
  note?: string;
}

export interface FormatPopularityProvider {
  readonly id: string;
  readonly label: string;
  readonly formats: readonly Format[];
  getCardPopularity(oracleId: string, format: Format): Promise<NormalizedPopularity>;
}

export type AggregationStrategy =
  /** v1: only the primary format (Commander) counts. */
  | { kind: 'primary-only' }
  /**
   * A card is only as obscure as it is in its most-played format. Each
   * secondary format's popularity is scaled by its weight before comparing.
   */
  | { kind: 'max-popularity'; weights: Partial<Record<Format, number>> }
  /**
   * Start from primary-format obscurity and subtract a weighted penalty for
   * popularity elsewhere, capped at `maxPenalty` (0–1).
   */
  | { kind: 'weighted-penalty'; weights: Partial<Record<Format, number>>; maxPenalty: number };

export interface FormatContribution {
  popularity: NormalizedPopularity;
  weight: number;
}

export interface ScoreResult {
  points: number;
  /** Effective obscurity after aggregation, 0–1. */
  obscurity: number;
  tier: RarityTier;
  edhrecRank: number | null;
  rankLabel: string;
  contributions: FormatContribution[];
  strategy: AggregationStrategy['kind'];
  notes: string[];
}
