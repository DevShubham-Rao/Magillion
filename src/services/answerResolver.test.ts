import { describe, expect, it } from 'vitest';
import { resolveAnswer, type ResolverSource } from './answerResolver';
import { questionById } from '../data/questionPool';
import { NameIndex } from '../lib/fuzzy';
import { makeCard } from '../test/fixtures';
import { isTournamentCard } from './cardEligibility';
import type { ScryfallCard } from '../types/mtg';

const CARDS: ScryfallCard[] = [
  makeCard({ name: "Urza's Saga", type_line: 'Enchantment Land — Urza’s Saga', edhrec_rank: 116 }),
  makeCard({ name: 'Urza, Lord High Artificer', type_line: 'Legendary Creature — Human Artificer', edhrec_rank: 794 }),
  makeCard({ name: 'Urza, Chief Artificer', type_line: 'Legendary Creature — Human Artificer', edhrec_rank: 9000 }),
  makeCard({ name: 'Urza', type_line: 'Vanguard', layout: 'vanguard', legalities: { commander: 'not_legal' }, edhrec_rank: null }),
  makeCard({ name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.', edhrec_rank: 1 }),
  makeCard({
    name: 'Mana Crypt',
    type_line: 'Artifact',
    edhrec_rank: null,
    legalities: { commander: 'banned', vintage: 'restricted' },
  }),
  makeCard({ name: 'Mana Vault', type_line: 'Artifact', edhrec_rank: 70 }),
  makeCard({
    name: 'The Whizzer, Classic Speedster',
    type_line: 'Legendary Creature — Human Hero',
    oracle_text: 'Haste',
    edhrec_rank: 30_189,
  }),
];

const byName = new Map(CARDS.map((c) => [c.name.toLowerCase(), c]));
const words = (q: string) => [...q.matchAll(/"([^"]+)"/g)].map((m) => (m[1] ?? '').toLowerCase());

/** In-memory stand-in for Scryfall that understands the queries the resolver sends. */
const source: ResolverSource = {
  getCardByExactName: async (name) => byName.get(name.toLowerCase()) ?? null,
  getCardByFuzzyName: async () => null,
  getNameIndex: async () => new NameIndex(CARDS.map((c) => c.name)),
  searchByPopularity: async (query) => {
    let cards = CARDS;
    if (query.startsWith('(!')) {
      const wanted = words(query);
      cards = cards.filter((c) => wanted.includes(c.name.toLowerCase()));
    } else {
      const tokens = words(query);
      cards = cards.filter((c) => tokens.every((t) => c.name.toLowerCase().includes(t)));
      if (query.includes('banned:commander')) cards = cards.filter(isTournamentCard);
      if (query.includes('t:legendary t:creature')) cards = cards.filter((c) => /Legendary Creature/.test(c.type_line));
      if (query.includes('t:artifact')) cards = cards.filter((c) => /Artifact/.test(c.type_line));
    }
    const sorted = [...cards].sort((a, b) => (a.edhrec_rank ?? Infinity) - (b.edhrec_rank ?? Infinity));
    return { cards: sorted, total: sorted.length };
  },
};

const legendary = questionById('legendary-creature')!;
const flying = questionById('flying-creature')!;
const artifact = questionById('artifact')!;
const commanderLegal = questionById('commander-legal')!;
const ctx = (question = legendary, used: string[] = []) => ({ question, usedOracleIds: new Set(used), today: '2026-11-22' });

describe('resolveAnswer', () => {
  it('finishes a partial name as the most-played card that fits', async () => {
    const result = await resolveAnswer('urza', ctx(), source);
    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') return;
    expect(result.card.name).toBe('Urza, Lord High Artificer');
    expect(result.kind).toBe('completed');
    expect(result.note).toMatch(/most-played/);
  });

  it('skips cards already used and takes the next most-played', async () => {
    const used = CARDS[1]?.oracle_id as string;
    const result = await resolveAnswer('urza', ctx(legendary, [used]), source);
    expect(result.status === 'accepted' && result.card.name).toBe('Urza, Chief Artificer');
  });

  it('takes an exact name at its word, even when it does not fit', async () => {
    const result = await resolveAnswer('Sol Ring', ctx(flying), source);
    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') return;
    expect(result.reason).toBe('criteria');
    expect(result.costsAttempt).toBe(true);
  });

  it('does not charge an attempt for naming a used card again', async () => {
    const used = CARDS[1]?.oracle_id as string;
    const result = await resolveAnswer('Urza, Lord High Artificer', ctx(legendary, [used]), source);
    expect(result.status === 'rejected' && result.costsAttempt).toBe(false);
  });

  it('corrects typos the contains search cannot find', async () => {
    const result = await resolveAnswer('the wizzer', ctx(), source);
    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') return;
    expect(result.card.name).toBe('The Whizzer, Classic Speedster');
    expect(result.kind).toBe('corrected');
  });

  it('reports unknown names without charging an attempt', async () => {
    const result = await resolveAnswer('qqqqxxxx', ctx(), source);
    expect(result.status).toBe('not_found');
  });

  it('accepts cards banned in Commander', async () => {
    const result = await resolveAnswer('Mana Crypt', ctx(artifact), source);
    expect(result.status === 'accepted' && result.card.name).toBe('Mana Crypt');
  });

  it('still turns banned cards away from the Commander-legal prompt', async () => {
    const result = await resolveAnswer('Mana Crypt', ctx(commanderLegal), source);
    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') return;
    expect(result.title).toBe('Banned in Commander');
    expect(result.costsAttempt).toBe(true);
  });

  it('finishes partial names by the ranking the context supplies', async () => {
    // EDHREC alone would pick Mana Vault (#70); 60-card play makes Mana Crypt the most played.
    const byEdhrec = await resolveAnswer('mana', ctx(artifact), source);
    expect(byEdhrec.status === 'accepted' && byEdhrec.card.name).toBe('Mana Vault');
    const played = await resolveAnswer('mana', { ...ctx(artifact), popularityKey: (c) => (c.name === 'Mana Crypt' ? 0 : 1) }, source);
    expect(played.status === 'accepted' && played.card.name).toBe('Mana Crypt');
  });
});
