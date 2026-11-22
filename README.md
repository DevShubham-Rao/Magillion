# Magillion

A daily *Magic: The Gathering* trivia game where the most obscure valid answer wins. Each round asks you to name a card ("Name a Planeswalker."). Any real paper card counts, banned ones included, as long as it fits the prompt. The less it's played, in whichever format plays it most, the more points it scores.

Cards resolve live against [Scryfall](https://scryfall.com): names, art, legality and EDHREC rank. 60-card popularity comes from a static snapshot of the official [Magic Online decklists](https://www.mtgo.com/decklists), rebuilt nightly. There's no backend and no API key.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (scoring, validators, resolver, typo matching, eligibility, data builder)
npm run build      # typecheck + production bundle in dist/
npm run data:metagame   # rebuild public/data/metagame.json (see below)
```

Requires Node 20+.

## How a round works

The prompt stays sealed until you start the round. Then you get **45 seconds** and **3 attempts**. There is no suggestion list: you type a name and lock it in.

1. **Resolve.** `services/answerResolver.ts` turns the text into one card:
   - An exact name (either face) is taken at its word: `Ice` is *Fire // Ice*.
   - A partial name is finished as the **most-played card that fits the prompt**, so vagueness never pays: `urza` on "Name a Legendary Creature" becomes *Urza, Lord High Artificer*, and `bolt` on "Name an Instant" becomes *Lightning Bolt*.
   - Typos are corrected against Scryfall's catalog of every card name (edit distance, filler words optional): `the wizzer` becomes *The Whizzer, Classic Speedster* and `jace mind sculpter` becomes *Jace, the Mind Sculptor*.
   - "Most-played" is measured across Commander and 60-card play, so a partial name never lands on a card that's obscure in Commander but a staple in Modern or Vintage.
2. **Pool and prompt check.** The card must be a real tournament card (legal, restricted or banned in Vintage or Commander) and fit the prompt; validators inspect every face. That admits *Mana Crypt*, *Black Lotus* and ante cards, and turns away Un-cards, Arena-only Alchemy cards, tokens and meld results. A miss costs an attempt and explains why. Naming a card you already used, or a name that matches nothing, costs no attempt.
3. **Score.** The card's play in its most-played format becomes 50–1,000 obscurity points and a tier, plus up to 100 speed-bonus points for time left on the clock.

Running out of time or attempts scores 0. Passing scores 0. Time spent waiting on Scryfall is given back to the clock, and a reload can't reset it.

Scryfall's limits are respected: `/cards/search` and `/cards/named` at most 2 requests per second, other endpoints 10 per second, and a full stop for 31 seconds after any 429. Results are cached in memory; the name catalog is cached in localStorage for a day.

## Scoring

Every format is put on one scale, an **EDHREC-equivalent rank**, and the card scores as its most-played format (the lowest equivalent rank wins):

- **Commander:** EDHREC rank from Scryfall. Basic lands count as #1. Cards banned in Commander have no EDHREC rank; if they're still legal or restricted in Vintage they count as #1,000 (banned cards are infamous), otherwise as unranked.
- **Standard, Pioneer, Modern, Legacy, Vintage, Pauper:** the share of decks running the card (main or sideboard) across the last 30 days of Magic Online league 5-0s and challenge top finishes, converted by a power law and divided by the format's reach:

```
equivalent rank(share) = 300 × (0.25 / share)^0.805 / reach
                         (25% of decks → #300, 1% → #4,000, before reach)
reach: Modern 0.9, Legacy 0.85, Pioneer 0.85, Standard 0.8, Vintage 0.75, Pauper 0.7
```

The rank then goes through the points curve:

```
obscurity(rank) = ln(1 + (rank − 1) / 1800) / ln(1 + 19999 / 1800)
points          = 50 + 950 × obscurity          (rank ≥ 20,000 or unplayed everywhere → 1,000)
round total     = points + round(100 × time left / 45 s)
```

About 32,700 cards have an EDHREC rank, and the back half is mostly draft filler. The ceiling sits at #20,000 so a genuine deep cut can reach the top tier without knowing the filler.

| Measured | Points | Tier |
|---|---|---|
| EDHREC #1 (Sol Ring) | 50 | Common Staple |
| 55% of Vintage decks | 92 | Common Staple |
| 25% of Modern decks | 114 | Common Staple |
| EDHREC #1,000, or banned in Commander | 218 | Uncommon Pick |
| EDHREC #3,234 (Jace, the Mind Sculptor) | 442 | Rare Find |
| 1% of Modern decks | 524 | Rare Find |
| EDHREC #9,451 (Serra Angel) | 748 | Mythic Relic |
| EDHREC #13,306 (Fire // Ice) | 860 | Timeshifted Anomaly |
| #18,650+ everywhere | 976–1,000 | Lost to the Blind Eternities |

Cards whose first printing is under 45 days old score as Commander rank #6,000 until EDHREC has data (60-card play still counts). If the snapshot fails to load, scoring falls back to Commander alone and the reveal says so. The reveal lists every format that plays the card and marks the one that set the score.

## 60-card popularity data

`npm run data:metagame` (`scripts/build-metagame.ts`, plain Node 24, no extra dependencies) writes `public/data/metagame.json`:

1. Downloads Scryfall's oracle-cards bulk file from data.scryfall.io (no rate limit) to map Magic Online card names to oracle ids, including split cards (`Wear/Tear`) and front faces.
2. Reads mtgo.com's monthly decklist indexes, then each Standard, Pioneer, Modern, Legacy, Vintage and Pauper event in the window, one page per second. Event pages embed their decklists as JSON. When mtgo.com's backend is slow it half-loads pages: an event page redirects to the index or loads without its decklists, and an index page loads with an empty event list. All of these are retried with backoff (missed events get a second pass a minute later) and never cached, since every published event has decks.
3. Looks up any name the bulk file didn't cover on Scryfall's search, at most 2 requests a second. These are mostly Magic Online's own names for some Universes Beyond cards (it lists Aunt May as "Zora, Spider Fancier"), which Scryfall keeps only on the Magic Online printing. Hits are cached in `.cache/scryfall/aliases.json`.
4. Counts decks per card, drops cards in fewer than 3 decks as noise, and writes the counts. It exits with an error and leaves the old file alone if a monthly index lists no events (unless the month began less than two days ago), more than 15% of events can't be read, or any format ends up with fewer than 40 decks.

Event pages older than two days are cached in `.cache/mtgo/` (git-ignored, and kept between workflow runs along with the alias file), so reruns only fetch new events. A cold run reads about 350 pages; how long that takes depends on how quickly mtgo.com answers.

`.github/workflows/metagame.yml` runs the builder daily at 06:20 UTC and commits the file when it changes, using the default `GITHUB_TOKEN` with write access. Any host that deploys on push (Vercel, Netlify, Cloudflare Pages) serves the new file automatically. A GitHub Pages deploy workflow wouldn't be triggered by that commit, so call it from this workflow if you go that route.

## Architecture

```
src/
  types/mtg.ts              Scryfall shapes, QuestionDefinition, RarityTier, ScoreResult,
                            FormatPopularityProvider, AggregationStrategy
  types/game.ts             Answers, daily records, persisted player progress
  types/metagame.ts         Shape of the 60-card snapshot (shared with the builder)
  services/
    scryfallService.ts      Per-endpoint rate limits, 429 lockout, TTL cache, name catalog
    answerResolver.ts       Exact / completion / typo resolution to one card
    scoringEngine.ts        Points curve, EDHREC and Magic Online providers, CrossFormatAggregator
    metagame.ts             Loads and indexes public/data/metagame.json
    cardEligibility.ts      The card pool (any tournament card) with player-facing reasons
    progressStore.ts        ProgressRepository (localStorage today) + pure state updates
    audioCues.ts            Procedural Web Audio cues per tier
    share.ts                Spoiler-free share text
  data/
    questionPool.ts         10 active prompts, validator factories, seeded daily selector
    rarityTiers.ts          Tier thresholds and visual tokens
    gameRules.ts            Round length, attempts, speed bonus
  lib/fuzzy.ts              Typo-tolerant name matching
  hooks/useGame.ts          Round clock, attempts and state machine for both modes
  components/               Foil card, reveal, play breakdown, round timer, answer field, summary, SVG art
scripts/
  build-metagame.ts         Nightly 60-card snapshot builder
  metagame/parse.ts         Pure parsing and counting (unit tested)
```

### Adding a prompt

Use a factory in `data/questionPool.ts` (`typeQuestion`, `keywordCreatureQuestion`, `statQuestion`, `subtypeQuestion`) or write a `validatorFn` by hand, then append it to `QUESTION_POOL`. Mark it `status: 'experimental'` to keep it out of the daily rotation. The daily selector shuffles only `active` prompts with a PRNG seeded by the UTC date, so changing the pool changes future gauntlets; a gauntlet already in progress keeps its stored prompts.

### Tuning or adding a format

`createDefaultScoringEngine(source, loadMetagame)` registers `EdhrecPopularityProvider` for Commander and `MetagamePopularityProvider` for each 60-card format, combined with the `max-popularity` strategy. Tune the 60-card conversion through `DEFAULT_METAGAME_CURVE` (the two share-to-rank anchors and each format's reach) and the points curve through `DEFAULT_EDHREC_CURVE`.

To track another Magic Online format, add it to `METAGAME_FORMATS` in `types/metagame.ts` (the builder picks up events whose slug starts with that name) and give it a reach. For data from somewhere else, implement `FormatPopularityProvider` or feed a ranked list to `RankTablePopularityProvider`, and register it with the aggregator. `weighted-penalty` is also available if a source is too noisy to trust with `max-popularity`; both strategies are covered by tests.

### Swapping storage for a backend

The game only talks to a `ProgressRepository` (`load` / `save`). All progress changes (`recordDailyAnswer`, streaks, practice stats) are pure functions over one `PlayerProgress` document, so they can run server-side unchanged.

## Credits

Card data, images and EDHREC ranks from Scryfall. Commander popularity from EDHREC. 60-card popularity from the official Magic Online decklists published by Wizards of the Coast.

Magillion is unofficial Fan Content permitted under the Fan Content Policy. Not approved or endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
