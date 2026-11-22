import { describe, expect, it } from 'vitest';
import { ACTIVE_QUESTIONS, DAILY_QUESTION_COUNT, questionById, selectDailyQuestions } from './questionPool';
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

  it('ships ten active prompts', () => {
    expect(ACTIVE_QUESTIONS).toHaveLength(10);
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
