import { useEffect, useCallback } from 'react';
import { useSearchStore } from '../stores/searchStore.js';

interface KeyboardShortcutsOptions {
  onShowHelp: () => void;
}

export function useKeyboardShortcuts({ onShowHelp }: KeyboardShortcutsOptions) {
  const openSearch = useSearchStore((s) => s.open);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputFocused =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Ctrl+K / Cmd+K -- always active, even in inputs
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('mello-search-input');
        if (searchInput) {
          (searchInput as HTMLInputElement).focus();
        }
        openSearch();
        return;
      }

      // Escape -- always active. Modals handle their own escape via Modal.tsx.
      // We don't need to duplicate that here.

      // Below shortcuts only fire when no input is focused
      if (isInputFocused) return;

      // '/' -- focus search
      if (e.key === '/') {
        e.preventDefault();
        const searchInput = document.getElementById('mello-search-input');
        if (searchInput) {
          (searchInput as HTMLInputElement).focus();
        }
        openSearch();
        return;
      }

      // '?' -- show help
      if (e.key === '?') {
        e.preventDefault();
        onShowHelp();
        return;
      }

      // 'n' -- focus add card on first list
      if (e.key === 'n') {
        e.preventDefault();
        // Find the first "Add a card" button on the page
        const addCardButtons = document.querySelectorAll('[data-add-card-button]');
        if (addCardButtons.length > 0) {
          (addCardButtons[0] as HTMLButtonElement).click();
        }
        return;
      }
    },
    [openSearch, onShowHelp],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
