import { useEffect, useId, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';

interface AnswerInputProps {
  disabled: boolean;
  busy: boolean;
  /** Changing this clears the field (a new round). */
  resetKey: string | number;
  /** Changing this selects the text so the next guess replaces it. */
  rejectionKey?: string | null;
  onSubmit: (text: string) => void;
  onEdit?: () => void;
}

/**
 * A plain answer field. There is deliberately no suggestion list: players
 * have to know the card. Partial names and typos are resolved on submit.
 */
export function AnswerInput({ disabled, busy, resetKey, rejectionKey, onSubmit, onEdit }: AnswerInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    setValue('');
    const t = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(t);
  }, [resetKey]);

  useEffect(() => {
    if (!rejectionKey) return;
    const t = window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    }, 30);
    return () => window.clearTimeout(t);
  }, [rejectionKey]);

  const submit = () => {
    if (disabled || !value.trim()) return;
    onSubmit(value);
  };

  return (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor={id} className="sr-only">
        Card name
      </label>
      <div className="relative flex items-center gap-2 rounded-[3px] border border-gold/40 bg-[#0e1018]/90 p-1.5 pl-4 shadow-[inset_0_2px_10px_rgba(0,0,0,0.6),0_0_0_4px_rgba(11,13,19,0.6)] transition focus-within:border-gold-pale/80 focus-within:shadow-[inset_0_2px_10px_rgba(0,0,0,0.6),0_0_0_4px_rgba(11,13,19,0.6),0_0_28px_-6px_rgba(200,170,110,0.55)]">
        <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true" className="shrink-0 text-gold">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M12 4.5 L14.2 12 L12 19.5 L9.8 12 Z" fill="currentColor" opacity="0.85" />
          <circle cx="12" cy="12" r="1.6" fill="#0B0D13" />
        </svg>
        <input
          ref={inputRef}
          id={id}
          type="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="Type a card name"
          disabled={disabled}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            onEdit?.();
          }}
          className="min-w-0 flex-1 bg-transparent py-2.5 font-display text-lg text-parchment placeholder:font-flavor placeholder:text-lg placeholder:italic placeholder:text-ash/70 focus:outline-none disabled:opacity-60 sm:text-xl"
        />
        {busy && <LoaderCircle size={18} className="shrink-0 animate-spin text-gold" aria-label="Checking the card" />}
        <button type="submit" className="btn-gold shrink-0 !min-h-[2.6rem] !px-4 sm:!px-5" disabled={disabled || !value.trim()}>
          Lock in
        </button>
      </div>
      <p className="mt-2 text-xs text-ash">
        Partial names are finished as the most-played card that fits. Typos are corrected.
      </p>
    </form>
  );
}
