import { useEffect, useState } from 'react';
import { SkipForward } from 'lucide-react';
import type { GameController } from '../hooks/useGame';
import type { QuestionDefinition } from '../types/mtg';
import { Astrolabe } from './art/Astrolabe';
import { GauntletTrack, PracticeTrack } from './GauntletTrack';
import { QuestionTablet } from './QuestionTablet';
import { CardSearch } from './CardSearch';
import { RejectionBanner } from './RejectionBanner';

interface QuestionStageProps {
  game: GameController;
  question: QuestionDefinition;
  roundLabel: string;
}

/** The question phase: astrolabe, progress, prompt, search and feedback. */
export function QuestionStage({ game, question, roundLabel }: QuestionStageProps) {
  const [searching, setSearching] = useState(false);
  const [confirmPass, setConfirmPass] = useState(false);

  useEffect(() => {
    if (!confirmPass) return;
    const id = window.setTimeout(() => setConfirmPass(false), 3500);
    return () => window.clearTimeout(id);
  }, [confirmPass]);

  const onPass = () => {
    if (!confirmPass) {
      setConfirmPass(true);
      return;
    }
    setConfirmPass(false);
    game.pass();
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex justify-center">
        <Astrolabe size={176} active={searching || game.busy} className="h-32 w-32 sm:h-44 sm:w-44" />
      </div>

      <div className="mb-5 mt-2 flex flex-col items-center gap-2">
        {game.mode === 'daily' ? (
          <GauntletTrack total={game.questions.length} answers={game.answers} current={game.roundIndex} />
        ) : (
          <PracticeTrack answers={game.answers} />
        )}
        <p className="text-sm text-ash">{roundLabel}</p>
      </div>

      <QuestionTablet question={question} />

      <div className="relative z-20 mt-6">
        <CardSearch
          disabled={game.busy}
          busy={game.busy}
          resetKey={`${game.mode}-${game.roundIndex}-${question.id}`}
          onPick={(card) => void game.submitCard(card)}
          onSubmitText={(text) => void game.submitName(text)}
          onEdit={() => game.rejection && game.dismissRejection()}
          onLoadingChange={setSearching}
          rejectionKey={game.rejection ? `${game.rejection.title}-${game.rejection.cardName ?? ''}` : null}
        />
      </div>

      <div className="mt-4">
        <RejectionBanner rejection={game.rejection} onDismiss={game.dismissRejection} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ash">
          {game.mode === 'daily' ? 'Gauntlet total' : 'Run total'}{' '}
          <span className="tabular ml-1 font-display text-lg font-semibold text-gold-pale">
            {game.totalScore.toLocaleString('en-US')}
          </span>
        </p>
        <div className="flex items-center gap-2">
          {game.mode === 'practice' && game.answers.length > 0 && (
            <button type="button" className="btn-ghost" onClick={game.endPracticeRun} disabled={game.busy}>
              End run
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onPass} disabled={game.busy} aria-live="polite">
            <SkipForward size={15} aria-hidden="true" />
            {confirmPass ? 'Pass for 0 points?' : 'Pass round'}
          </button>
        </div>
      </div>
    </div>
  );
}
