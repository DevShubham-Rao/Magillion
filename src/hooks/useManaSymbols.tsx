import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { scryfall } from '../services/scryfallService';
import type { ScryfallCardSymbol } from '../types/mtg';

const ManaSymbolContext = createContext<Map<string, ScryfallCardSymbol>>(new Map());

/** Loads Scryfall's symbology once and shares it with every mana cost. */
export function ManaSymbolProvider({ children }: { children: ReactNode }) {
  const [symbols, setSymbols] = useState<Map<string, ScryfallCardSymbol>>(() => new Map());

  useEffect(() => {
    let alive = true;
    void scryfall.getSymbology().then((map) => {
      if (alive) setSymbols(map);
    });
    return () => {
      alive = false;
    };
  }, []);

  return <ManaSymbolContext.Provider value={symbols}>{children}</ManaSymbolContext.Provider>;
}

export function useManaSymbols(): Map<string, ScryfallCardSymbol> {
  return useContext(ManaSymbolContext);
}
