import type { ScryfallCard } from '../types/mtg';

/** Minimal Scryfall card for tests; override only what a test cares about. */
export function makeCard(overrides: Partial<ScryfallCard> = {}): ScryfallCard {
  return {
    object: 'card',
    id: overrides.id ?? `id-${overrides.name ?? 'card'}`,
    oracle_id: overrides.oracle_id ?? `oracle-${overrides.name ?? 'card'}`,
    name: 'Test Card',
    lang: 'en',
    layout: 'normal',
    released_at: '2020-01-01',
    uri: 'https://api.scryfall.com/cards/test',
    scryfall_uri: 'https://scryfall.com/card/test',
    type_line: 'Artifact',
    oracle_text: '',
    color_identity: [],
    keywords: [],
    legalities: { commander: 'legal' },
    games: ['paper'],
    digital: false,
    reserved: false,
    set: 'tst',
    set_name: 'Test Set',
    set_type: 'expansion',
    rarity: 'rare',
    border_color: 'black',
    edhrec_rank: 5000,
    ...overrides,
  };
}
