import type { QuestionCategory, QuestionDefinition, ScryfallCard } from '../types/mtg';
import { faceHasType, getFaces } from '../lib/cardFaces';
import { seededRandom, shuffle } from '../lib/random';
import {
  ACTIVATED_KEYWORDS,
  cardNames,
  cardQuestion,
  colorName,
  colorsQuestion,
  colorTypeQuestion,
  faceHasActivatedAbility,
  faceTypesQuestion,
  fail,
  findFace,
  keywordCreatureQuestion,
  keywordQuestion,
  pass,
  startsWithLetter,
  statQuestion,
  subtypeQuestion,
  textQuestion,
  typeQuestion,
  typeSummary,
  type ColorLetter,
} from './questionFactories';

export { faceHasActivatedAbility, faceHasKeyword } from './questionFactories';

/**
 * The prompt pool
 * ===============
 *
 * Several hundred prompts, built from the factories in `questionFactories.ts`.
 * Each day deals seven, one from each of seven different categories, so a
 * gauntlet mixes card types, keywords, colors, rules text and the rest.
 *
 * To add a prompt, add a row to one of the tables below (or call a factory
 * directly). Mark it `status: 'experimental'` to keep it out of the rotation.
 * Ids are stored with each day's results, so never rename one.
 */

export const DAILY_QUESTION_COUNT = 7;

const an = (word: string) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);
const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/* ------------------------------------------------------------------------ */
/* Card types and supertypes                                                 */
/* ------------------------------------------------------------------------ */

const CARD_TYPES: QuestionDefinition[] = [
  typeQuestion({
    id: 'planeswalker',
    type: 'Planeswalker',
    prompt: 'Name a Planeswalker.',
    shortLabel: 'Planeswalker',
    hint: 'Any card with the Planeswalker type on at least one face, including the backs of double-faced cards.',
  }),
  typeQuestion({
    id: 'enchantment',
    type: 'Enchantment',
    prompt: 'Name an Enchantment.',
    shortLabel: 'Enchantment',
    hint: 'Auras, Sagas, Classes, Rooms, Cases and enchantment creatures all qualify.',
  }),
  typeQuestion({
    id: 'artifact',
    type: 'Artifact',
    prompt: 'Name an Artifact.',
    shortLabel: 'Artifact',
    hint: 'Equipment, Vehicles, artifact creatures and artifact lands all count.',
  }),
  typeQuestion({
    id: 'instant',
    type: 'Instant',
    prompt: 'Name an Instant.',
    shortLabel: 'Instant',
    hint: 'Split cards and adventures count when one half is an instant.',
  }),
  typeQuestion({
    id: 'sorcery',
    type: 'Sorcery',
    prompt: 'Name a Sorcery.',
    shortLabel: 'Sorcery',
    hint: 'Split cards, adventures and the spell side of modal double-faced cards count.',
  }),
  typeQuestion({
    id: 'land',
    type: 'Land',
    prompt: 'Name a Land.',
    shortLabel: 'Land',
    hint: 'Basic lands are legal answers, though they score as the most-played cards in the game.',
  }),
  typeQuestion({
    id: 'battle',
    type: 'Battle',
    prompt: 'Name a Battle.',
    shortLabel: 'Battle',
    hint: 'Sieges and the other battles from March of the Machine onward.',
  }),
  {
    ...typeQuestion({
      id: 'kindred',
      type: 'Kindred',
      prompt: 'Name a Kindred card.',
      shortLabel: 'Kindred card',
      hint: 'Kindred (once called Tribal) instants, sorceries, enchantments and artifacts with creature types.',
    }),
    validatorFn: (card: ScryfallCard) => {
      const face = findFace(card, (f) => faceHasType(f, 'Kindred') || faceHasType(f, 'Tribal'));
      if (face) return pass(card, face);
      return fail('The spell fizzles', `${typeSummary(card)}, not a Kindred card.`);
    },
  },
];

const TYPE_COMBOS: QuestionDefinition[] = [
  {
    id: 'legendary-creature',
    prompt: 'Name a Legendary Creature.',
    shortLabel: 'Legendary Creature',
    hint: 'Legendary and Creature must appear on the same face. Legendary artifact and enchantment creatures count.',
    category: 'supertype',
    status: 'active',
    scryfallQueryHint: 't:legendary t:creature',
    validatorFn: (card) => {
      const face = findFace(card, (f) => faceHasType(f, 'Legendary') && faceHasType(f, 'Creature'));
      if (face) return pass(card, face);
      const legendary = findFace(card, (f) => faceHasType(f, 'Legendary'));
      if (legendary) return fail('Legend, but not a creature', `${typeSummary(card)}. It's legendary, but no face is a creature.`);
      return fail('No legend here', `${typeSummary(card)}, not a legendary creature.`);
    },
  },
  ...(
    [
      ['Legendary', 'Land', 'Urza’s Saga, Gaea’s Cradle and every other land with Legendary on its type line.'],
      ['Legendary', 'Artifact', 'Legendary equipment, vehicles and relics. Legendary artifact creatures count too.'],
      ['Legendary', 'Enchantment', 'Legendary enchantments, including legendary Sagas and enchantment creatures.'],
      ['Legendary', 'Sorcery', 'Only castable while you control a legendary creature or planeswalker.'],
      ['Legendary', 'Planeswalker', 'Every planeswalker is legendary, so any one counts.'],
    ] as const
  ).map(([a, b, hint]) =>
    faceTypesQuestion({
      id: slug(`${a} ${b}`),
      all: [a, b],
      prompt: `Name a ${a} ${b}.`,
      shortLabel: `${a} ${b}`,
      hint,
      query: `t:${a.toLowerCase()} t:${b.toLowerCase()}`,
    }),
  ),
  ...(
    [
      ['Artifact', 'Creature', 'Golems, Myr, Constructs and every other creature with Artifact on the same face.'],
      ['Enchantment', 'Creature', 'Theros gods, bestow creatures and every other enchantment creature.'],
      ['Artifact', 'Land', 'Seat of the Synod, Darksteel Citadel and the other artifact lands.'],
    ] as const
  ).map(([a, b, hint]) =>
    faceTypesQuestion({
      id: slug(`${a} ${b}`),
      all: [a, b],
      category: 'card-type',
      prompt: `Name ${an(a)} ${b}.`,
      shortLabel: `${a} ${b}`,
      hint,
      query: `t:${a.toLowerCase()} t:${b.toLowerCase()}`,
    }),
  ),
  faceTypesQuestion({
    id: 'noncreature-artifact',
    all: ['Artifact'],
    none: ['Creature'],
    category: 'card-type',
    prompt: 'Name a noncreature Artifact.',
    shortLabel: 'Noncreature Artifact',
    hint: 'Mana rocks, equipment, vehicles and relics. Artifact creatures don’t count, but vehicles do.',
    query: 't:artifact -t:creature',
  }),
  faceTypesQuestion({
    id: 'nonbasic-land',
    all: ['Land'],
    none: ['Basic'],
    prompt: 'Name a nonbasic Land.',
    shortLabel: 'Nonbasic Land',
    hint: 'Any land without Basic on its type line. Dual lands with basic land types count.',
    query: 't:land -t:basic',
  }),
  faceTypesQuestion({
    id: 'snow',
    all: ['Snow'],
    prompt: 'Name a Snow card.',
    shortLabel: 'Snow card',
    hint: 'Snow on the type line: snow creatures, snow lands, snow artifacts and the rest.',
    query: 't:snow',
  }),
  faceTypesQuestion({
    id: 'world-enchantment',
    all: ['World', 'Enchantment'],
    prompt: 'Name a World Enchantment.',
    shortLabel: 'World Enchantment',
    hint: 'The old supertype from Legends and Mirage: only one World permanent can stay on the battlefield.',
    query: 't:world',
  }),
];

