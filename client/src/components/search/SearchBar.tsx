import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useSearchStore } from '../../stores/searchStore.js';

export default function SearchBar() {
  const navigate = useNavigate();
  const { query, results, loading, isOpen, setQuery, search, open, close } = useSearchStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Expose the input ref globally so keyboard shortcuts can focus it
  useEffect(() => {
    (window as any).__melloSearchInputRef = inputRef;
    return () => {
      delete (window as any).__melloSearchInputRef;
    };
  }, []);

  const handleChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        search(value);
      }, 300);
    },
    [setQuery, search],
  );

  const handleResultClick = (boardId: string, cardId: string) => {
    close();
    navigate(`/b/${boardId}?card=${cardId}`);
  };

  const handleFocus = () => {
    open();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      close();
      inputRef.current?.blur();
    }
  };

  // Group results by board
  const grouped = results.reduce<Record<string, typeof results>>((acc, r) => {
    if (!acc[r.boardId]) acc[r.boardId] = [];
    acc[r.boardId].push(r);
    return acc;
  }, {});

  return (
    <>
      <div className="relative">
        <input
          ref={inputRef}
          id="mello-search-input"
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder="Search cards... (Ctrl+K)"
          className="bg-white/20 text-white placeholder-white/60 rounded px-3 py-1.5 text-base w-[12rem] focus:w-[18rem] focus:bg-white/30 transition-all duration-200 outline-none focus:ring-2 focus:ring-white/40"
        />
      </div>

      {isOpen &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/40 flex items-start justify-center pt-20 z-[60]"
            onClick={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <div
              className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Search input inside overlay */}
              <div className="p-4 border-b border-gray-200">
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => handleChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search for cards, descriptions, comments..."
                  className="w-full text-lg px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
                <p className="text-sm text-gray-500 mt-2">
                  Press <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-sm font-mono">Esc</kbd> to close
                </p>
              </div>

              {/* Results */}
              <div className="max-h-[400px] overflow-y-auto">
                {loading && (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent" />
                    <span className="ml-3 text-base text-gray-500">Searching...</span>
                  </div>
                )}

                {!loading && query.trim() && results.length === 0 && (
                  <div className="py-8 text-center">
                    <p className="text-base text-gray-500">No results found for "{query}"</p>
                    <p className="text-sm text-gray-400 mt-1">Try a different search term</p>
                  </div>
                )}

                {!loading &&
                  Object.entries(grouped).map(([boardId, boardResults]) => (
                    <div key={boardId}>
                      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                          {boardResults[0].boardName}
                        </h3>
                      </div>
                      {boardResults.map((result) => (
                        <button
                          key={result.cardId}
                          onClick={() => handleResultClick(result.boardId, result.cardId)}
                          className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-base font-medium text-gray-900">{result.cardName}</span>
                            <span className="text-sm text-gray-400">in {result.listName}</span>
                          </div>
                          {result.snippet && (
                            <p
                              className="text-sm text-gray-600 line-clamp-2 [&_mark]:bg-yellow-200 [&_mark]:text-gray-900 [&_mark]:px-0.5 [&_mark]:rounded"
                              dangerouslySetInnerHTML={{ __html: result.snippet }}
                            />
                          )}
                          <span className="text-sm text-gray-400 mt-1 inline-block">
                            Match in {result.matchSource}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}

                {!loading && !query.trim() && (
                  <div className="py-8 text-center">
                    <p className="text-base text-gray-500">Start typing to search across all your boards</p>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
