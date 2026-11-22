import { describe, expect, it } from 'vitest';
import {
  addDays,
  buildNameIndex,
  countDecks,
  extractDecklists,
  monthsBetween,
  namesWorthResolving,
  parseEventLinks,
  parseEventSlug,
  type EventDecks,
} from './parse.ts';

describe('event slugs', () => {
  it('reads format and date, with the event id glued to the day', () => {
    expect(parseEventSlug('modern-challenge-32-2026-11-2112858938')).toEqual({
      slug: 'modern-challenge-32-2026-11-2112858938',
      format: 'modern',
      date: '2026-11-21',
    });
    expect(parseEventSlug('vintage-league-2026-11-2211369')?.date).toBe('2026-11-22');
  });

  it('skips formats the game does not track', () => {
    expect(parseEventSlug('premodern-league-2026-11-2211377')).toBeNull();
    expect(parseEventSlug('duel-commander-league-2026-11-2211217')).toBeNull();
  });

  it('collects unique tracked links from an index page', () => {
    const html = `
      <a href="/decklist/legacy-league-2026-11-2211321">x</a>
      <a href="/decklist/legacy-league-2026-11-2211321">dup</a>
      <a href="/decklist/premodern-league-2026-11-2211377">skip</a>
      <a href="/decklist/pauper-challenge-16-2026-11-2112858935">y</a>`;
    expect(parseEventLinks(html).map((l) => l.format)).toEqual(['legacy', 'pauper']);
  });
});

describe('decklist extraction', () => {
  const entry = (name: string) => ({ qty: '4', card_attributes: { card_name: name } });
  const page = (data: unknown) =>
    `<script>window.MTGO = {};\nwindow.MTGO.decklists.data = ${JSON.stringify(data)};\nwindow.MTGO.decklists.type = "x";</script>`;

  it('returns distinct names per deck across main and sideboard', () => {
    const html = page({
      decklists: [
        { main_deck: [entry('Ragavan, Nimble Pilferer'), entry('Mountain')], sideboard_deck: [entry('Mountain'), entry('Wear/Tear')] },
        { main_deck: [entry('Island')] },
      ],
    });
    expect(extractDecklists(html)).toEqual([['Ragavan, Nimble Pilferer', 'Mountain', 'Wear/Tear'], ['Island']]);
  });

  it('returns null when the page has no data', () => {
    expect(extractDecklists('<html></html>')).toBeNull();
  });

  it('treats an event page served without its decks as unread', () => {
    // A slow mtgo.com serves the event details but drops the decklists.
    expect(extractDecklists(page({ playeventid: '11161', name: 'Modern League' }))).toBeNull();
    expect(extractDecklists(page({ playeventid: '11161', decklists: [] }))).toBeNull();
  });
});

describe('name index', () => {
  const index = buildNameIndex([
    { name: 'Wear // Tear', layout: 'split', oracle_id: 'wt', legalities: { vintage: 'legal' } },
    {
      name: 'Fable of the Mirror-Breaker // Reflection of Kiki-Jiki',
      layout: 'transform',
      oracle_id: 'fable',
      card_faces: [{ name: 'Fable of the Mirror-Breaker' }, { name: 'Reflection of Kiki-Jiki' }],
      legalities: { vintage: 'legal' },
    },
    { name: 'Lim-Dûl’s Vault', layout: 'normal', oracle_id: 'vault', legalities: { vintage: 'legal' } },
    { name: 'Goblin', layout: 'token', oracle_id: 'token' },
  ]);

  it("matches MTGO's split-card, front-face and unaccented spellings", () => {
    expect(index.get('weartear')).toBe('wt');
    expect(index.get('fableofthemirrorbreaker')).toBe('fable');
    expect(index.get('limdulsvault')).toBe('vault');
  });

  it('ignores tokens', () => {
    expect(index.has('goblin')).toBe(false);
  });
});

describe('deck counting', () => {
  const names = new Map([
    ['ragavannimblepilferer', 'ragavan'],
    ['mountain', 'mountain'],
    ['petcard', 'pet'],
  ]);
  const event = (decks: string[][]): EventDecks => ({ slug: 's', format: 'modern', date: '2026-11-20', decks });

  it('counts decks, not copies, and drops cards below the threshold', () => {
    const { formats, unmatched } = countDecks(
      [
        event([['Ragavan, Nimble Pilferer', 'Mountain'], ['Ragavan, Nimble Pilferer'], ['Ragavan, Nimble Pilferer', 'Pet Card']]),
        event([['Mountain', 'Mystery Card']]),
      ],
      names,
      2,
    );
    expect(formats.modern).toEqual({ events: 2, decks: 4, cards: { ragavan: 3, mountain: 2 } });
    expect([...unmatched]).toEqual([['Mystery Card', 1]]);
  });

  it('only looks up unmatched names that could reach the threshold', () => {
    const unmatched = new Map([
      ['Detect Intrusion', 37],
      ['Pet Card', 2],
      ['Zora, Spider Fancier', 58],
    ]);
    expect(namesWorthResolving(unmatched, 3)).toEqual(['Zora, Spider Fancier', 'Detect Intrusion']);
  });
});

describe('dates', () => {
  it('spans month and year boundaries', () => {
    expect(monthsBetween('2026-12-20', '2027-01-18')).toEqual([
      { year: '2026', month: '12' },
      { year: '2027', month: '01' },
    ]);
    expect(addDays('2026-11-21', -29)).toBe('2026-10-23');
  });
});