/* ------------------------------------------------------------------------ */
/* Subtypes                                                                  */
/* ------------------------------------------------------------------------ */

const CREATURE_TYPES = [
  'Dragon', 'Phyrexian', 'Zombie', 'Elf', 'Goblin', 'Angel', 'Demon', 'Vampire', 'Merfolk', 'Wizard', 'Knight',
  'Sphinx', 'Hydra', 'Faerie', 'Sliver', 'Dinosaur', 'Cat', 'Spirit', 'Elemental', 'Giant', 'Horror', 'Eldrazi',
  'Rogue', 'Cleric', 'Warrior', 'Shaman', 'Soldier', 'Beast', 'Bird', 'Snake', 'Insect', 'Treefolk', 'Golem', 'Myr',
  'Squirrel', 'Rat', 'Dog', 'Wurm', 'Ninja', 'Samurai', 'Pirate', 'Dwarf', 'Ogre', 'Minotaur', 'Centaur', 'Druid',
  'Assassin', 'Werewolf', 'Kor', 'Avatar', 'Leviathan', 'Octopus', 'Kraken', 'Spider', 'Bear', 'Wolf', 'Ooze',
  'Fungus', 'Frog', 'Otter', 'Mouse', 'Bat', 'Construct', 'Gorgon', 'Hound', 'Unicorn', 'Pegasus', 'Griffin', 'Troll',
  'Kithkin', 'Vedalken', 'Viashino', 'Satyr', 'Nymph', 'Siren', 'Mutant', 'Robot', 'Alien', 'Monk', 'Berserker',
  'Barbarian', 'Monkey', 'Ape', 'Crab', 'Fish', 'Turtle', 'Lizard', 'Serpent', 'Plant', 'Shapeshifter', 'Illusion',
  'Wraith', 'Specter', 'Skeleton', 'Imp', 'Devil', 'Gnome', 'Homunculus', 'Thrull', 'Nightmare', 'Scarecrow',
] as const;

const CREATURE_TYPE_PROMPTS = CREATURE_TYPES.map((type) =>
  subtypeQuestion({
    id: slug(type),
    subtype: type,
    creatureType: true,
    prompt: `Name ${an(type)}.`,
    shortLabel: type,
    hint: `Any card with the ${type} creature type on a face, including Kindred spells. Changelings count too.`,
  }),
);

const OTHER_SUBTYPES: Array<[string, string]> = [
  ['Equipment', 'Any Equipment artifact, including equipment creatures with reconfigure.'],
  ['Aura', 'Any Aura enchantment, including bestow creatures (their Aura half is on the type line).'],
  ['Vehicle', 'Any Vehicle artifact.'],
  ['Saga', 'Any Saga, including Saga creatures.'],
  ['Curse', 'Any Curse aura.'],
  ['Gate', 'Any land with the Gate subtype.'],
  ['Desert', 'Any land with the Desert subtype.'],
  ['Lesson', 'Any Lesson instant or sorcery from Strixhaven.'],
  ['Trap', 'Any Trap instant from Zendikar block and beyond.'],
  ['Arcane', 'Any Arcane instant or sorcery from Kamigawa.'],
  ['Shrine', 'Any Shrine enchantment.'],
  ['Class', 'Any Class enchantment, with its levels.'],
  ['Room', 'Any Room enchantment from Duskmourn.'],
  ['Background', 'Any Background enchantment for Commander.'],
  ['Cave', 'Any land with the Cave subtype.'],
  ["Urza's", 'Urza’s Mine, Power-Plant, Tower and the other Urza’s lands.'],
  ['Food', 'Any card with the Food artifact subtype printed on it.'],
  ['Spacecraft', 'Any Spacecraft artifact from Edge of Eternities.'],
];

const OTHER_SUBTYPE_PROMPTS = OTHER_SUBTYPES.map(([type, hint]) =>
  subtypeQuestion({
    id: slug(type),
    subtype: type,
    category: 'card-type',
    prompt: type === "Urza's" ? 'Name an Urza’s land.' : `Name ${an(type)}.`,
    shortLabel: type === "Urza's" ? 'Urza’s land' : type,
    hint,
  }),
);

const PLANESWALKER_NAMES = [
  'Jace', 'Chandra', 'Liliana', 'Garruk', 'Nissa', 'Ajani', 'Elspeth', 'Teferi', 'Sorin', 'Gideon', 'Karn', 'Ugin',
  'Nahiri', 'Sarkhan', 'Vraska', 'Ral', 'Tamiyo', 'Kaya', 'Tezzeret', 'Bolas', 'Tibalt', 'Kiora', 'Vivien', 'Domri',
  'Ashiok', 'Saheeli', 'Huatli', 'Wrenn', 'Lukka', 'Kasmina',
];

const PLANESWALKER_PROMPTS = PLANESWALKER_NAMES.map((who) =>
  subtypeQuestion({
    id: `walker-${slug(who)}`,
    subtype: who,
    category: 'plane',
    prompt: who === 'Bolas' ? 'Name a Nicol Bolas card.' : `Name ${an(who)} card.`,
    shortLabel: who === 'Bolas' ? 'Nicol Bolas' : who,
    hint: `Any card with the ${who} subtype: ${who === 'Bolas' ? 'his' : 'their'} planeswalker cards, including the backs of double-faced cards.`,
  }),
);

/* ------------------------------------------------------------------------ */
/* Keywords and ability words                                                */
/* ------------------------------------------------------------------------ */

