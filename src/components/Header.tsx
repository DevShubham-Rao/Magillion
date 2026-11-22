import { motion } from 'framer-motion';
import { BookOpen, CalendarDays, Flame, Infinity as InfinityIcon, Volume2, VolumeX } from 'lucide-react';
import type { GameMode } from '../types/game';
import { Astrolabe } from './art/Astrolabe';

interface HeaderProps {
  mode: GameMode;
  onModeChange: (mode: GameMode) => void;
  streak: number;
  muted: boolean;
  onToggleMute: () => void;
  onOpenHelp: () => void;
}

const MODES: Array<{ id: GameMode; label: string; Icon: typeof CalendarDays }> = [
  { id: 'daily', label: 'Daily gauntlet', Icon: CalendarDays },
  { id: 'practice', label: 'Practice', Icon: InfinityIcon },
];

export function ModeSwitch({ mode, onChange }: { mode: GameMode; onChange: (mode: GameMode) => void }) {
  return (
    <div role="tablist" aria-label="Game mode" className="relative flex rounded-full border border-gold/30 bg-obsidian/70 p-1">
      {MODES.map(({ id, label, Icon }) => {
        const selected = mode === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(id)}
            className={`relative z-10 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors sm:px-4 ${
              selected ? 'text-[#17130b]' : 'text-gold-pale/80 hover:text-gold-pale'
            }`}
          >
            {selected && (
              <motion.span
                layoutId="mode-pill"
                className="absolute inset-0 -z-10 rounded-full"
                style={{
                  background: 'linear-gradient(180deg, #ead39a, #c8aa6e 55%, #a68748)',
                  boxShadow: 'inset 0 1px 0 rgba(255,250,230,.7)',
                }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <Icon size={15} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Header({ mode, onModeChange, streak, muted, onToggleMute, onOpenHelp }: HeaderProps) {
  return (
    <header className="relative z-30 mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6 sm:pt-6">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-4">
        <a href="/" className="order-1 flex items-center gap-2 rounded-sm sm:gap-2.5" aria-label="Magillion home">
          <Astrolabe size={42} simple className="h-9 w-9 sm:h-[42px] sm:w-[42px]" />
          <span className="gold-text font-display text-lg font-bold tracking-[0.08em] sm:text-2xl sm:tracking-[0.12em]">
            Magillion
          </span>
        </a>

        <div className="order-3 flex w-full justify-center md:order-2 md:w-auto">
          <ModeSwitch mode={mode} onChange={onModeChange} />
        </div>

        <div className="order-2 flex items-center gap-1.5 sm:gap-2 md:order-3">
          <div
            className="flex h-9 items-center gap-1.5 rounded-full border border-gold/25 bg-obsidian/60 px-2.5 text-sm font-semibold text-gold-pale sm:h-10 sm:px-3"
            title="Daily streak"
          >
            <Flame size={16} className={streak > 0 ? 'text-ember' : 'text-ash'} aria-hidden="true" />
            <span className="tabular">{streak}</span>
            <span className="sr-only">day streak</span>
          </div>
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
