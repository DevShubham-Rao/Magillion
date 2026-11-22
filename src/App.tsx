import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from './hooks/useGame';
import { useProgress } from './hooks/useProgress';
import { activeStreak, getProgressStore, updateSettings } from './services/progressStore';
import { audioCues } from './services/audioCues';
import { utcDateKey } from './lib/dates';
import { planarPosition } from './data/planes';
import { ManaMotes } from './components/art/ManaMotes';
import { Header } from './components/Header';
import { FormatBanner } from './components/FormatBanner';
import { QuestionStage } from './components/QuestionStage';
import { RevealPanel } from './components/RevealPanel';
import { SummaryScreen } from './components/SummaryScreen';
import { HowToPlay } from './components/HowToPlay';
import { SiteFooter } from './components/SiteFooter';
import { RoundLostPanel } from './components/RoundLostPanel';
import { PlanarBar, PlanarRail, PlanarSky } from './components/Planeswalk';
import { TestTools, testToolsEnabled } from './components/TestTools';
import { toNumeral } from './components/GauntletTrack';
import { scryfall } from './services/scryfallService';
import { loadMetagame } from './services/metagame';

export default function App() {
  const progress = useProgress();
  const store = getProgressStore();
  const game = useGame();
  const [helpOpen, setHelpOpen] = useState(() => !progress.settings.seenIntro);
  const streak = activeStreak(progress, utcDateKey());
  const showTestTools = useMemo(testToolsEnabled, []);

  useEffect(() => {
    audioCues.setMuted(progress.settings.muted);
  }, [progress.settings.muted]);

  // Warm the typo-correction name index and the 60-card play snapshot before the first answer.
  useEffect(() => {
    void scryfall.getNameIndex();
    void loadMetagame();
  }, []);

  const closeHelp = useCallback(() => {
    setHelpOpen(false);
    store.update((p) => (p.settings.seenIntro ? p : updateSettings(p, { seenIntro: true })));
  }, [store]);

  const toggleMute = () => {
    audioCues.prime();
    store.update((p) => updateSettings(p, { muted: !p.settings.muted }));
  };

  const total = game.totalScore;
  const position = planarPosition(total);

  // Did the answer on screen carry the spark onto a new plane?
  const arrival = useMemo(() => {
    if (!game.reveal) return null;
    const before = planarPosition(total - game.reveal.answer.points);
    return position.index > before.index ? { plane: position.plane, skipped: position.index - before.index - 1 } : null;
  }, [game.reveal, total, position]);

  const roundLabel = `Round ${toNumeral(Math.min(game.roundIndex + 1, game.questions.length))} of ${toNumeral(game.questions.length)}`;
  const revealRoundLabel = `Round ${toNumeral(game.roundIndex)} of ${toNumeral(game.questions.length)}`;
  const isLastRound = game.roundIndex >= game.questions.length;
  const onLanding = game.view === 'ready';

  const stageKey = `${game.dateKey}-${game.view === 'ready' ? 'question' : game.view}-${
    game.view === 'question' || game.view === 'ready' ? game.roundIndex : ''
  }`;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden">
      <PlanarSky plane={position.plane} />
      <ManaMotes />
      <Header
        streak={streak}
        muted={progress.settings.muted}
        onToggleMute={toggleMute}
        onOpenHelp={() => setHelpOpen(true)}
        extra={showTestTools ? <TestTools /> : null}
      />

      <main className="relative z-20 mx-auto w-full max-w-6xl flex-1 px-4 pt-6 sm:px-6 sm:pt-8">
        <h1 className="sr-only">Magillion: The Daily Planeswalk, a Magic: The Gathering obscurity trivia game</h1>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_11rem] lg:gap-10 xl:gap-14">
          <div className="min-w-0">
            {!onLanding && (
              <>
                <FormatBanner />
                <PlanarBar total={total} className="mt-5 lg:hidden" />
              </>
            )}

            <AnimatePresence mode="wait">
              <motion.div
                key={stageKey}
                className={onLanding ? '' : 'mt-6 sm:mt-8'}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.32, ease: 'easeOut' }}
              >
                {(game.view === 'question' || game.view === 'ready') && game.currentQuestion && (
                  <QuestionStage game={game} question={game.currentQuestion} roundLabel={roundLabel} />
                )}

                {game.view === 'reveal' && game.reveal && (
                  <RevealPanel
                    reveal={game.reveal}
                    roundLabel={revealRoundLabel}
                    isLastRound={isLastRound}
                    arrival={arrival}
                    onNext={game.advance}
                  />
                )}

                {game.view === 'lost' && game.loss && (
                  <RoundLostPanel loss={game.loss} roundLabel={revealRoundLabel} isLastRound={isLastRound} onNext={game.advance} />
                )}

                {game.view === 'summary' && (
                  <SummaryScreen
                    dateKey={game.dateKey}
                    puzzleNumber={game.puzzleNumber}
                    answers={game.answers}
                    progress={progress}
                    streak={streak}
                    newDayAvailable={game.newDayAvailable}
                    onStartNewDay={game.startNewDay}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <aside className="hidden lg:block" aria-label="Planeswalk map">
            <div className="sticky top-8 h-[min(38rem,calc(100dvh-6rem))]">
              <PlanarRail total={total} />
            </div>
          </aside>
        </div>
      </main>

      <SiteFooter />
      <HowToPlay open={helpOpen} onClose={closeHelp} />
    </div>
  );
}
