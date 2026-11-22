import { useId } from 'react';

/** Engraved corner ornament, drawn for the top-left and mirrored elsewhere. */
export function FiligreeCorner({ className, size = 56 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true" fill="none">
      <g stroke="#C8AA6E" strokeLinecap="round">
        <path d="M3 61 V22 C3 11.5 11.5 3 22 3 H61" strokeWidth={1.2} />
        <path d="M9 61 V27 C9 17 17 9 27 9 H61" strokeWidth={0.5} opacity={0.65} />
        <path d="M22 3 C22 13.5 13.5 22 3 22" strokeWidth={0.7} opacity={0.8} />
        {/* scrolls along the top edge */}
        <path d="M27 9 C31 4.5 37 4.2 41 7.6 C43.4 9.6 46.6 9.4 48.4 7.2" strokeWidth={0.75} />
        <path d="M48.4 7.2 C50.6 4.8 54 5 55.6 7 C53.8 8.6 51 9 48.4 7.2 Z" fill="#C8AA6E" stroke="none" opacity={0.85} />
        <path d="M34 9 C34 12.4 36.6 14.4 39.4 13.6" strokeWidth={0.55} opacity={0.75} />
        {/* scrolls along the left edge */}
        <path d="M9 27 C4.5 31 4.2 37 7.6 41 C9.6 43.4 9.4 46.6 7.2 48.4" strokeWidth={0.75} />
        <path d="M7.2 48.4 C4.8 50.6 5 54 7 55.6 C8.6 53.8 9 51 7.2 48.4 Z" fill="#C8AA6E" stroke="none" opacity={0.85} />
        <path d="M9 34 C12.4 34 14.4 36.6 13.6 39.4" strokeWidth={0.55} opacity={0.75} />
        {/* inner curl */}
        <path d="M27 9 C20 12 15 17 13 23 C12 26.4 14.6 28.6 17.4 27.2 C19.6 26 19.4 23 17.2 22.6" strokeWidth={0.65} />
      </g>
      <path d="M13.5 8.5 L18.5 13.5 L13.5 18.5 L8.5 13.5 Z" fill="#C8AA6E" />
      <path d="M13.5 11 L16 13.5 L13.5 16 L11 13.5 Z" fill="#0B0D13" />
    </svg>
  );
}

/** Four corners positioned over a relatively positioned parent. */
export function FiligreeFrame({ size = 56, inset = -1, opacity = 0.9 }: { size?: number; inset?: number; opacity?: number }) {
  const pos = { position: 'absolute' as const, opacity };
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <span style={{ ...pos, top: inset, left: inset }}>
        <FiligreeCorner size={size} />
      </span>
      <span style={{ ...pos, top: inset, right: inset, transform: 'scaleX(-1)' }}>
        <FiligreeCorner size={size} />
      </span>
      <span style={{ ...pos, bottom: inset, left: inset, transform: 'scaleY(-1)' }}>
        <FiligreeCorner size={size} />
      </span>
      <span style={{ ...pos, bottom: inset, right: inset, transform: 'scale(-1, -1)' }}>
        <FiligreeCorner size={size} />
      </span>
    </div>
  );
}

/** Horizontal rule with a lens-and-diamond centrepiece. */
export function FiligreeDivider({ className, width = 260 }: { className?: string; width?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const fadeL = `fade-l-${uid}`;
  const fadeR = `fade-r-${uid}`;
  return (
    <svg
      viewBox="0 0 260 18"
      width={width}
      height={(width / 260) * 18}
      className={className}
      aria-hidden="true"
      fill="none"
    >
      <defs>
        <linearGradient id={fadeL} x1="0" x2="1">
          <stop offset="0" stopColor="#C8AA6E" stopOpacity="0" />
          <stop offset="1" stopColor="#C8AA6E" />
        </linearGradient>
        <linearGradient id={fadeR} x1="1" x2="0">
          <stop offset="0" stopColor="#C8AA6E" stopOpacity="0" />
          <stop offset="1" stopColor="#C8AA6E" />
        </linearGradient>
      </defs>
      <line x1="0" y1="9" x2="104" y2="9" stroke={`url(#${fadeL})`} strokeWidth="0.8" />
      <line x1="156" y1="9" x2="260" y2="9" stroke={`url(#${fadeR})`} strokeWidth="0.8" />
      <g stroke="#C8AA6E" strokeWidth="0.8">
        <path d="M119 9 C114 3.6 108 3.6 104 9 C108 14.4 114 14.4 119 9" />
        <path d="M141 9 C146 3.6 152 3.6 156 9 C152 14.4 146 14.4 141 9" />
        <path d="M104 9 C100 6.4 97 6.6 95 9 C97 11.4 100 11.6 104 9" opacity="0.7" />
        <path d="M156 9 C160 6.4 163 6.6 165 9 C163 11.4 160 11.6 156 9" opacity="0.7" />
      </g>
      <path d="M130 1.5 L137.5 9 L130 16.5 L122.5 9 Z" fill="#C8AA6E" />
      <path d="M130 5 L134 9 L130 13 L126 9 Z" fill="#0B0D13" />
      <circle cx="130" cy="9" r="1.4" fill="#E8D9AE" />
    </svg>
  );
}
