import { useEffect, useState } from 'react';
import { scryfall, StaleRequestError, type SearchSuggestion } from '../services/scryfallService';
import { normalizeName } from '../lib/cardFaces';

const DEBOUNCE_MS = 150;

export type SearchStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface CardSearchState {
  status: SearchStatus;
  suggestions: SearchSuggestion[];
  /** The query these suggestions belong to. */
  query: string;
}

const IDLE: CardSearchState = { status: 'idle', suggestions: [], query: '' };

/** Debounced live suggestions; stale responses are dropped, never shown. */
export function useCardSearch(query: string, enabled: boolean): CardSearchState {
  const [state, setState] = useState<CardSearchState>(IDLE);

  useEffect(() => {
    const trimmed = query.trim();
    if (!enabled || normalizeName(trimmed).length < 2) {
      setState(IDLE);
      return;
    }

    let superseded = false;
    setState((prev) => ({ ...prev, status: 'loading' }));
    const timer = window.setTimeout(() => {
      scryfall
        .searchSuggestions(trimmed, { isStale: () => superseded })
        .then((suggestions) => {
          if (!superseded) setState({ status: 'ready', suggestions, query: trimmed });
        })
        .catch((error: unknown) => {
          if (superseded || error instanceof StaleRequestError) return;
          setState({ status: 'error', suggestions: [], query: trimmed });
        });
    }, DEBOUNCE_MS);

    return () => {
      superseded = true;
      window.clearTimeout(timer);
    };
  }, [query, enabled]);

  return state;
}
