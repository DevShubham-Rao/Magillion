# Magillion

A daily *Magic: The Gathering* trivia game where the most obscure valid answer wins. Each round asks you to name a card ("Name a Planeswalker."). Your card has to be Commander-legal and fit the prompt; the fewer Commander decks run it, the more points it scores.

Everything resolves live against [Scryfall](https://scryfall.com): suggestions, card art, legality and EDHREC rank. There's no backend and no API key.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (scoring curve, validators, ranking, eligibility)
npm run build      # typecheck + production bundle in dist/
```

Requires Node 20+.

## How a round works

1. **Search.** Typing queries Scryfall (debounced 150 ms, at most one request per 100 ms, results cached for 30 minutes). Prefix and exact-face matches come first, so `ice` finds *Fire // Ice*, `valki` finds *Valki, God of Lies // Tibalt, Cosmic Impostor*, and `Boom Pile` finds *Boompile*. When nothing matches, Scryfall's fuzzy matcher catches typos. Enter on free text runs `/cards/named?fuzzy=`.
2. **Legality.** `legalities.commander` must be `legal`. Banned cards, Un-cards, digital-only cards, previews, sticker sheets and meld results are turned away with a reason. A rejection never costs the round.
3. **Prompt check.** The question's validator inspects every face, so the back of an MDFC or the instant half of an adventure counts. A failure explains why.
4. **Score.** EDHREC rank becomes points on a 50–1,000 curve and one of six tiers. The card turns over in a frame forged from that tier's metal.

Each card can answer once per gauntlet. You can pass a round for 0 points.

## Scoring

```
obscurity(rank) = ln(1 + (rank − 1) / 4000) / ln(1 + 24999 / 4000)
points          = 50 + 950 × obscurity          (rank ≥ 25,000 or unranked → 1,000)
```

| EDHREC rank | Points | Tier |
|---|---|---|
| #1 (Sol Ring) | 50 | Common Staple |
| #3,234 (Jace, the Mind Sculptor) | 334 | Uncommon Pick |
| #4,294 (Vraska, Golgari Queen) | 400 | Rare Find |
| #9,451 (Serra Angel) | 632 | Mythic Relic |
| #20,000 | 909 | Timeshifted Anomaly |
| #24,000+ | 983–1,000 | Lost to the Blind Eternities |

Two corrections keep the daily fair: basic lands (unranked on EDHREC, but in every deck) count as rank #1, and cards whose first printing is under 45 days old score as rank #6,000 until EDHREC has data.

## Architecture

```
src/
  types/mtg.ts              Scryfall shapes, QuestionDefinition, RarityTier, ScoreResult,
                            FormatPopularityProvider, AggregationStrategy
  types/game.ts             Answers, daily records, persisted player progress
  services/
    scryfallService.ts      Rate-limited queue, TTL cache, suggestion ranking, fuzzy resolve
    scoringEngine.ts        EDHREC curve, providers, CrossFormatAggregator, ScoringEngine
    cardEligibility.ts      Commander legality with player-facing reasons
    progressStore.ts        ProgressRepository (localStorage today) + pure state updates
    audioCues.ts            Procedural Web Audio cues per tier
    share.ts                Spoiler-free share text
  data/
    questionPool.ts         10 active prompts, validator factories, seeded daily selector
    rarityTiers.ts          Tier thresholds and visual tokens
  hooks/useGame.ts          Round state machine for daily and practice modes
  components/               Foil card, reveal, search combobox, summary, SVG art
```

### Adding a prompt

Use a factory in `data/questionPool.ts` (`typeQuestion`, `keywordCreatureQuestion`, `statQuestion`, `subtypeQuestion`) or write a `validatorFn` by hand, then append it to `QUESTION_POOL`. Mark it `status: 'experimental'` to keep it out of the daily rotation. The daily selector shuffles only `active` prompts with a PRNG seeded by the UTC date, so changing the pool changes future gauntlets; a gauntlet already in progress keeps its stored prompts.

### Adding a format

`ScoringEngine` reads popularity through `FormatPopularityProvider`s combined by a `CrossFormatAggregator`. v1 registers only `EdhrecPopularityProvider` with the `primary-only` strategy. To stop Modern staples farming points:

```ts
const modern = new RankTablePopularityProvider('mtgdecks-modern', 'MTGDecks', {
  modern: { ranks: oracleIdToRank, poolSize: 1800 },
});
const aggregator = new CrossFormatAggregator(
  'commander',
  [
    { provider: edhrec, format: 'commander', weight: 1 },
    { provider: modern, format: 'modern', weight: 0.8 },
  ],
  { kind: 'max-popularity', weights: { modern: 0.8 } },
);
```

`max-popularity` caps a card at its most-played format; `weighted-penalty` subtracts a capped, weighted share instead. Both are covered by tests.

### Swapping storage for a backend

The game only talks to a `ProgressRepository` (`load` / `save`). All progress changes (`recordDailyAnswer`, streaks, practice stats) are pure functions over one `PlayerProgress` document, so they can run server-side unchanged.

## Credits

Card data, images and EDHREC ranks from Scryfall. Popularity data from EDHREC.

Magillion is unofficial Fan Content permitted under the Fan Content Policy. Not approved or endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
