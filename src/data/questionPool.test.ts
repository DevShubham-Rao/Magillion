import { describe, expect, it } from 'vitest';
import { ACTIVE_QUESTIONS, DAILY_QUESTION_COUNT, QUESTION_POOL, questionById, selectDailyQuestions } from './questionPool';
import { makeCard } from '../test/fixtures';
import { checkCardEligibility } from '../services/cardEligibility';
import { sanitizeInput } from '../services/scryfallService';

const q = (id: string) => {
  const question = questionById(id);
  if (!question) throw new Error(`Missing question ${id}`);
  return question;
};

describe('daily selection', () => {
  it('is deterministic per UTC day and has no repeats', () => {
    const a = selectDailyQuestions('2026-11-21').map((x) => x.id);
    const b = selectDailyQuestions('2026-11-21').map((x) => x.id);
    expect(a).toEqual(b);
    expect(a).toHaveLength(DAILY_QUESTION_COUNT);
    expect(new Set(a).size).toBe(DAILY_QUESTION_COUNT);
  });

  it('changes between days', () => {
    const days = ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24'].map((d) => selectDailyQuestions(d).map((x) => x.id).join());
    expect(new Set(days).size).toBeGreaterThan(1);
  });

  it('deals seven prompts, each from a different category', () => {
    for (const day of ['2026-11-22', '2026-11-23', '2027-01-01', '2027-06-15']) {
      const picked = selectDailyQuestions(day);
      expect(picked).toHaveLength(7);
      expect(new Set(picked.map((x) => x.category)).size).toBe(7);
    }
  });

  it('ships a large pool with unique ids, keeping the original prompt ids', () => {
    expect(ACTIVE_QUESTIONS.length).toBeGreaterThan(300);
    const ids = QUESTION_POOL.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    const originals = ['planeswalker', 'legendary-creature', 'commander-legal', 'enchantment', 'artifact', 'instant', 'sorcery'];
    originals.push('land', 'flying-creature', 'activated-ability', 'power-seven', 'dragon', 'phyrexian');
    for (const id of originals) expect(questionById(id), id).toBeDefined();
  });

  it('gives every prompt a hint and a self-contained Scryfall query', () => {
    for (const x of QUESTION_POOL) {
      expect(x.hint.length, x.id).toBeGreaterThan(10);
      const opens = (x.scryfallQueryHint.match(/\(/g) ?? []).length;
      const closes = (x.scryfallQueryHint.match(/\)/g) ?? []).length;
      expect(opens, x.id).toBe(closes);
      // A top-level "or" would break when the query is combined with other filters.
      expect(/ or /.test(x.scryfallQueryHint.replace(/\([^)]*\)/g, '')), x.id).toBe(false);
    }
  });
});

describe('keyword detection', () => {
  const card = (oracle_text: string, type_line = 'Creature — Test') => makeCard({ name: 'K', type_line, oracle_text });
  const has = (id: string, text: string, type?: string) => q(id).validatorFn(card(text, type)).ok;

  it('reads keyword lines, costs and dashes, but not mentions', () => {
    expect(has('creature-ward', 'Flying\nWard—Pay 2 life.')).toBe(true);
    expect(has('creature-ward', 'Ward {2}')).toBe(true);
    expect(has('keyword-kicker', 'Kicker {1}{G} (You may pay an additional {1}{G} as you cast this spell.)', 'Sorcery')).toBe(true);
    expect(has('keyword-flashback', 'Flashback—Sacrifice a creature.', 'Sorcery')).toBe(true);
    expect(has('ability-landfall', 'Landfall — Whenever a land you control enters, draw a card.')).toBe(true);
    expect(has('flying-creature', 'Creatures you control with flying get +1/+1.')).toBe(false);
    expect(has('creature-flash', 'Flashback {2}{U}')).toBe(false);
    expect(has('keyword-cycling', 'Basic landcycling {1}{G}')).toBe(true);
    expect(has('keyword-landwalk', 'Nonbasic landwalk')).toBe(true);
    expect(has('creature-protection', 'Protection from red')).toBe(true);
    expect(has('creature-annihilator', 'Annihilator 2')).toBe(true);
  });

  it('counts Changelings as every creature type', () => {
    expect(q('sliver').validatorFn(card('Changeling (This card is every creature type.)', 'Creature — Shapeshifter')).ok).toBe(true);
    expect(q('sliver').validatorFn(card('Flying', 'Creature — Bird')).ok).toBe(false);
  });
});

