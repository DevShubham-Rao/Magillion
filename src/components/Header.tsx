import type { ReactNode } from 'react';
import { BookOpen, Flame, Volume2, VolumeX } from 'lucide-react';
import { Astrolabe } from './art/Astrolabe';

interface HeaderProps {
  streak: number;
  muted: boolean;
  onToggleMute: () => void;
  onOpenHelp: () => void;
  /** Extra controls before the sound toggle (the test tools, when enabled). */
  extra?: ReactNode;
}

export function Header({ streak, muted, onToggleMute, onOpenHelp, extra }: HeaderProps) {
  return (
    <header className="relative z-30 mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6 sm:pt-6">
      <div className="flex items-center justify-between gap-2">
        <a href="/" className="flex min-w-0 items-center gap-1.5 rounded-sm sm:gap-2.5" aria-label="Magillion home">
          <Astrolabe size={42} simple className="h-8 w-8 shrink-0 sm:h-[42px] sm:w-[42px]" />
          <span className="gold-text font-display text-base font-bold tracking-[0.06em] min-[400px]:text-lg sm:text-2xl sm:tracking-[0.12em]">
            Magillion
          </span>
        </a>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <div
            className="flex h-9 items-center gap-1 rounded-full border border-gold/25 bg-obsidian/60 px-2 text-sm font-semibold text-gold-pale sm:h-10 sm:gap-1.5 sm:px-3"
            title="Daily streak"
          >
            <Flame size={16} className={streak > 0 ? 'text-ember' : 'text-ash'} aria-hidden="true" />
            <span className="tabular">{streak}</span>
            <span className="sr-only">day streak</span>
          </div>
          {extra}
          <button type="button" className="icon-btn" onClick={onToggleMute} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} aria-pressed={!muted}>
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <button type="button" className="icon-btn" onClick={onOpenHelp} aria-label="How to play">
            <BookOpen size={17} />
          </button>
        </div>
      </div>
    </header>
  );
}
