import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LoaderCircle } from 'lucide-react';
import type { ScryfallCard } from '../types/mtg';
import { useCardSearch } from '../hooks/useCardSearch';
import { displayManaCost, displayTypeLine, normalizeName } from '../lib/cardFaces';
import { ManaCost } from './ManaCost';
import { audioCues } from '../services/audioCues';

interface CardSearchProps {
  disabled: boolean;
  busy: boolean;
  /** Changing this clears the field (a new round). */
  resetKey: string | number;
  onPick: (card: ScryfallCard) => void;
  onSubmitText: (text: string) => void;
  onEdit?: () => void;
  /** Reports whether suggestions are being fetched (drives the astrolabe). */
  onLoadingChange?: (loading: boolean) => void;
  /** Changes when an answer is turned away, so the field is ready for a retry. */
  rejectionKey?: string | null;
}

/** Brings the field into the upper part of the viewport so suggestions have room. */
function revealField(el: HTMLElement | null) {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const target = window.innerHeight * 0.28;
  if (rect.top > window.innerHeight * 0.5) {
    window.scrollBy({ top: rect.top - target, behavior: 'smooth' });
  }
}

/**
 * Accessible combobox over live Scryfall suggestions. Clicking a suggestion
 * or pressing Enter on a highlighted one locks it in; Enter on free text
 * runs a fuzzy lookup.
 */
export function CardSearch({
  disabled,
  busy,
  resetKey,
  onPick,
  onSubmitText,
  onEdit,
  onLoadingChange,
  rejectionKey,
}: CardSearchProps) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suppressOpen = useRef(false);
  const listId = useId();
  const search = useCardSearch(value, !disabled);
  const suggestions = search.suggestions;

  useEffect(() => {
    onLoadingChange?.(search.status === 'loading');
  }, [search.status, onLoadingChange]);

  useEffect(() => {
    setValue('');
    setActive(-1);
    setOpen(false);
    const id = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(id);
  }, [resetKey]);

  useEffect(() => {
    setActive(-1);
  }, [search.query]);

  // After a rejection, select the text so typing replaces it.
  useEffect(() => {
    if (!rejectionKey) return;
    setOpen(false);
    const id = window.setTimeout(() => {
      suppressOpen.current = true;
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    }, 30);
    return () => window.clearTimeout(id);
  }, [rejectionKey]);

  const pick = (card: ScryfallCard) => {
    audioCues.prime();
    audioCues.select();
    setOpen(false);
    setValue(card.name);
    onPick(card);
  };

  const submit = () => {
    if (!value.trim() || disabled) return;
    const highlighted = active >= 0 ? suggestions[active] : undefined;
    if (highlighted && open) return pick(highlighted.card);
    const needle = normalizeName(value);
    const exact = suggestions.find((s) => s.matchRank === 0 && normalizeName(s.matchedName) === needle);
    if (exact && search.query.trim() === value.trim()) return pick(exact.card);
    setOpen(false);
    onSubmitText(value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (suggestions.length ? (i + 1) % suggestions.length : -1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (suggestions.length ? (i <= 0 ? suggestions.length - 1 : i - 1) : -1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  const showList = open && value.trim().length >= 2 && !disabled;
  const activeId = active >= 0 ? `${listId}-opt-${active}` : undefined;

  return (
    <div className="relative w-full">
      <label htmlFor={`${listId}-input`} className="sr-only">
        Card name
      </label>
      <div
        className="group relative flex items-center gap-2 rounded-[3px] border border-gold/40 bg-[#0e1018]/90 p-1.5 pl-4 shadow-[inset_0_2px_10px_rgba(0,0,0,0.6),0_0_0_4px_rgba(11,13,19,0.6)] transition focus-within:border-gold-pale/80 focus-within:shadow-[inset_0_2px_10px_rgba(0,0,0,0.6),0_0_0_4px_rgba(11,13,19,0.6),0_0_28px_-6px_rgba(200,170,110,0.55)]"
      >
        <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true" className="shrink-0 text-gold">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M12 4.5 L14.2 12 L12 19.5 L9.8 12 Z" fill="currentColor" opacity="0.85" />
          <circle cx="12" cy="12" r="1.6" fill="#0B0D13" />
        </svg>
        <input
          ref={inputRef}
          id={`${listId}-input`}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${listId}-list`}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
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
            setOpen(true);
            onEdit?.();
          }}
          onFocus={(e) => {
            if (suppressOpen.current) {
              suppressOpen.current = false;
              return;
            }
            setOpen(true);
            revealField(e.currentTarget.parentElement);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent py-2.5 font-display text-lg text-parchment placeholder:font-flavor placeholder:text-lg placeholder:italic placeholder:text-ash/70 focus:outline-none disabled:opacity-60 sm:text-xl"
        />
        {(search.status === 'loading' || busy) && (
          <LoaderCircle size={18} className="shrink-0 animate-spin text-gold" aria-label="Searching Scryfall" />
        )}
        <button
          type="button"
          className="btn-gold shrink-0 !min-h-[2.6rem] !px-4 sm:!px-5"
          disabled={disabled || !value.trim()}
          onClick={submit}
        >
          Lock in
        </button>
      </div>

      <AnimatePresence>
        {showList && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-[3px] border border-gold/35 bg-[#10131c]/98 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.95)] backdrop-blur"
          >
            <ul id={`${listId}-list`} role="listbox" aria-label="Matching cards" className="max-h-[min(60vh,420px)] overflow-y-auto py-1">
              {suggestions.map((s, i) => {
                const selected = i === active;
                return (
                  <li
                    key={s.card.id}
                    id={`${listId}-opt-${i}`}
                    role="option"
                    aria-selected={selected}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(s.card)}
                    className={`flex cursor-pointer items-center gap-3 border-l-2 px-4 py-2.5 ${
                      selected ? 'border-gold bg-gold/10' : 'border-transparent'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-[15px] font-semibold text-parchment">{s.card.name}</p>
                      <p className="truncate text-xs text-ash">{displayTypeLine(s.card)}</p>
                    </div>
                    <ManaCost cost={displayManaCost(s.card)} size={15} className="shrink-0" />
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-gold/15 px-4 py-2 text-xs text-ash">
              {search.status === 'error'
                ? "Scryfall isn't responding. Press Enter to try the name directly."
                : search.status === 'loading' && suggestions.length === 0
                  ? 'Searching Scryfall…'
                  : search.status === 'ready' && suggestions.length === 0
                    ? 'No cards match yet. Keep typing, or press Enter to look the name up.'
                    : 'Arrow keys to browse, Enter to lock in. Card data from Scryfall.'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
