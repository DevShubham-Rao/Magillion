import { useEffect, useState } from 'react';
import { SkipForward } from 'lucide-react';
import type { GameController } from '../hooks/useGame';
import type { QuestionDefinition } from '../types/mtg';
import { ROUND_SECONDS } from '../data/gameRules';
import { GauntletTrack } from './GauntletTrack';
import { QuestionTablet } from './QuestionTablet';
import { AnswerInput } from './AnswerInput';
import { RejectionBanner } from './RejectionBanner';
import { AttemptPips, RoundTimer } from './RoundTimer';
import { PlaneswalkLanding } from './PlaneswalkLanding';

interface QuestionStageProps {
  game: GameController;
  question: QuestionDefinition;
  roundLabel: string;
}

function Progress({ game, roundLabel }: { game: GameController; roundLabel: string }) {
  return (
    <div className="mb-5 mt-3 flex flex-col items-center gap-2">
      <GauntletTrack total={game.questions.length} answers={game.answers} current={game.roundIndex} />
      <p className="text-sm text-ash">{roundLabel}</p>
    </div>
  );
}

/** The question phase: clock, progress, prompt, answer field and feedback. */
export function QuestionStage({ game, question, roundLabel }: QuestionStageProps) {
  const [confirmPass, setConfirmPass] = useState(false);

  useEffect(() => {
    if (!confirmPass) return;
    const id = window.setTimeout(() => setConfirmPass(false), 3500);
    return () => window.clearTimeout(id);
  }, [confirmPass]);

  if (game.view === 'ready') return <PlaneswalkLanding game={game} />;

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
      <RoundTimer msRemaining={game.msRemaining} totalMs={ROUND_SECONDS * 1000} running={!game.busy} spinning={game.busy} />
      <Progress game={game} roundLabel={roundLabel} />

      <QuestionTablet question={question} />

      <div className="relative z-20 mt-6">
        <AnswerInput
          disabled={game.busy}
          busy={game.busy}
          resetKey={`${game.dateKey}-${game.roundIndex}-${question.id}`}
          rejectionKey={game.rejection ? `${game.rejection.title}-${game.rejection.cardName ?? ''}-${game.rejection.attemptsLeft}` : null}
          onSubmit={(text) => void game.submitAnswer(text)}
          onEdit={() => game.rejection && game.dismissRejection()}
        />
      </div>

      <div className="mt-4">
        <RejectionBanner rejection={game.rejection} onDismiss={game.dismissRejection} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <AttemptPips left={game.attemptsLeft} />
          <p className="text-sm text-ash">
            Planeswalk total{' '}
            <span className="tabular ml-1 font-display text-lg font-semibold text-gold-pale">
              {game.totalScore.toLocaleString('en-US')}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-ghost" onClick={onPass} disabled={game.busy} aria-live="polite">
            <SkipForward size={15} aria-hidden="true" />
            {confirmPass ? 'Pass for 0 points?' : 'Pass round'}
          </button>
        </div>
      </div>
    </div>
  );
}
