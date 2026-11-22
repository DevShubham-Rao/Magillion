import { describe, expect, it } from 'vitest';
import { NameIndex, editDistance, wordCost } from './fuzzy';

const NAMES = [
  'The Whizzer, Classic Speedster',
  'Wizard Replica',
  'Jace, the Mind Sculptor',
  'Jace, Vryn’s Prodigy // Jace, Telepath Unbound',
  'Boompile',
  'Lightning Bolt',
  'Lightning Greaves',
  'Urza, Lord High Artificer',
  'Serra Angel',
];

describe('editDistance', () => {
  it('counts substitutions, insertions and swaps', () => {
    expect(editDistance('wizzer', 'whizzer')).toBe(1);
    expect(editDistance('sculpter', 'sculptor')).toBe(1);
    expect(editDistance('angle', 'angel')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
  });

  it('gives up early past the limit', () => {
    expect(editDistance('abcdef', 'uvwxyz', 2)).toBe(3);
  });
});

describe('wordCost', () => {
  it('treats a typed prefix as free and refuses wild guesses', () => {
    expect(wordCost('sculpt', 'sculptor')).toBe(0);
    expect(wordCost('wizzer', 'whizzer')).toBe(1);
    expect(wordCost('zzz', 'whizzer')).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('NameIndex', () => {
  const index = new NameIndex(NAMES);
  const top = (input: string) => index.search(input)[0]?.name;

  it('corrects typos and ignores filler words', () => {
    expect(top('the wizzer')).toBe('The Whizzer, Classic Speedster');
    expect(top('jace mind sculpter')).toBe('Jace, the Mind Sculptor');
    expect(top('lightnig bolt')).toBe('Lightning Bolt');
    expect(top('serra angle')).toBe('Serra Angel');
  });

  it('forgives spacing', () => {
    expect(top('boom pile')).toBe('Boompile');
  });

  it('returns nothing for gibberish', () => {
    expect(index.search('qqqqxxxx')).toHaveLength(0);
  });
});