describe('new prompt kinds', () => {
  it('checks colors per face', () => {
    const valki = makeCard({
      name: 'Valki, God of Lies // Tibalt, Cosmic Impostor',
      layout: 'modal_dfc',
      type_line: 'Legendary Creature — God // Legendary Planeswalker — Tibalt',
      card_faces: [
        { object: 'card_face', name: 'Valki, God of Lies', type_line: 'Legendary Creature — God', oracle_text: '', colors: ['B'] },
        { object: 'card_face', name: 'Tibalt, Cosmic Impostor', type_line: 'Legendary Planeswalker — Tibalt', oracle_text: '', colors: ['R'] },
      ],
    });
    expect(q('black-creature').validatorFn(valki).ok).toBe(true);
    expect(q('red-creature').validatorFn(valki).ok).toBe(false);
    expect(q('red-planeswalker').validatorFn(valki).ok).toBe(true);
    expect(q('multicolored').validatorFn(valki).ok).toBe(true);
    expect(q('mono-red').validatorFn(makeCard({ name: 'Bolt', colors: ['R'] })).ok).toBe(true);
    expect(q('mono-red').validatorFn(makeCard({ name: 'Boros', colors: ['R', 'W'] })).ok).toBe(false);
  });

  it('checks mana value, costs and stats', () => {
    expect(q('mv-seven-plus').validatorFn(makeCard({ name: 'Big', cmc: 8 })).ok).toBe(true);
    expect(q('mv-zero-spell').validatorFn(makeCard({ name: 'Mox', cmc: 0, mana_cost: '{0}' })).ok).toBe(true);
    expect(q('mv-zero-spell').validatorFn(makeCard({ name: 'Land', cmc: 0, type_line: 'Land' })).ok).toBe(false);
    expect(q('no-mana-cost').validatorFn(makeCard({ name: 'Mox', cmc: 0, mana_cost: '{0}' })).ok).toBe(false);
    expect(q('no-mana-cost').validatorFn(makeCard({ name: 'Ancestral Vision', cmc: 0, mana_cost: '', type_line: 'Sorcery' })).ok).toBe(true);
    expect(q('phyrexian-mana').validatorFn(makeCard({ name: 'Probe', mana_cost: '{U/P}' })).ok).toBe(true);
    expect(q('hybrid-mana').validatorFn(makeCard({ name: 'Probe', mana_cost: '{U/P}' })).ok).toBe(false);
    expect(q('one-one').validatorFn(makeCard({ name: 'Elf', type_line: 'Creature — Elf', power: '1', toughness: '1' })).ok).toBe(true);
    expect(q('one-one').validatorFn(makeCard({ name: 'Elf', type_line: 'Creature — Elf', power: '1', toughness: '2' })).ok).toBe(false);
  });

  it('checks names, layouts and lists', () => {
    expect(q('starts-with-q').validatorFn(makeCard({ name: 'Quirion Ranger' })).ok).toBe(true);
    expect(q('starts-with-q').validatorFn(makeCard({ name: 'Ranger of Quirion' })).ok).toBe(false);
    expect(q('one-word-name').validatorFn(makeCard({ name: 'Counterspell' })).ok).toBe(true);
    expect(q('long-name').validatorFn(makeCard({ name: 'Jace, the Mind Sculptor of Doom' })).ok).toBe(true);
    expect(q('split-card').validatorFn(makeCard({ name: 'Fire // Ice', layout: 'split' })).ok).toBe(true);
    expect(q('restricted-vintage').validatorFn(makeCard({ name: 'Black Lotus', legalities: { vintage: 'restricted' } })).ok).toBe(true);
    expect(q('restricted-vintage').validatorFn(makeCard({ name: 'Sol Ring', legalities: { vintage: 'legal' } })).ok).toBe(false);
    expect(q('kindred').validatorFn(makeCard({ name: 'Tarfire', type_line: 'Kindred Instant — Goblin' })).ok).toBe(true);
    expect(
      q('trigger-dies').validatorFn(
        makeCard({ name: 'Blood Artist', oracle_text: 'Whenever Blood Artist or another creature dies, target player loses 1 life.' }),
      ).ok,
    ).toBe(true);
  });
});

