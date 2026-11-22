import { Fragment, type ReactNode } from 'react';
import { useManaSymbols } from '../hooks/useManaSymbols';

const SYMBOL_RE = /(\{[^}]+\})/g;

const FALLBACK_COLORS: Record<string, string> = {
  W: '#F3E6C0',
  U: '#9CC9EE',
  B: '#B9AAB8',
  R: '#EFA287',
  G: '#94CFA2',
};

/** One Scryfall symbol rendered from its official SVG (text pip as fallback). */
export function ManaSymbol({ symbol, size = 16 }: { symbol: string; size?: number }) {
  const symbols = useManaSymbols();
  const info = symbols.get(symbol);
  if (info?.svg_uri) {
    return (
      <img
        src={info.svg_uri}
        alt={symbol}
        title={info.english}
        width={size}
        height={size}
        draggable={false}
        className="inline-block shrink-0 rounded-full align-[-0.18em] shadow-[0_1px_0_rgba(0,0,0,0.55)]"
      />
    );
  }
  const inner = symbol.slice(1, -1);
  return (
    <span
      aria-label={symbol}
      className="inline-grid shrink-0 place-items-center rounded-full align-[-0.18em] font-sans font-bold text-[#1a1712]"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.55,
        background: FALLBACK_COLORS[inner] ?? '#CAC5C0',
      }}
    >
      {inner}
    </span>
  );
}

/** Mana cost string such as "{2}{W}{U}" or "{1}{R} // {1}{U}". */
export function ManaCost({ cost, size = 16, className }: { cost: string; size?: number; className?: string }) {
  if (!cost) return null;
  const halves = cost.split(' // ');
  return (
    <span className={`inline-flex flex-wrap items-center gap-[2px] ${className ?? ''}`} aria-label={`Mana cost ${cost}`}>
      {halves.map((half, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="px-1 text-xs opacity-60">//</span>}
          {(half.match(SYMBOL_RE) ?? []).map((symbol, j) => (
            <ManaSymbol key={`${symbol}-${j}`} symbol={symbol} size={size} />
          ))}
        </Fragment>
      ))}
    </span>
  );
}

/** Running text with inline symbols, e.g. "{T}: Add {G}." */
export function SymbolText({ text, size = 14 }: { text: string; size?: number }) {
  const parts = text.split(SYMBOL_RE);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('{') && part.endsWith('}') ? (
          <ManaSymbol key={i} symbol={part} size={size} />
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** Oracle text: one paragraph per line, reminder text in italics. */
export function OracleText({ text, symbolSize = 13 }: { text: string; symbolSize?: number }) {
  if (!text) return null;
  return (
    <>
      {text.split('\n').map((line, i) => {
        const segments: ReactNode[] = line.split(/(\([^)]*\))/).map((segment, j) =>
          segment.startsWith('(') ? (
            <em key={j} className="opacity-80">
              <SymbolText text={segment} size={symbolSize} />
            </em>
          ) : (
            <SymbolText key={j} text={segment} size={symbolSize} />
          ),
        );
        return (
          <p key={i} className="mb-[0.35em] last:mb-0">
            {segments}
          </p>
        );
      })}
    </>
  );
}