const CREATURE_KEYWORDS: Array<[string, string]> = [
  ['Flying', 'Flying must be printed on the creature itself. Abilities that grant flying later don’t count.'],
  ['Trample', 'Trample printed on the creature, not granted by an aura or pump spell.'],
  ['Deathtouch', 'Deathtouch printed on the creature.'],
  ['Lifelink', 'Lifelink printed on the creature.'],
  ['Haste', 'Haste printed on the creature.'],
  ['Vigilance', 'Vigilance printed on the creature.'],
  ['First strike', 'First strike printed on the creature. Double strike is a different keyword.'],
  ['Double strike', 'Double strike printed on the creature.'],
  ['Reach', 'Reach printed on the creature.'],
  ['Menace', 'Menace printed on the creature.'],
  ['Hexproof', 'Hexproof printed on the creature, including “hexproof from” a color.'],
  ['Flash', 'A creature you can cast at instant speed because Flash is printed on it.'],
  ['Defender', 'Walls and the other creatures that can’t attack.'],
  ['Indestructible', 'Indestructible printed on the creature.'],
  ['Prowess', 'Prowess printed on the creature.'],
  ['Infect', 'Infect printed on the creature.'],
  ['Shroud', 'Shroud printed on the creature.'],
  ['Fear', 'Fear printed on the creature.'],
  ['Intimidate', 'Intimidate printed on the creature.'],
  ['Flanking', 'Flanking printed on the creature.'],
  ['Shadow', 'Shadow printed on the creature.'],
  ['Horsemanship', 'Horsemanship, from the Portal Three Kingdoms cards.'],
  ['Annihilator', 'Annihilator with any number, printed on the creature.'],
  ['Exalted', 'Exalted printed on the creature.'],
  ['Undying', 'Undying printed on the creature.'],
  ['Persist', 'Persist printed on the creature.'],
  ['Changeling', 'Changeling printed on the creature.'],
  ['Wither', 'Wither printed on the creature.'],
  ['Skulk', 'Skulk printed on the creature.'],
  ['Bushido', 'Bushido with any number, printed on the creature.'],
  ['Banding', 'Banding, the oldest and strangest combat keyword.'],
  ['Rampage', 'Rampage with any number, printed on the creature.'],
  ['Protection', 'Protection from anything, printed on the creature.'],
  ['Ward', 'Ward with any cost, printed on the creature.'],
  ['Toxic', 'Toxic with any number, printed on the creature.'],
  ['Afflict', 'Afflict with any number, printed on the creature.'],
];

const CREATURE_KEYWORD_PROMPTS = CREATURE_KEYWORDS.map(([keyword, hint]) =>
  keywordCreatureQuestion({
    id: keyword === 'Flying' ? 'flying-creature' : `creature-${slug(keyword)}`,
    keyword,
    prompt: `Name a Creature with ${keyword}.`,
    shortLabel: `Creature with ${keyword}`,
    hint,
  }),
);

const CARD_KEYWORDS: Array<[string, RegExp?]> = [
  ['Flashback'], ['Cycling', /^(?:basic )?\w*cycling\b/], ['Kicker'], ['Multikicker'], ['Cascade'], ['Convoke'],
  ['Delve'], ['Storm'], ['Madness'], ['Morph'], ['Megamorph'], ['Ninjutsu'], ['Equip'], ['Affinity'], ['Suspend'],
  ['Evoke'], ['Escape'], ['Foretell'], ['Buyback'], ['Entwine'], ['Echo'], ['Cumulative upkeep'], ['Dredge'],
  ['Retrace'], ['Replicate'], ['Splice'], ['Overload'], ['Miracle'], ['Emerge'], ['Bestow'], ['Dash'], ['Unearth'],
  ['Mutate'], ['Crew'], ['Partner'], ['Landwalk', /^(?:\w+ )?\w*walk\b/], ['Transmute'], ['Disturb'], ['Craft'],
  ['Prototype'], ['Blitz'], ['Casualty'], ['Training'], ['Offspring'], ['Plot'], ['Disguise'], ['Embalm'],
  ['Eternalize'], ['Exploit'], ['Devour'], ['Fading'], ['Vanishing'], ['Phasing'], ['Bloodrush'], ['Ascend'],
  ['Surge'], ['Spectacle'], ['Riot'], ['Mentor'], ['Afterlife'], ['Jump-start'], ['Aftermath'],
  ['Encore'], ['Boast'], ['Daybound'], ['Cleave'], ['Squad'], ['Backup'], ['Bargain'], ['Gift'],
  ['Saddle'], ['Exhaust'], ['Station'], ['Warp'], ['Sneak'], ['Firebending'],
];

const CARD_KEYWORD_PROMPTS = CARD_KEYWORDS.map(([keyword, match]) =>
  keywordQuestion({
    id: `keyword-${slug(keyword)}`,
    keyword,
    match,
    query:
      keyword === 'Landwalk'
        ? 'o:/(island|swamp|forest|mountain|plains|land|desert)walk/'
        : keyword === 'Cycling'
          ? 'o:cycling'
          : undefined,
    prompt: `Name a card with ${keyword}.`,
    shortLabel: keyword,
    hint:
      keyword === 'Cycling'
        ? 'Cycling, landcycling, typecycling: any kind, printed on the card.'
        : keyword === 'Landwalk'
          ? 'Islandwalk, swampwalk, forestwalk, nonbasic landwalk: any landwalk, printed on the card.'
          : `${keyword} printed on any face of the card. Reminder text and granted abilities don’t count.`,
  }),
);

const ABILITY_WORDS = [
  'Landfall', 'Threshold', 'Metalcraft', 'Morbid', 'Delirium', 'Constellation', 'Raid', 'Magecraft', 'Domain',
  'Imprint', 'Eminence', 'Enrage', 'Battalion', 'Heroic', 'Hellbent', 'Revolt', 'Ferocious', 'Coven', 'Alliance',
  'Celebration', 'Pack tactics', 'Spell mastery', 'Converge', 'Kinship', 'Chroma', 'Grandeur', 'Radiance',
  'Fateful hour', 'Formidable', 'Inspired', 'Addendum', 'Undergrowth', 'Adamant', 'Lieutenant',
  'Will of the council', 'Parley', 'Tempting offer', 'Channel', 'Bloodthirst', 'Eerie', 'Survival',
  'Descend', 'Valiant', 'Corrupted', 'Max speed',
];

const ABILITY_WORD_PROMPTS = ABILITY_WORDS.map((word) =>
  keywordQuestion({
    id: `ability-${slug(word)}`,
    keyword: word,
    category: 'mechanic',
    query: `o:"${word.toLowerCase()}"`,
    prompt: `Name a card with ${word}.`,
    shortLabel: word,
    hint: `${word} written as an ability word (“${word} — …”) on any face. A card that only mentions it doesn’t count.`,
  }),
);

/* ------------------------------------------------------------------------ */
/* Rules text                                                                */
/* ------------------------------------------------------------------------ */