describe('validators', () => {
  it('rejects Sol Ring for a flying creature', () => {
    const solRing = makeCard({ name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.' });
    const result = q('flying-creature').validatorFn(solRing);
    expect(result.ok).toBe(false);
  });

  it('accepts printed flying and rejects granted flying', () => {
    const angel = makeCard({ name: 'Serra Angel', type_line: 'Creature — Angel', oracle_text: 'Flying, vigilance' });
    const reminder = makeCard({
      name: 'Birds',
      type_line: 'Creature — Bird',
      oracle_text: 'Flying (This creature can’t be blocked except by creatures with flying or reach.)\n{T}: Add one mana of any color.',
    });
    const granted = makeCard({
      name: 'Grounded Knight',
      type_line: 'Creature — Human Knight',
      oracle_text: 'As long as you control an Equipment, Grounded Knight has flying.',
    });
    expect(q('flying-creature').validatorFn(angel).ok).toBe(true);
    expect(q('flying-creature').validatorFn(reminder).ok).toBe(true);
    expect(q('flying-creature').validatorFn(granted).ok).toBe(false);
  });

  it('finds activated abilities outside reminder text', () => {
    const solRing = makeCard({ name: 'Sol Ring', oracle_text: '{T}: Add {C}{C}.' });
    const equipment = makeCard({ name: 'Bonesplitter', oracle_text: 'Equipped creature gets +2/+0.\nEquip {1}' });
    const reminderOnly = makeCard({
      name: 'Vanilla',
      type_line: 'Creature — Bear',
      oracle_text: 'Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)',
    });
    const basic = makeCard({ name: 'Forest', type_line: 'Basic Land — Forest', oracle_text: '({T}: Add {G}.)' });
    const cycler = makeCard({ name: 'Cycler', type_line: 'Creature — Beast', oracle_text: 'Plainscycling {2}' });
    expect(q('activated-ability').validatorFn(solRing).ok).toBe(true);
    expect(q('activated-ability').validatorFn(equipment).ok).toBe(true);
    expect(q('activated-ability').validatorFn(reminderOnly).ok).toBe(false);
    expect(q('activated-ability').validatorFn(basic).ok).toBe(true);
    expect(q('activated-ability').validatorFn(cycler).ok).toBe(true);
  });

  it('accepts the instant half of an adventure and the back of an MDFC', () => {
    const giant = makeCard({
      name: 'Bonecrusher Giant // Stomp',
      layout: 'adventure',
      type_line: 'Creature — Giant // Instant — Adventure',
      card_faces: [
        { object: 'card_face', name: 'Bonecrusher Giant', type_line: 'Creature — Giant', oracle_text: '' },
        { object: 'card_face', name: 'Stomp', type_line: 'Instant — Adventure', oracle_text: 'Stomp deals 2 damage to any target.' },
      ],
    });
    const valki = makeCard({
      name: 'Valki, God of Lies // Tibalt, Cosmic Impostor',
      layout: 'modal_dfc',
      type_line: 'Legendary Creature — God // Legendary Planeswalker — Tibalt',
      card_faces: [
        { object: 'card_face', name: 'Valki, God of Lies', type_line: 'Legendary Creature — God', oracle_text: '' },
        { object: 'card_face', name: 'Tibalt, Cosmic Impostor', type_line: 'Legendary Planeswalker — Tibalt', oracle_text: '' },
      ],
    });
    const stomp = q('instant').validatorFn(giant);
    expect(stomp.ok && stomp.matchedFace).toBe('Stomp');
    const tibalt = q('planeswalker').validatorFn(valki);
    expect(tibalt.ok && tibalt.matchedFace).toBe('Tibalt, Cosmic Impostor');
    expect(q('legendary-creature').validatorFn(valki).ok).toBe(true);
  });
});

describe('eligibility', () => {
  it('accepts banned and restricted cards', () => {
    expect(
      checkCardEligibility(makeCard({ name: 'Mana Crypt', legalities: { commander: 'banned', vintage: 'restricted', legacy: 'banned' } })).ok,
    ).toBe(true);
    // Ante cards are banned everywhere but are still real cards.
    expect(checkCardEligibility(makeCard({ name: 'Contract from Below', legalities: { commander: 'banned', vintage: 'banned' } })).ok).toBe(
      true,
    );
    // Black-bordered Unfinity cards are tournament legal.
    expect(
      checkCardEligibility(
        makeCard({ name: 'Comet, Stellar Pup', set_type: 'funny', legalities: { commander: 'legal', vintage: 'legal' } }),
      ).ok,
    ).toBe(true);
  });

  it('rejects Un-cards, digital-only cards, previews, stickers and meld results', () => {
    expect(
      checkCardEligibility(
        makeCard({ name: 'A-Lightning Bolt', games: ['arena'], digital: true, legalities: { commander: 'not_legal', vintage: 'not_legal' } }),
      ).ok,
    ).toBe(false);
    expect(
      checkCardEligibility(
        makeCard({ name: 'Upcoming', released_at: '2099-01-01', legalities: { commander: 'not_legal', vintage: 'not_legal' } }),
        '2026-11-22',
      ).ok,
    ).toBe(false);
    // An old card whose newest printing is still a preview counts.
    expect(checkCardEligibility(makeCard({ name: 'Forest', released_at: '2099-01-01' }), '2026-11-22').ok).toBe(true);
    expect(
      checkCardEligibility(makeCard({ name: 'Backup Plan', type_line: 'Conspiracy', legalities: { commander: 'banned', vintage: 'banned' } })).ok,
    ).toBe(false);
    expect(
      checkCardEligibility(
        makeCard({ name: 'Mox Lotus', legalities: { commander: 'not_legal' }, border_color: 'silver', set_type: 'funny' }),
      ).ok,
    ).toBe(false);
    expect(checkCardEligibility(makeCard({ name: 'Sheet', type_line: 'Stickers' })).ok).toBe(false);
    expect(
      checkCardEligibility(
        makeCard({
          name: 'Brisela, Voice of Nightmares',
          layout: 'meld',
          all_parts: [
            { object: 'related_card', id: '1', component: 'meld_part', name: 'Bruna, the Fading Light', type_line: '', uri: '' },
            { object: 'related_card', id: '2', component: 'meld_part', name: 'Gisela, the Broken Blade', type_line: '', uri: '' },
            { object: 'related_card', id: '3', component: 'meld_result', name: 'Brisela, Voice of Nightmares', type_line: '', uri: '' },
          ],
        }),
      ).ok,
    ).toBe(false);
    expect(checkCardEligibility(makeCard({ name: 'Sol Ring' })).ok).toBe(true);
  });
});

describe('input sanitising', () => {
  it('strips search syntax from input', () => {
    expect(sanitizeInput('t:creature "Sol Ring"')).toBe('t creature Sol Ring');
  });
});
