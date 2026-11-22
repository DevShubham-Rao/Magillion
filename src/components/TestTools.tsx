import { useState } from 'react';
import { FlaskConical, X } from 'lucide-react';
import { formatDateKey, setTestDayOffset, testDayOffset, utcDateKey } from '../lib/dates';
import { TEST_STORAGE_KEY } from '../services/progressStore';
import { selectDailyQuestions, ACTIVE_QUESTIONS } from '../data/questionPool';

/**
 * Temporary testing aid. Shown in dev builds, on any URL with `?test`, and
 * whenever a test day is active. Skipping ahead saves progress under a
 * separate key, so real results and streaks stay as they were.
 */
export function testToolsEnabled(): boolean {
  if (import.meta.env.DEV || testDayOffset() !== 0) return true;
  try {
    return new URLSearchParams(window.location.search).has('test');
  } catch {
    return false;
  }
}

function reloadWith(offset: number, wipe = false) {
  setTestDayOffset(offset);
  try {
    if (wipe) globalThis.localStorage?.removeItem(TEST_STORAGE_KEY);
  } catch {
    // Storage blocked; nothing to wipe.
  }
  window.location.reload();
}

export function TestTools() {
  const [open, setOpen] = useState(false);
  const offset = testDayOffset();
  const today = utcDateKey();

  const trigger = (
    <button
      type="button"
      className="icon-btn relative"
      onClick={() => setOpen((v) => !v)}
      aria-label="Test tools"
      aria-expanded={open}
      title="Test tools"
    >
      <FlaskConical size={17} />
      {offset > 0 && (
        <span className="absolute -right-1 -top-1 rounded-full bg-ember px-1 text-[10px] font-bold leading-4 text-obsidian">
          +{offset}
        </span>
      )}
    </button>
  );

  if (!open) return trigger;

  return (
    <>
    {trigger}
    <aside
      aria-label="Test tools"
      className="engraved-panel fixed right-4 top-16 z-50 max-h-[calc(100dvh-5rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto p-5 text-left text-sm sm:top-20"
    >
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Close test tools"
        className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-ash hover:bg-white/5 hover:text-parchment"
      >
        <X size={16} />
      </button>
      <h2 className="font-display text-base font-bold text-parchment">Test tools</h2>
      <p className="mt-1 text-parchment/80">
        Playing {formatDateKey(today)}
        {offset > 0 ? `, ${offset} day${offset === 1 ? '' : 's'} ahead of the real date.` : ', the real date.'}
      </p>
      <p className="mt-1 text-xs text-ash">
        Test days save separately, so your real results and streak aren’t touched. {ACTIVE_QUESTIONS.length} prompts in the pool.
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <button type="button" className="btn-gold" onClick={() => reloadWith(offset + 1)}>
          Skip to the next day
        </button>
        {offset > 0 && (
          <>
            <button type="button" className="btn-ghost" onClick={() => reloadWith(offset, true)}>
              Wipe test results and replay
            </button>
            <button type="button" className="btn-ghost" onClick={() => reloadWith(0)}>
              Back to the real date
            </button>
          </>
        )}
      </div>

      <h3 className="mt-5 font-display text-sm font-semibold text-gold-pale">Today’s prompts</h3>
      <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-xs text-parchment/75">
        {selectDailyQuestions(today).map((q) => (
          <li key={q.id}>
            {q.prompt} <span className="text-ash">({q.category})</span>
          </li>
        ))}
      </ol>
    </aside>
    </>
  );
}