const TEXT_PROMPTS: Array<{ id: string; phrase: string; pattern: RegExp; query: string; hint?: string }> = [
  { id: 'text-draw-a-card', phrase: 'draw a card', pattern: /\bdraws? a card\b/i, query: '(o:"draw a card" or o:"draws a card")' },
  { id: 'text-treasure', phrase: 'Treasure', pattern: /\bTreasures?\b/, query: 'o:treasure' },
  { id: 'text-food', phrase: 'Food', pattern: /\bFood\b/, query: 'o:food' },
  { id: 'text-clue', phrase: 'Clue', pattern: /\bClues?\b/, query: 'o:clue' },
  { id: 'text-counter-target', phrase: 'counter target', pattern: /\bcounter target\b/i, query: 'o:"counter target"' },
  { id: 'text-destroy-all', phrase: 'destroy all', pattern: /\bdestroy all\b/i, query: 'o:"destroy all"' },
  { id: 'text-exile-all', phrase: 'exile all', pattern: /\bexile all\b/i, query: 'o:"exile all"' },
  { id: 'text-extra-turn', phrase: 'extra turn', pattern: /\bextra turns?\b/i, query: 'o:"extra turn"' },
  {
    id: 'text-win-the-game',
    phrase: 'win the game',
    pattern: /\bwins? the game\b/i,
    query: '(o:"win the game" or o:"wins the game")',
    hint: 'Alternate win conditions, and cards that stop someone from winning.',
  },
  { id: 'text-lose-the-game', phrase: 'lose the game', pattern: /\bloses? the game\b/i, query: '(o:"lose the game" or o:"loses the game")' },
  { id: 'text-proliferate', phrase: 'proliferate', pattern: /\bproliferate\b/i, query: 'o:proliferate' },
  { id: 'text-scry', phrase: 'scry', pattern: /\bscry\b/i, query: 'o:scry' },
  { id: 'text-surveil', phrase: 'surveil', pattern: /\bsurveil\b/i, query: 'o:surveil' },
  { id: 'text-mill', phrase: 'mill', pattern: /\bmills?\b/i, query: 'o:mill' },
  { id: 'text-investigate', phrase: 'investigate', pattern: /\binvestigate\b/i, query: 'o:investigate' },
  { id: 'text-explore', phrase: 'explores', pattern: /\bexplores?\b/i, query: 'o:explore' },
  { id: 'text-connive', phrase: 'connive', pattern: /\bconnives?\b/i, query: 'o:connive' },
  { id: 'text-amass', phrase: 'amass', pattern: /\bamass\b/i, query: 'o:amass' },
  { id: 'text-adapt', phrase: 'adapt', pattern: /\badapt \d/i, query: 'o:adapt' },
  { id: 'text-populate', phrase: 'populate', pattern: /\bpopulate\b/i, query: 'o:populate' },
  { id: 'text-fight', phrase: 'fights', pattern: /\bfights?\b/i, query: 'o:fight' },
  { id: 'text-goad', phrase: 'goad', pattern: /\bgoad(?:s|ed)?\b/i, query: 'o:goad' },
  { id: 'text-monarch', phrase: 'the monarch', pattern: /\bmonarch\b/i, query: 'o:monarch' },
  { id: 'text-initiative', phrase: 'the initiative', pattern: /\bthe initiative\b/i, query: 'o:initiative' },
  { id: 'text-ring-tempts', phrase: 'the Ring tempts you', pattern: /\bthe Ring tempts you\b/i, query: 'o:"ring tempts"' },
  { id: 'text-venture', phrase: 'venture into the dungeon', pattern: /\bventure into the dungeon\b/i, query: 'o:venture' },
  { id: 'text-emblem', phrase: 'emblem', pattern: /\bemblem\b/i, query: 'o:emblem' },
  { id: 'text-energy', phrase: '{E}', pattern: /\{E\}/, query: 'o:"{E}"', hint: 'Energy counters, shown as {E} in rules text.' },
  { id: 'text-poison', phrase: 'poison counter', pattern: /\bpoison counters?\b/i, query: 'o:poison' },
  { id: 'text-plus-counter', phrase: '+1/+1 counter', pattern: /\+1\/\+1 counters?/i, query: 'o:"+1/+1 counter"' },
  { id: 'text-minus-counter', phrase: '-1/-1 counter', pattern: /-1\/-1 counters?/i, query: 'o:"-1/-1 counter"' },
  { id: 'text-gain-control', phrase: 'gain control', pattern: /\bgains? control of\b/i, query: 'o:"control of"' },
  {
    id: 'text-search-library',
    phrase: 'search your library',
    pattern: /\bsearch(?:es)? (?:your|their|its owner’s|its owner's|that player’s|that player's|target player’s|target player's) library\b/i,
    query: 'o:search o:library',
  },
  { id: 'text-flip-coin', phrase: 'flip a coin', pattern: /\bflips? (?:a|one|two|three|\w+) coins?\b/i, query: 'o:coin' },
  { id: 'text-roll-die', phrase: 'roll a die', pattern: /\brolls? [^.]*\b(?:d\d+|dice|die)\b/i, query: 'o:/rolls? [^.]*(d[0-9]+|dice|die)/' },
  {
    id: 'text-free-cast',
    phrase: 'without paying its mana cost',
    pattern: /\bwithout paying (?:its|their|that card’s|that card's|that spell’s|that spell's|the spell’s|the spell's) mana costs?\b/i,
    query: 'o:"without paying"',
  },
  { id: 'text-cant-be-countered', phrase: 'can’t be countered', pattern: /\bcan[’']t be countered\b/i, query: 'o:"be countered"' },
  { id: 'text-each-opponent', phrase: 'each opponent', pattern: /\beach opponent\b/i, query: 'o:"each opponent"' },
  { id: 'text-shuffle', phrase: 'shuffle', pattern: /\bshuffles?\b/i, query: 'o:shuffle' },
  { id: 'text-life-total', phrase: 'life total', pattern: /\blife totals?\b/i, query: 'o:"life total"' },
  { id: 'text-sacrifice', phrase: 'sacrifice', pattern: /\bsacrifices?\b/i, query: 'o:sacrifice' },
  { id: 'text-discard', phrase: 'discard', pattern: /\bdiscards?\b/i, query: 'o:discard' },
  { id: 'text-tap-target', phrase: 'tap target', pattern: /\btap target\b/i, query: 'o:"tap target"' },
  { id: 'text-copy', phrase: 'copy', pattern: /\bcop(?:y|ies)\b/i, query: '(o:copy or o:copies)' },
  { id: 'text-return-to-hand', phrase: 'to its owner’s hand', pattern: /\bto (?:its|their) owners?[’']s? hands?\b/i, query: 'o:"owner\'s hand"' },
  {
    id: 'text-graveyard-to-battlefield',
    phrase: 'graveyard to the battlefield',
    pattern: /\bgraveyards? (?:to|onto) the battlefield\b/i,
    query: '(o:"graveyard to the battlefield" or o:"graveyard onto the battlefield" or o:"graveyards onto the battlefield")',
  },
  { id: 'text-double', phrase: 'double', pattern: /\bdoubles?\b/i, query: 'o:double', hint: 'Doubling damage, counters or tokens, or double strike.' },
  { id: 'text-hand-size', phrase: 'maximum hand size', pattern: /\bmaximum hand size\b/i, query: 'o:"maximum hand size"' },
  { id: 'text-face-down', phrase: 'face down', pattern: /\bface[ -]down\b/i, query: 'o:"face down"' },
  { id: 'text-phase-out', phrase: 'phases out', pattern: /\bphases? out\b/i, query: '(o:"phase out" or o:"phases out")' },
  { id: 'text-commander', phrase: 'commander', pattern: /\bcommanders?\b/i, query: 'o:commander' },
  { id: 'text-vote', phrase: 'vote', pattern: /\bvotes?\b/i, query: 'o:vote' },
  { id: 'text-day-night', phrase: 'it becomes night', pattern: /\bbecomes? (?:day|night)\b/i, query: '(o:"becomes day" or o:"becomes night" or o:"become day" or o:"become night")' },
];

const RULES_TEXT_PROMPTS = TEXT_PROMPTS.map(({ id, phrase, pattern, query, hint }) =>
  textQuestion({
    id,
    pattern,
    query,
    prompt: `Name a card with “${phrase}” in its rules text.`,
    shortLabel: `“${phrase}”`,
    hint: hint ?? 'The words must appear in the card’s rules text, in any form of the phrase. Reminder text doesn’t count.',
  }),
);

/* Triggers and other shapes of rules text. */
const MECHANIC_PROMPTS: QuestionDefinition[] = [
  {
    id: 'activated-ability',
    prompt: 'Name a card with an activated ability.',
    shortLabel: 'Activated ability',
    hint: 'Look for “cost: effect”, like {T}: Add {G}. Keyword costs such as Equip and Cycling count; reminder text alone doesn’t.',
    category: 'mechanic',
    status: 'active',
    // A superset of valid answers: colon costs plus keywords whose cost lives in reminder text.
    scryfallQueryHint: `(o:":" or ${ACTIVATED_KEYWORDS.map((k) => `o:"${k.toLowerCase()}"`).join(' or ')} or o:cycling)`,
    validatorFn: (card) => {
      for (const face of getFaces(card)) if (faceHasActivatedAbility(face)) return pass(card, face);
      return fail('No cost, no effect', `${card.name} has no “cost: effect” ability outside its reminder text, so it has nothing to activate.`);
    },
  },
  textQuestion({
    id: 'trigger-enters',
    category: 'mechanic',
    pattern: /\bwhen(?:ever)?\b[^.]*\benters\b/i,
    query: 'o:enters',
    prompt: 'Name a card with an “enters” trigger.',
    shortLabel: 'Enters trigger',
    hint: '“When this creature enters…” or “Whenever a creature enters…” on any face.',
    failReason: 'has no “when … enters” trigger in its rules text.',
  }),
  textQuestion({
    id: 'trigger-dies',
    category: 'mechanic',
    pattern: /\bwhen(?:ever)?\b[^.]*\bdies\b/i,
    query: 'o:dies',
    prompt: 'Name a card with a “dies” trigger.',
    shortLabel: 'Dies trigger',
    hint: '“When this creature dies…” or “Whenever another creature dies…” on any face.',
    failReason: 'has no “when … dies” trigger in its rules text.',
  }),
  textQuestion({
    id: 'trigger-attacks',
    category: 'mechanic',
    pattern: /\bwhenever\b[^.]*\battacks?\b/i,
    query: 'o:attack',
    prompt: 'Name a card with an attack trigger.',
    shortLabel: 'Attack trigger',
    hint: '“Whenever this creature attacks…” or “Whenever you attack…” on any face.',
    failReason: 'has no “whenever … attacks” trigger in its rules text.',
  }),
  textQuestion({
    id: 'trigger-upkeep',
    category: 'mechanic',
    pattern: /\bat the beginning of (?:your|each|each player’s|each player's|each opponent’s|each opponent's|the next|that player’s|that player's|target player’s|target player's|enchanted player’s|enchanted player's) upkeep\b/i,
    query: 'o:upkeep',
    prompt: 'Name a card with an upkeep trigger.',
    shortLabel: 'Upkeep trigger',
    hint: '“At the beginning of your upkeep…” or any other player’s upkeep.',
    failReason: 'has no “at the beginning of … upkeep” trigger.',
  }),
  textQuestion({
    id: 'trigger-cast',
    category: 'mechanic',
    pattern: /\bwhenever (?:you|a player|an opponent|another player) casts?\b/i,
    query: 'o:"whenever" o:cast',
    prompt: 'Name a card with a “whenever you cast” trigger.',
    shortLabel: 'Cast trigger',
    hint: 'Triggers on casting a spell: yours, an opponent’s or anyone’s.',
    failReason: 'has no “whenever … casts” trigger.',
  }),
  textQuestion({
    id: 'trigger-end-step',
    category: 'mechanic',
    pattern: /\bat the beginning of (?:your|each|the next|each player’s|each player's|each opponent’s|each opponent's)? ?end step\b/i,
    query: 'o:"end step"',
    prompt: 'Name a card with an end step trigger.',
    shortLabel: 'End step trigger',
    hint: '“At the beginning of your end step…” or any other end step.',
    failReason: 'has no “at the beginning of … end step” trigger.',
  }),
  textQuestion({
    id: 'modal-choose',
    category: 'mechanic',
    // "Choose one —" (or "Choose one. If…") followed by bullet-point modes.
    pattern: /\bchoose (?:one|two|three|four|one or both|one or more|any number|up to \w+)\b[^•]*•/i,
    query: 'o:choose',
    prompt: 'Name a modal card (“Choose one —”).',
    shortLabel: 'Modal card',
    hint: 'Charms, commands and other cards that list modes as bullet points after “Choose one”, “Choose two” or similar.',
    failReason: 'has no “Choose one —” style list of modes.',
  }),
];

/* ------------------------------------------------------------------------ */
/* Colors                                                                    */
/* ------------------------------------------------------------------------ */

const COLORS: ColorLetter[] = ['W', 'U', 'B', 'R', 'G'];
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const COLOR_PROMPTS: QuestionDefinition[] = [
  ...COLORS.map((c) =>
    colorsQuestion({
      id: `mono-${colorName(c)}`,
      accept: (colors) => colors.length === 1 && colors[0] === c,
      query: `c=${c.toLowerCase()}`,
      wanted: `${colorName(c)} and nothing else`,
      prompt: `Name a mono-${colorName(c)} card.`,
      shortLabel: `Mono-${colorName(c)}`,
      hint: `Exactly one color: ${colorName(c)}. Colorless costs like {2} are fine; hybrid or other colors aren’t.`,
    }),
  ),
  colorsQuestion({
    id: 'colorless-nonland',
    accept: (colors) => colors.length === 0,
    nonland: true,
    query: 'c=c -t:land',
    wanted: 'a colorless card',
    prompt: 'Name a colorless nonland card.',
    shortLabel: 'Colorless spell',
    hint: 'Artifacts, Eldrazi and other cards with no color. Lands don’t count.',
  }),
  colorsQuestion({
    id: 'multicolored',
    accept: (colors) => colors.length >= 2,
    query: 'c:m',
    wanted: 'two or more colors',
    prompt: 'Name a multicolored card.',
    shortLabel: 'Multicolored',
    hint: 'Two or more colors, counting every face and hybrid symbols.',
  }),
  colorsQuestion({
    id: 'three-color',
    accept: (colors) => colors.length === 3,
    query: '(c=wub or c=ubr or c=brg or c=rgw or c=gwu or c=wbg or c=urw or c=bgu or c=rwb or c=gur)',
    wanted: 'exactly three colors',
    prompt: 'Name a card with exactly three colors.',
    shortLabel: 'Three colors',
    hint: 'Shards, wedges and anything else with exactly three colors.',
  }),
  colorsQuestion({
    id: 'five-color',
    accept: (colors) => colors.length === 5,
    query: 'c=wubrg',
    wanted: 'all five colors',
    prompt: 'Name a five-color card.',
    shortLabel: 'Five colors',
    hint: 'White, blue, black, red and green, all on one card.',
  }),
  ...(['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Planeswalker'] as const).flatMap((type) =>
    COLORS.map((c) =>
      colorTypeQuestion({
        id: `${colorName(c)}-${type.toLowerCase()}`,
        color: c,
        type,
        prompt: `Name a ${colorName(c)} ${type}.`,
        shortLabel: `${title(colorName(c))} ${type}`,
        hint: `${title(colorName(c))} must be one of its colors. Multicolored ${type.toLowerCase()}s count.`,
      }),
    ),
  ),
  ...COLORS.map((c) =>
    colorTypeQuestion({
      id: `${colorName(c)}-artifact`,
      color: c,
      type: 'Artifact',
      prompt: `Name a ${colorName(c)} Artifact.`,
      shortLabel: `${title(colorName(c))} Artifact`,
      hint: `An artifact with ${colorName(c)} among its colors, like a colored artifact creature.`,
    }),
  ),
];

/* ------------------------------------------------------------------------ */
/* Mana and stats                                                            */
/* ------------------------------------------------------------------------ */

const manaCosts = (card: ScryfallCard) => [card.mana_cost ?? '', ...getFaces(card).map((f) => f.manaCost)].join(' ');
const frontIsLand = (card: ScryfallCard) => {
  const front = getFaces(card)[0];
  return Boolean(front && faceHasType(front, 'Land'));
};

const MANA_PROMPTS: QuestionDefinition[] = [
  cardQuestion({
    id: 'mv-zero-spell',
    category: 'mana',
    query: 'mv=0 -t:land',
    prompt: 'Name a nonland card with mana value 0.',
    shortLabel: 'Mana value 0',
    hint: 'Moxen, Ornithopter, suspend cards with no cost and the rest. Lands don’t count.',
    accept: (card) => !frontIsLand(card) && (card.cmc ?? 0) === 0,
    failTitle: 'Costs too much',
    failReason: (card) => (frontIsLand(card) ? `${card.name} is a land.` : `${card.name} has mana value ${card.cmc ?? 0}.`),
  }),
  cardQuestion({
    id: 'mv-seven-plus',
    category: 'mana',
    query: 'mv>=7',
    prompt: 'Name a card with mana value 7 or more.',
    shortLabel: 'Mana value 7+',
    hint: 'Eldrazi titans, big dragons and other expensive cards. X counts as 0.',
    accept: (card) => (card.cmc ?? 0) >= 7,
    failTitle: 'Not expensive enough',
    failReason: (card) => `${card.name} has mana value ${card.cmc ?? 0}. The prompt needs 7 or more.`,
  }),
  cardQuestion({
    id: 'mv-ten-plus',
    category: 'mana',
    query: 'mv>=10',
    prompt: 'Name a card with mana value 10 or more.',
    shortLabel: 'Mana value 10+',
    hint: 'The very top of the curve. X counts as 0.',
    accept: (card) => (card.cmc ?? 0) >= 10,
    failTitle: 'Not expensive enough',
    failReason: (card) => `${card.name} has mana value ${card.cmc ?? 0}. The prompt needs 10 or more.`,
  }),
  cardQuestion({
    id: 'one-drop-creature',
    category: 'mana',
    query: 't:creature mv=1',
    prompt: 'Name a creature with mana value 1.',
    shortLabel: 'One-drop creature',
    hint: 'A creature face, and the card’s mana value is exactly 1.',
    accept: (card) => (card.cmc ?? 0) === 1 && (findFace(card, (f) => faceHasType(f, 'Creature')) ?? false),
    failTitle: 'Not a one-drop',
    failReason: (card) =>
      findFace(card, (f) => faceHasType(f, 'Creature'))
        ? `${card.name} has mana value ${card.cmc ?? 0}, not 1.`
        : `${typeSummary(card)}, not a creature.`,
  }),
  cardQuestion({
    id: 'x-cost',
    category: 'mana',
    query: 'm:{X}',
    prompt: 'Name a card with {X} in its mana cost.',
    shortLabel: 'X spell',
    hint: 'Fireball, Hydroid Krasis and every other card with X in its cost.',
    accept: (card) => /\{X\}/.test(manaCosts(card)),
    failTitle: 'No X here',
    failReason: (card) => `${card.name}’s mana cost has no {X}.`,
  }),
  cardQuestion({
    id: 'phyrexian-mana',
    category: 'mana',
    query: '(m:{W/P} or m:{U/P} or m:{B/P} or m:{R/P} or m:{G/P} or m:{C/P})',
    prompt: 'Name a card with Phyrexian mana in its cost.',
    shortLabel: 'Phyrexian mana',
    hint: 'Gitaxian Probe, Dismember and every cost you can pay with 2 life.',
    accept: (card) => /\/P\}/.test(manaCosts(card)),
    failTitle: 'No Phyrexian mana',
    failReason: (card) => `${card.name}’s mana cost has no Phyrexian symbols.`,
  }),
  cardQuestion({
    id: 'hybrid-mana',
    category: 'mana',
    query: 'is:hybrid',
    prompt: 'Name a card with hybrid mana in its cost.',
    shortLabel: 'Hybrid mana',
    hint: 'Two-color hybrid like {W/U}, or {2/W} and {C/W}. Phyrexian mana alone doesn’t count.',
    accept: (card) => /\{(?:[WUBRG]\/[WUBRG]|2\/[WUBRG]|C\/[WUBRG])\}/.test(manaCosts(card)),
    failTitle: 'No hybrid mana',
    failReason: (card) => `${card.name}’s mana cost has no hybrid symbols.`,
  }),
  cardQuestion({
    id: 'colorless-symbol',
    category: 'mana',
    query: 'm:{C}',
    prompt: 'Name a card with {C} in its mana cost.',
    shortLabel: '{C} in cost',
    hint: 'The colorless mana symbol, mostly on Eldrazi. Generic costs like {2} don’t count.',
    accept: (card) => /\{C\}/.test(manaCosts(card)),
    failTitle: 'No {C} here',
    failReason: (card) => `${card.name}’s mana cost has no {C} symbol. Generic mana like {2} isn’t the same.`,
  }),
  cardQuestion({
    id: 'no-mana-cost',
    category: 'mana',
    query: 'mv=0 -t:land',
    prompt: 'Name a nonland card with no mana cost at all.',
    shortLabel: 'No mana cost',
    hint: 'Ancestral Vision, Living End and others with a blank cost box. {0} is a cost, so Moxen don’t count.',
    accept: (card) => {
      const front = getFaces(card)[0];
      return Boolean(front && !faceHasType(front, 'Land') && !front.manaCost && !card.mana_cost);
    },
    failTitle: 'It has a cost',
    failReason: (card) => (frontIsLand(card) ? `${card.name} is a land.` : `${card.name} costs ${card.mana_cost || getFaces(card)[0]?.manaCost}.`),
  }),
];

const STAT_PROMPTS: QuestionDefinition[] = [
  statQuestion({
    id: 'power-seven',
    stat: 'power',
    atLeast: 7,
    prompt: 'Name a creature with power 7 or greater.',
    shortLabel: 'Power 7+',
    hint: 'Printed power only. Stars (*) don’t count.',
  }),
  statQuestion({
    id: 'power-ten',
    stat: 'power',
    atLeast: 10,
    prompt: 'Name a creature with power 10 or greater.',
    shortLabel: 'Power 10+',
    hint: 'Printed power only. Stars (*) don’t count.',
  }),
  statQuestion({
    id: 'toughness-seven',
    stat: 'toughness',
    atLeast: 7,
    prompt: 'Name a creature with toughness 7 or greater.',
    shortLabel: 'Toughness 7+',
    hint: 'Printed toughness only. Stars (*) don’t count.',
  }),
  statQuestion({
    id: 'power-zero',
    stat: 'power',
    exactly: 0,
    prompt: 'Name a creature with 0 power.',
    shortLabel: '0 power',
    hint: 'A printed 0, like Ornithopter or a wall. Stars (*) don’t count.',
  }),
  statQuestion({
    id: 'one-one',
    stat: 'power',
    exactly: 1,
    alsoToughness: 1,
    prompt: 'Name a 1/1 creature.',
    shortLabel: '1/1 creature',
    hint: 'Printed power 1 and toughness 1.',
  }),
  statQuestion({
    id: 'two-two',
    stat: 'power',
    exactly: 2,
    alsoToughness: 2,
    prompt: 'Name a 2/2 creature.',
    shortLabel: '2/2 creature',
    hint: 'Printed power 2 and toughness 2. Grizzly Bears would be proud.',
  }),
  statQuestion({
    id: 'loyalty-six',
    stat: 'loyalty',
    atLeast: 6,
    prompt: 'Name a planeswalker with starting loyalty 6 or more.',
    shortLabel: 'Loyalty 6+',
    hint: 'The loyalty printed in the corner.',
  }),
];

/* ------------------------------------------------------------------------ */
/* Formats and lists                                                         */
/* ------------------------------------------------------------------------ */

const FORMAT_PROMPTS: QuestionDefinition[] = [
  {
    id: 'commander-legal',
    prompt: 'Name a Commander-legal card.',
    shortLabel: 'Commander-legal card',
    hint: "Anything you could put in a 100-card Commander deck. Cards on Commander's banned list don't count here.",
    category: 'format',
    status: 'active',
    scryfallQueryHint: 'f:commander',
    validatorFn: (card) => {
      const status = card.legalities.commander ?? 'not_legal';
      if (status === 'legal') return { ok: true };
      if (status === 'banned') return fail('Banned in Commander', `${card.name} is on Commander's banned list, so it can't go in a Commander deck.`);
      return fail('Not legal in Commander', `${card.name} isn't legal in Commander.`);
    },
  },
  ...(
    [
      ['pauper', 'Pauper', 'Commons only: printed at common somewhere, on paper or Magic Online.'],
      ['modern', 'Modern', 'Legal in Modern today. Banned cards don’t count.'],
      ['pioneer', 'Pioneer', 'Legal in Pioneer today. Banned cards don’t count.'],
      ['standard', 'Standard', 'Legal in Standard today. Banned cards don’t count.'],
      ['premodern', 'Premodern', 'Legal in Premodern: Fourth Edition through Scourge.'],
      ['oldschool', 'Old School', 'Legal in Old School 93/94.'],
    ] as const
  ).map(
    ([format, name, hint]): QuestionDefinition => ({
      id: `${format}-legal`,
      prompt: `Name a ${name}-legal card.`,
      shortLabel: `${name}-legal`,
      hint,
      category: 'format',
      status: 'active',
      scryfallQueryHint: `f:${format}`,
      validatorFn: (card) => {
        const status = card.legalities[format] ?? 'not_legal';
        if (status === 'legal') return { ok: true };
        return fail(
          status === 'banned' ? `Banned in ${name}` : `Not legal in ${name}`,
          status === 'banned' ? `${card.name} is banned in ${name}.` : `${card.name} isn’t legal in ${name}.`,
        );
      },
    }),
  ),
  ...(
    [
      ['commander', 'Commander', 'banned'],
      ['modern', 'Modern', 'banned'],
      ['legacy', 'Legacy', 'banned'],
      ['pioneer', 'Pioneer', 'banned'],
      ['vintage', 'Vintage', 'restricted'],
    ] as const
  ).map(
    ([format, name, list]): QuestionDefinition => ({
      id: `${list}-${format}`,
      prompt: list === 'banned' ? `Name a card banned in ${name}.` : 'Name a card restricted in Vintage.',
      shortLabel: list === 'banned' ? `Banned in ${name}` : 'Restricted in Vintage',
      hint:
        list === 'banned'
          ? `Anything on ${name}’s banned list today, ante and dexterity cards included.`
          : 'One of the cards Vintage limits to a single copy: Black Lotus, the Moxen and friends.',
      category: 'format',
      status: 'active',
      scryfallQueryHint: `${list}:${format}`,
      validatorFn: (card) => {
        if (card.legalities[format] === list) return { ok: true };
        return fail(`Not ${list}`, `${card.name} isn’t ${list} in ${name}. It’s ${(card.legalities[format] ?? 'not_legal').replace('_', ' ')} there.`);
      },
    }),
  ),
  cardQuestion({
    id: 'reserved-list',
    category: 'format',
    query: 'is:reserved',
    prompt: 'Name a card on the Reserved List.',
    shortLabel: 'Reserved List',
    hint: 'The cards Wizards promised never to reprint, from Alpha through Urza’s Destiny.',
    accept: (card) => card.reserved,
    failTitle: 'Not reserved',
    failReason: (card) => `${card.name} isn’t on the Reserved List.`,
  }),
  cardQuestion({
    id: 'game-changer',
    category: 'format',
    query: 'is:gamechanger',
    prompt: 'Name a Commander Game Changer.',
    shortLabel: 'Game Changer',
    hint: 'One of the cards on Commander’s Game Changers list, which push a deck into a higher bracket.',
    accept: (card) => Boolean(card.game_changer),
    failTitle: 'Not a Game Changer',
    failReason: (card) => `${card.name} isn’t on the Game Changers list.`,
  }),
];

/* ------------------------------------------------------------------------ */
/* Layouts                                                                   */
/* ------------------------------------------------------------------------ */

const LAYOUT_PROMPTS: QuestionDefinition[] = (
  [
    ['double-faced', 'Name a double-faced card.', 'Double-faced card', 'Transforming and modal double-faced cards, battles included.', '(is:transform or is:mdfc)', ['transform', 'modal_dfc']],
    ['modal-dfc', 'Name a modal double-faced card.', 'Modal DFC', 'Cards you can cast as either face, like the Zendikar Rising spell lands.', 'is:mdfc', ['modal_dfc']],
    ['transform', 'Name a card that transforms.', 'Transforming card', 'Werewolves, flip-walkers and every other card with a transform back.', 'is:transform', ['transform']],
    ['split-card', 'Name a split card.', 'Split card', 'Two spells on one card, including fuse and aftermath cards.', 'is:split', ['split']],
    ['adventure', 'Name an Adventure card.', 'Adventure card', 'A creature or permanent with an Adventure spell attached.', 't:adventure', ['adventure']],
    ['flip-card', 'Name a flip card.', 'Flip card', 'The Kamigawa cards you turn upside down.', 'is:flip', ['flip']],
    ['leveler', 'Name a leveler.', 'Leveler', 'Rise of the Eldrazi’s level up creatures.', 'is:leveler', ['leveler']],
    ['meld-card', 'Name a card that melds.', 'Meld card', 'One half of a meld pair. The melded result itself doesn’t count.', 'is:meld', ['meld']],
  ] as const
).map(([id, prompt, shortLabel, hint, query, layouts]) =>
  cardQuestion({
    id,
    category: 'layout',
    query,
    prompt,
    shortLabel,
    hint,
    accept: (card) => (layouts as readonly string[]).includes(card.layout),
    failTitle: 'Wrong shape',
    failReason: (card) => `${card.name} is a ${card.layout.replace('_', ' ')} card.`,
  }),
);

/* ------------------------------------------------------------------------ */
/* Names                                                                     */
/* ------------------------------------------------------------------------ */

const NAME_PROMPTS: QuestionDefinition[] = [
  ...['Q', 'Z', 'X', 'K', 'V', 'J', 'Y', 'U', 'O', 'I', 'E', 'N'].map((letter) =>
    cardQuestion({
      id: `starts-with-${letter.toLowerCase()}`,
      category: 'name',
      query: `name:/^${letter.toLowerCase()}/`,
      prompt: `Name a card whose name starts with ${letter}.`,
      shortLabel: `Starts with ${letter}`,
      hint: 'The first letter of the card’s name, or of either face’s name. Accents are ignored.',
      accept: (card) => startsWithLetter(card, letter),
      failTitle: 'Wrong letter',
      failReason: (card) => `${card.name} doesn’t start with ${letter}.`,
    }),
  ),
  cardQuestion({
    id: 'one-word-name',
    category: 'name',
    query: 'name:/^[^ ]+$/',
    prompt: 'Name a card with a one-word name.',
    shortLabel: 'One-word name',
    hint: 'Counterspell, Brainstorm, Ornithopter: no spaces at all. Hyphenated words count as one.',
    accept: (card) => !/\s/.test(card.name),
    failTitle: 'Too many words',
    failReason: (card) => `${card.name} has more than one word.`,
  }),
  cardQuestion({
    id: 'long-name',
    category: 'name',
    query: 'name:/ .* .* .* /',
    prompt: 'Name a card with five or more words in its name.',
    shortLabel: 'Five-word name',
    hint: 'Count the words in the full name. “//” between split halves isn’t a word.',
    accept: (card) => card.name.replace(/\/\//g, ' ').split(/\s+/).filter(Boolean).length >= 5,
    failTitle: 'Too short',
    failReason: (card) => `${card.name} has fewer than five words.`,
  }),
  cardQuestion({
    id: 'comma-name',
    category: 'name',
    query: 'name:/,/',
    prompt: 'Name a card with a comma in its name.',
    shortLabel: 'Comma in name',
    hint: 'Mostly legends: “Ragavan, Nimble Pilferer”.',
    accept: (card) => cardNames(card).some((n) => n.includes(',')),
    failTitle: 'No comma',
    failReason: (card) => `${card.name} has no comma in its name.`,
  }),
  cardQuestion({
    id: 'apostrophe-name',
    category: 'name',
    query: "name:/'/",
    prompt: 'Name a card with an apostrophe in its name.',
    shortLabel: 'Apostrophe in name',
    hint: 'Urza’s Saga, Gaea’s Cradle, Mishra’s Factory and the rest.',
    accept: (card) => cardNames(card).some((n) => /['’]/.test(n)),
    failTitle: 'No apostrophe',
    failReason: (card) => `${card.name} has no apostrophe in its name.`,
  }),
  cardQuestion({
    id: 'of-the-name',
    category: 'name',
    query: 'name:"of the"',
    prompt: 'Name a card with “of the” in its name.',
    shortLabel: '“of the” name',
    hint: 'Sword of the Meek, Hymn of the… you get the idea.',
    accept: (card) => cardNames(card).some((n) => /\bof the\b/i.test(n)),
    failTitle: 'No “of the”',
    failReason: (card) => `${card.name} doesn’t have “of the” in its name.`,
  }),
];

/* ------------------------------------------------------------------------ */
/* The pool                                                                  */
/* ------------------------------------------------------------------------ */

export const QUESTION_POOL: readonly QuestionDefinition[] = [
  ...CARD_TYPES,
  ...TYPE_COMBOS,
  ...OTHER_SUBTYPE_PROMPTS,
  ...CREATURE_TYPE_PROMPTS,
  ...PLANESWALKER_PROMPTS,
  ...CREATURE_KEYWORD_PROMPTS,
  ...CARD_KEYWORD_PROMPTS,
  ...ABILITY_WORD_PROMPTS,
  ...MECHANIC_PROMPTS,
  ...RULES_TEXT_PROMPTS,
  ...COLOR_PROMPTS,
  ...MANA_PROMPTS,
  ...STAT_PROMPTS,
  ...FORMAT_PROMPTS,
  ...LAYOUT_PROMPTS,
  ...NAME_PROMPTS,
];

export const ACTIVE_QUESTIONS = QUESTION_POOL.filter((q) => q.status === 'active');

const BY_ID = new Map(QUESTION_POOL.map((q) => [q.id, q]));

export function questionById(id: string): QuestionDefinition | undefined {
  return BY_ID.get(id);
}

/* ------------------------------------------------------------------------ */
/* Selection                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * The same seven prompts, in the same order, for everyone on a UTC day.
 * Each comes from a different category, so one day can't be all creature
 * types or all keywords.
 */
export function selectDailyQuestions(
  dateKey: string,
  count = DAILY_QUESTION_COUNT,
  pool: readonly QuestionDefinition[] = ACTIVE_QUESTIONS,
): QuestionDefinition[] {
  const rng = seededRandom(`magillion:daily:v2:${dateKey}`);
  const byCategory = new Map<QuestionCategory, QuestionDefinition[]>();
  for (const q of pool) byCategory.set(q.category, [...(byCategory.get(q.category) ?? []), q]);

  const picked: QuestionDefinition[] = [];
  for (const category of shuffle([...byCategory.keys()], rng)) {
    if (picked.length >= count) break;
    const options = byCategory.get(category) ?? [];
    const choice = options[Math.floor(rng() * options.length)];
    if (choice) picked.push(choice);
  }
  // Fewer categories than prompts: fill from the rest of the pool.
  if (picked.length < count) {
    const taken = new Set(picked.map((q) => q.id));
    picked.push(...shuffle(pool.filter((q) => !taken.has(q.id)), rng).slice(0, count - picked.length));
  }
  return picked;
}

/** How many prompts the pool holds per category, for the docs and tests. */
export function categoryCounts(pool: readonly QuestionDefinition[] = ACTIVE_QUESTIONS): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const q of pool) counts[q.category] = (counts[q.category] ?? 0) + 1;
  return counts;
}
