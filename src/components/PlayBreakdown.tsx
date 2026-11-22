import type { FormatContribution, ScoreResult } from '../types/mtg';
import { BANNED_IN_COMMANDER_RANK, FORMAT_NAMES, formatShare } from '../services/scoringEngine';

/** "EDHREC #3,234", "Banned", "24% of decks". */
function measure(c: FormatContribution): string {
  const p = c.popularity;
  if (p.format === 'commander') {
    if (p.rank != null) return `EDHREC #${p.rank.toLocaleString('en-US')}`;
    if (p.scoredRank === 1) return 'Basic land, counts as #1';
    if (p.scoredRank === BANNED_IN_COMMANDER_RANK) return 'Banned, counts as #1,000';
    return 'Not ranked on EDHREC';
  }
  return `${formatShare(p.share ?? 0)} of decks`;
}

/**
 * Where the revealed card is played: Commander always, plus every 60-card
 * format with recent decks running it. The format that set the score is
 * marked.
 */
export function PlayBreakdown({ score, accent }: { score: ScoreResult; accent: string }) {
  const usable = score.contributions.filter((c) => c.popularity.confidence !== 'unavailable');
  const commander = usable.find((c) => c.popularity.format === 'commander');
  const played = usable
    .filter((c) => c.popularity.format !== 'commander' && (c.popularity.share ?? 0) > 0)
    .sort((a, b) => b.popularity.popularity - a.popularity.popularity);
  const rows = [...(commander ? [commander] : []), ...played];
  const measured60 = usable.some((c) => c.popularity.format !== 'commander');
  const deciding = score.deciding;
  const decidingName = deciding ? FORMAT_NAMES[deciding.popularity.format] : null;
  const nothingPlays = score.obscurity >= 1;

  return (
    <div className="mx-auto mt-6 max-w-md text-left lg:mx-0">
      <p className="text-xs text-ash">Where it's played</p>
      <dl className="mt-1.5">
        {rows.map((c) => {
          const isDeciding = c === deciding && !nothingPlays;
          return (
            <div key={c.popularity.format} className="flex items-baseline justify-between gap-4 border-b border-gold/10 py-1.5">
              <dt className={`flex items-center gap-2 font-display ${isDeciding ? 'font-bold text-parchment' : 'text-parchment/75'}`}>
                <span aria-hidden="true" className="text-[10px]" style={{ color: isDeciding ? accent : 'transparent' }}>
                  ◆
                </span>
                {FORMAT_NAMES[c.popularity.format]}
              </dt>
              <dd className={`tabular text-sm ${isDeciding ? 'font-semibold text-parchment' : 'text-parchment/75'}`}>
                {measure(c)}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-2 text-xs leading-relaxed text-ash">
        {nothingPlays
          ? measured60
            ? 'No Commander or recent 60-card decks run it, so it scores the maximum.'
            : 'No Commander decks run it, so it scores the maximum.'
          : `Scored on ${decidingName}, where it's played most. ${
              measured60 && played.length === 0 ? 'No recent 60-card decks run it. ' : ''
            }Commander uses EDHREC rank; 60-card formats use the last 30 days of Magic Online decklists.`}
      </p>
    </div>
  );
}
