import { useEffect, useState } from 'react';
import { SkipForward } from 'lucide-react';
import type { GameController } from '../hooks/useGame';
import type { QuestionDefinition } from '../types/mtg';
import { MAX_ATTEMPTS, MAX_SPEED_BONUS, ROUND_SECONDS } from '../data/gameRules';
import { GauntletTrack, PracticeTrack, toNumeral } from './GauntletTrack';
import { QuestionTablet } from './QuestionTablet';
import { AnswerInput } from './AnswerInput';
import { RejectionBanner } from './RejectionBanner';
import { AttemptPips, RoundTimer } from './RoundTimer';
import { FiligreeDivider, FiligreeFrame } from './art/Filigree';

interface QuestionStageProps {
  game: GameController;
  question: QuestionDefinition;
  roundLabel: string;
}

function Progress({ game, roundLabel }: { game: GameController; roundLabel: string }) {
  return (
    <div className="mb-5 mt-3 flex flex-col items-center gap-2">
      {game.mode === 'daily' ? (
        <GauntletTrack total={game.questions.length} answers={game.answers} current={game.roundIndex} />
      ) : (
        <PracticeTrack answers={game.answers} />
      )}
      <p className="text-sm text-ash">{roundLabel}</p>
    </div>
  );
}

/** Before the clock starts the prompt stays sealed, so there's no free thinking time. */
function ReadyGate({ game, roundLabel }: { game: GameController; roundLabel: string }) {
  const label = game.mode === 'daily' ? `Start round ${toNumeral(game.roundIndex + 1)}` : 'Start practice';
  return (
    <div className="mx-auto w-full max-w-3xl">
      <RoundTimer msRemaining={ROUND_SECONDS * 1000} totalMs={ROUND_SECONDS * 1000} running={false} spinning={false} />
      <Progress game={game} roundLabel={roundLabel} />
      <section className="engraved-panel relative px-6 pb-9 pt-10 text-center sm:px-14">
        <FiligreeFrame size={58} inset={4} />
        <h2 className="font-display text-2xl font-semibold text-parchment sm:text-3xl">The prompt is sealed</h2>
        <FiligreeDivider className="mx-auto my-5 max-w-full" />
        <p className="mx-auto max-w-[46ch] font-flavor text-lg italic leading-snug text-parchment/75 sm:text-xl">
          You get {ROUND_SECONDS} seconds and {MAX_ATTEMPTS} attempts per round. Answer fast for up to {MAX_SPEED_BONUS} bonus
          points. The clock starts when you break the seal.
        </p>
        <button type="button" className="btn-gold mt-7" onClick={game.beginRound} autoFocus>
          {label}
        </button>
      </section>
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

  if (game.view === 'ready') return <ReadyGate game={game} roundLabel={roundLabel} />;

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
          resetKey={`${game.mode}-${game.roundIndex}-${question.id}`}
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
            {game.mode === 'daily' ? 'Gauntlet total' : 'Run total'}{' '}
            <span className="tabular ml-1 font-display text-lg font-semibold text-gold-pale">
              {game.totalScore.toLocaleString('en-US')}
            </span>
          </p>
        </div>
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
