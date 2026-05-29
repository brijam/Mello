import { useEffect } from 'react';
import { create } from 'zustand';

interface UnsavedChangesState {
  // Each open editor with pending edits registers a unique key here.
  dirtyKeys: Set<string>;
  setDirty: (key: string, dirty: boolean) => void;
  clear: () => void;
  hasUnsaved: () => boolean;
}

export const useUnsavedChangesStore = create<UnsavedChangesState>((set, get) => ({
  dirtyKeys: new Set(),
  setDirty: (key, dirty) =>
    set((state) => {
      if (dirty === state.dirtyKeys.has(key)) return state; // no-op, avoid re-render
      const next = new Set(state.dirtyKeys);
      if (dirty) next.add(key);
      else next.delete(key);
      return { dirtyKeys: next };
    }),
  clear: () => set({ dirtyKeys: new Set() }),
  hasUnsaved: () => get().dirtyKeys.size > 0,
}));

/**
 * Register an editor's dirty state under a stable key. The flag is cleared
 * automatically when the editor unmounts.
 */
export function useUnsavedFlag(key: string, dirty: boolean): void {
  const setDirty = useUnsavedChangesStore((s) => s.setDirty);
  useEffect(() => {
    setDirty(key, dirty);
  }, [key, dirty, setDirty]);
  useEffect(() => {
    return () => setDirty(key, false);
  }, [key, setDirty]);
}

/**
 * Returns true if it's safe to proceed with a close/navigation: either there
 * are no unsaved changes, or the user confirmed discarding them.
 */
export function confirmDiscardIfUnsaved(): boolean {
  if (useUnsavedChangesStore.getState().hasUnsaved()) {
    return window.confirm('You have unsaved changes that will be lost. Leave anyway?');
  }
  return true;
}
