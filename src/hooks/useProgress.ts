import { useSyncExternalStore } from 'react';
import { getProgressStore } from '../services/progressStore';
import type { PlayerProgress } from '../types/game';

export function useProgress(): PlayerProgress {
  const store = getProgressStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
