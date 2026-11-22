import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { GameMode } from './types/game';
import { useGame } from './hooks/useGame';
import { useProgress } from './hooks/useProgress';
import { activeStreak, getProgressStore, updateSettings } from './services/progressStore';
import { audioCues } from './services/audioCues';
import { utcDateKey } from './lib/dates';
import { ManaMotes } from './components/art/ManaMotes';
import { Header } from './components/Header';
import { FormatBanner } from './components/FormatBanner';
import { QuestionStage } from './components/QuestionStage';
import { RevealPanel } from './components/RevealPanel';
import { SummaryScreen } from './components/SummaryScreen';
import { HowToPlay } from './components/HowToPlay';
import { SiteFooter } from './components/SiteFooter';
import { toNumeral } from './components/GauntletTrack';

export default function App() {
  const progress = useProgress();
  const store = getProgressStore();
  const [mode, setMode] = useState<GameMode>('daily');
  const daily = useGame('daily');
  const practice = useGame('practice');
  const game = mode === 'daily' ? daily : practice;
  const [helpOpen, setHelpOpen] = useState(() => !progress.settings.seenIntro);
  const streak = activeStreak(progress, utcDateKey());

  useEffect(() => {
    audioCues.setMuted(progress.settings.muted);
  }, [progress.settings.muted]);

  const closeHelp = useCallback(() => {
    setHelpOpen(false);
    store.update((p) => (p.settings.seenIntro ? p : updateSettings(p, { seenIntro: true })));
  }, [store]);

  const toggleMute = () => {
    audioCues.prime();
    store.update((p) => updateSettings(p, { muted: !p.settings.muted }));
  };

  const roundLabel =
    mode === 'daily'
      ? `Round ${toNumeral(Math.min(game.roundIndex + 1, game.questions.length))} of ${toNumeral(game.questions.length)}`
      : `Practice round ${game.reveal ? game.roundIndex : game.roundIndex + 1}`;
  const revealRoundLabel =
    mode === 'daily'
      ? `Round ${toNumeral(game.roundIndex)} of ${toNumeral(game.questions.length)}`
      : `Practice round ${game.roundIndex}`;

  const stageKey = `${mode}-${game.view}-${game.view === 'question' ? game.roundIndex : ''}`;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden">
      <ManaMotes />
      <Header
        mode={mode}
        onModeChange={setMode}
        streak={streak}
        muted={progress.settings.muted}
        onToggleMute={toggleMute}
        onOpenHelp={() => setHelpOpen(true)}
      />

      <main className="relative z-20 mx-auto w-full max-w-6xl flex-1 px-4 pt-6 sm:px-6 sm:pt-8">
        <h1 className="sr-only">Magillion, the daily Magic: The Gathering obscurity trivia game</h1>
        <FormatBanner />

        <AnimatePresence mode="wait">
          <motion.div
            key={stageKey}
            className="mt-6 sm:mt-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.32, ease: 'easeOut' }}
          >
            {game.view === 'question' && game.currentQuestion && (
              <QuestionStage game={game} question={game.currentQuestion} roundLabel={roundLabel} />
            )}

            {game.view === 'reveal' && game.reveal && (
              <RevealPanel
                reveal={game.reveal}
                mode={mode}
                roundLabel={revealRoundLabel}
                isLastRound={mode === 'daily' && game.roundIndex >= game.questions.length}
                onNext={game.advance}
                onEndRun={mode === 'practice' ? game.endPracticeRun : undefined}
              />
            )}

            {game.view === 'summary' && (
              <SummaryScreen
                mode={mode}
                dateKey={game.dateKey}
                puzzleNumber={game.puzzleNumber}
                answers={game.answers}
                progress={progress}
                streak={streak}
                newDayAvailable={game.newDayAvailable}
                onStartNewDay={game.startNewDay}
                onPractice={() => setMode('practice')}
                onRestartPractice={practice.restartPractice}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <SiteFooter />
      <HowToPlay open={helpOpen} onClose={closeHelp} />
    </div>
  );
}
