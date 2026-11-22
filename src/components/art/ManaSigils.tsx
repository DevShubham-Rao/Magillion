/**
 * Original sigils for the five colors, drawn on a 16-unit box centred on
 * the origin so they can be dropped into any SVG at any position.
 */

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G';

export const MANA_ORDER: readonly ManaColor[] = ['W', 'U', 'B', 'R', 'G'];

export const MANA_COLORS: Record<ManaColor, string> = {
  W: '#F3E6C0',
  U: '#4A95D8',
  B: '#A48FB5',
  R: '#E0603F',
  G: '#4BA36B',
};

export const MANA_NAMES: Record<ManaColor, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

const RAYS = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);

export function ManaSigil({ color, scale = 1, fill }: { color: ManaColor; scale?: number; fill?: string }) {
  const c = fill ?? MANA_COLORS[color];
  return (
    <g transform={`scale(${scale})`} fill={c} stroke={c}>
      {color === 'W' && (
        <>
          <circle r={3.1} stroke="none" />
          {RAYS.map((a) => (
            <line
              key={a}
              x1={Math.cos(a) * 4.6}
              y1={Math.sin(a) * 4.6}
              x2={Math.cos(a) * 6.8}
              y2={Math.sin(a) * 6.8}
              strokeWidth={1.1}
              strokeLinecap="round"
            />
          ))}
        </>
      )}
      {color === 'U' && (
        <path
          stroke="none"
          d="M0 -6.8 C3.4 -2.6 5 0.2 5 2.6 A5 5 0 0 1 -5 2.6 C-5 0.2 -3.4 -2.6 0 -6.8 Z M-2.4 2.2 A2.6 2.6 0 0 0 0.4 5 A3.4 3.4 0 0 1 -2.4 2.2 Z"
          fillRule="evenodd"
        />
      )}
      {color === 'B' && (
        <>
          <path stroke="none" d="M-5.2 -0.6 A5.2 5.2 0 1 1 5.2 -0.6 L5.2 2 L3.1 2.6 L3.1 5.6 L-3.1 5.6 L-3.1 2.6 L-5.2 2 Z" />
          <circle cx={-2.1} cy={-0.5} r={1.35} fill="#0B0D13" stroke="none" />
          <circle cx={2.1} cy={-0.5} r={1.35} fill="#0B0D13" stroke="none" />
          <path d="M-1 3.4 V5.6 M1 3.4 V5.6" stroke="#0B0D13" strokeWidth={0.7} />
        </>
      )}
      {color === 'R' && (
        <path
          stroke="none"
          d="M0.2 -7 C2.4 -3.6 5.2 -2 4.7 2 C4.4 5 2.2 7 0 7 C-2.6 7 -4.9 5 -4.7 2 C-4.5 -0.6 -2.6 -1.6 -2.1 -4.1 C-1.1 -2.6 -0.6 -1.6 0.5 -1.1 C0.9 -3.1 0.7 -5 0.2 -7 Z"
        />
      )}
      {color === 'G' && (
        <>
          <circle cx={0} cy={-2.8} r={3.4} stroke="none" />
          <circle cx={-3.1} cy={0.2} r={2.9} stroke="none" />
          <circle cx={3.1} cy={0.2} r={2.9} stroke="none" />
          <rect x={-1} y={1.6} width={2} height={5.2} rx={0.6} stroke="none" />
        </>
      )}
    </g>
  );
}
