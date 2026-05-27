import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import MarkdownRenderer from './MarkdownRenderer.js';
import { MARKDOWN_SYNTAX } from './markdownSyntax.js';

// Zero-width space: gives blank/empty mirrored lines a real line box so they
// keep height (and a visible highlight bar) without contributing any width.
const ZWSP = String.fromCharCode(0x200b); // U+200B zero-width space

/**
 * Build the mirrored selection highlight for the backdrop layer. Returns one
 * block element per line of `value`. A line whose entire content + line break
 * fall inside the selection (including a blank line) becomes a full-width
 * highlight bar; a partially selected line highlights only its selected run.
 */
function buildHighlightLines(value: string, selStart: number, selEnd: number): ReactNode[] {
  const start = Math.min(selStart, selEnd);
  const end = Math.max(selStart, selEnd);
  const active = end > start;
  const lines = value.split('\n');
  const out: ReactNode[] = [];
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = pos;
    const lineEnd = pos + line.length; // position of the trailing '\n' (or EOF)
    const isLast = i === lines.length - 1;
    const touched = active && start <= lineEnd && end > lineStart;

    if (!touched) {
      out.push(
        <div key={i} className="md-hl-line">
          {line || ZWSP}
        </div>,
      );
    } else {
      // The line's own newline is inside the selection (so it continues below).
      const breakSelected = !isLast && start <= lineEnd && end > lineEnd;
      // Whole line + its break selected → edge-to-edge bar (covers blank lines).
      const fullWidth = start <= lineStart && breakSelected;
      if (fullWidth) {
        out.push(
          <div key={i} className="md-hl-line">
            <mark className="md-hl md-hl-block">{line || ZWSP}</mark>
          </div>,
        );
      } else {
        const a = line.slice(0, Math.max(0, start - lineStart));
        const selS = Math.max(start, lineStart);
        const selE = Math.min(end, lineEnd);
        const b = line.slice(selS - lineStart, selE - lineStart);
        const c = line.slice(selE - lineStart);
        out.push(
          <div key={i} className="md-hl-line">
            {a}
            <mark className="md-hl">{b || ZWSP}</mark>
            {c}
            {breakSelected && <mark className="md-hl md-hl-eol">{ZWSP}</mark>}
          </div>,
        );
      }
    }
    pos = lineEnd + 1; // advance past the '\n'
  }
  return out;
}

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  placeholder?: string;
  minHeight?: number;
  autoFocus?: boolean;
  submitLabel?: string;
  submitting?: boolean;
  disableEmpty?: boolean;
  hideCancel?: boolean;
  footerExtra?: ReactNode;
}

const ListIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" d="M8 6h13M8 12h13M8 18h13" />
    <circle cx="3.5" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="3.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="3.5" cy="18" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);
const CodeIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l-3 3 3 3M16 9l3 3-3 3" />
  </svg>
);
const QuoteIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
    <path d="M7 7h4v6H7c0 2 1 3 3 3v2c-3 0-5-2-5-5V7zm9 0h4v6h-4c0 2 1 3 3 3v2c-3 0-5-2-5-5V7z" />
  </svg>
);

export default function MarkdownEditor({
  value,
  onChange,
  onSave,
  onCancel,
  placeholder,
  minHeight = 120,
  autoFocus,
  submitLabel = 'Save',
  submitting = false,
  disableEmpty = false,
  hideCancel = false,
  footerExtra,
}: MarkdownEditorProps) {
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [showHelp, setShowHelp] = useState(false);
  const [sel, setSel] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // React's `onSelect` on a textarea only fires once the mouse is released, so
  // a click-and-drag selection wouldn't highlight until release. The native
  // `selectionchange` event fires continuously during the drag, so mirror the
  // selection from it while this textarea holds focus (the activeElement guard
  // keeps it from reacting to selections in other inputs).
  useEffect(() => {
    const onSelectionChange = () => {
      const ta = textareaRef.current;
      if (!ta || document.activeElement !== ta) return;
      setSel({ start: ta.selectionStart, end: ta.selectionEnd });
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  // Keep the backdrop scrolled in lockstep with the textarea so the highlight
  // stays under the right glyphs once the content overflows.
  const syncScroll = () => {
    const ta = textareaRef.current;
    const bd = backdropRef.current;
    if (ta && bd) {
      bd.scrollTop = ta.scrollTop;
      bd.scrollLeft = ta.scrollLeft;
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === 'b') {
        e.preventDefault();
        surround('**', '**');
      } else if (key === 'i') {
        e.preventDefault();
        surround('*', '*');
      } else if (key === 'u') {
        e.preventDefault();
        surround('<u>', '</u>');
      }
    }
  };

  function applyChange(next: string, selStart: number, selEnd: number) {
    onChange(next);
    const ta = textareaRef.current;
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(selStart, selEnd);
      setSel({ start: selStart, end: selEnd });
      syncScroll();
    });
  }

  /**
   * Toggle `before`/`after` markers around the selection: wrap if not present,
   * unwrap if the selection already carries them (either inside the selection
   * or immediately surrounding it).
   */
  function surround(before: string, after: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = value.slice(start, end);
    const mc = before[0]; // marker char, e.g. "*" — used to avoid matching a longer run

    // Markers are part of the selection itself, e.g. "**bold**" selected.
    // Guard: don't treat "*" as italic-wrapped when it's really "**" (bold).
    if (
      sel.length >= before.length + after.length &&
      sel.startsWith(before) &&
      sel.endsWith(after) &&
      sel[before.length] !== mc &&
      sel[sel.length - after.length - 1] !== mc
    ) {
      const inner = sel.slice(before.length, sel.length - after.length);
      applyChange(value.slice(0, start) + inner + value.slice(end), start, start + inner.length);
      return;
    }
    // Markers sit just outside the selection, e.g. **[bold]** with "bold" selected.
    // Guard: the char just beyond each marker must not be the same marker char,
    // so toggling italic inside "**bold**" nests it rather than eating one "*".
    if (
      value.slice(start - before.length, start) === before &&
      value.slice(end, end + after.length) === after &&
      value[start - before.length - 1] !== mc &&
      value[end + after.length] !== mc
    ) {
      applyChange(
        value.slice(0, start - before.length) + sel + value.slice(end + after.length),
        start - before.length,
        end - before.length,
      );
      return;
    }
    // Otherwise wrap.
    applyChange(
      value.slice(0, start) + before + sel + after + value.slice(end),
      start + before.length,
      end + before.length,
    );
  }

  /**
   * Toggle a line prefix (e.g. "- " or "> ") across every line in the selection:
   * remove it if all selected lines already have it, otherwise add it.
   */
  function prefixLines(prefix: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const nlAfter = value.indexOf('\n', end);
    const lineEnd = nlAfter === -1 ? value.length : nlAfter;
    const block = value.slice(lineStart, lineEnd);
    const lines = block.split('\n');
    const allPrefixed = lines.every((l) => l.startsWith(prefix));
    const out = lines
      .map((l) => (allPrefixed ? l.slice(prefix.length) : l.startsWith(prefix) ? l : prefix + l))
      .join('\n');
    applyChange(
      value.slice(0, lineStart) + out + value.slice(lineEnd),
      lineStart,
      lineEnd + (out.length - block.length),
    );
  }

  /**
   * Code formatting that picks the right markdown for the selection: inline
   * `code` for a single line (or empty selection), but a fenced ``` block when
   * the selection spans multiple lines. Inline code collapses newlines into
   * spaces, which silently mangles multi-line content like pasted commands;
   * a fenced block preserves the line breaks.
   */
  function applyCode() {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = value.slice(start, end);
    if (!sel.includes('\n')) {
      surround('`', '`');
      return;
    }
    const before = value.slice(0, start);
    const after = value.slice(end);
    // Keep the fence delimiters on their own lines.
    const lead = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    const trail = after.length > 0 && !after.startsWith('\n') ? '\n' : '';
    const open = lead + '```\n';
    const next = before + open + sel + '\n```' + trail + after;
    const selStart = before.length + open.length;
    applyChange(next, selStart, selStart + sel.length);
  }

  const tools: { key: string; title: string; glyph: ReactNode; action: () => void }[] = [
    { key: 'bold', title: 'Bold (Ctrl/Cmd+B)', glyph: <span className="font-bold">B</span>, action: () => surround('**', '**') },
    { key: 'underline', title: 'Underline (Ctrl/Cmd+U)', glyph: <span className="underline">U</span>, action: () => surround('<u>', '</u>') },
    { key: 'italic', title: 'Italic (Ctrl/Cmd+I)', glyph: <span className="italic font-serif">I</span>, action: () => surround('*', '*') },
    { key: 'strike', title: 'Strikethrough', glyph: <span className="line-through">S</span>, action: () => surround('~~', '~~') },
    { key: 'ul', title: 'Bulleted list', glyph: <ListIcon />, action: () => prefixLines('- ') },
    { key: 'code', title: 'Code', glyph: <CodeIcon />, action: applyCode },
    { key: 'quote', title: 'Quote', glyph: <QuoteIcon />, action: () => prefixLines('> ') },
  ];

  const saveDisabled = submitting || (disableEmpty && !value.trim());

  const tabClass = (active: boolean) =>
    `text-sm px-2 py-1 -mb-px ${
      active
        ? 'border-b-2 border-blue-600 text-blue-600 font-medium'
        : 'text-gray-500 hover:text-gray-700'
    }`;

  return (
    <div>
      <div className="flex items-center justify-between border-b border-gray-200 mb-2">
        <div className="flex gap-1">
          <button type="button" className={tabClass(tab === 'write')} onClick={() => setTab('write')}>
            Write
          </button>
          <button type="button" className={tabClass(tab === 'preview')} onClick={() => setTab('preview')}>
            Preview
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowHelp((h) => !h)}
          className="text-xs text-gray-400 hover:text-gray-600 underline decoration-dotted"
          aria-expanded={showHelp}
        >
          Markdown {showHelp ? '▲' : '▼'}
        </button>
      </div>

      {showHelp && (
        <div className="mb-2 p-2 rounded bg-gray-50 border border-gray-200 grid grid-cols-2 gap-x-4 gap-y-1">
          {MARKDOWN_SYNTAX.map(({ syntax, label }) => (
            <div key={syntax} className="flex items-center gap-2 text-xs text-gray-600">
              <code className="bg-gray-200 text-gray-800 px-1 rounded whitespace-nowrap">{syntax}</code>
              <span className="text-gray-400">{label}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'write' && (
        <div className="flex flex-wrap items-center gap-0.5 mb-2">
          {tools.map((t, i) => (
            <div key={t.key} className="flex items-center">
              {(i === 4) && <span className="w-px h-5 bg-gray-200 mx-1" aria-hidden />}
              <button
                type="button"
                title={t.title}
                aria-label={t.title}
                onMouseDown={(e) => e.preventDefault()}
                onClick={t.action}
                className="w-7 h-7 flex items-center justify-center rounded text-gray-600 hover:bg-gray-200 text-sm"
              >
                {t.glyph}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'write' ? (
        <div className="md-editor-shell">
          <div ref={backdropRef} className="md-editor-backdrop text-sm" aria-hidden="true">
            {buildHighlightLines(value, sel.start, sel.end)}
          </div>
          <textarea
            ref={textareaRef}
            className="md-editor-textarea w-full border border-gray-300 rounded p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            style={{ minHeight, display: 'block' }}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              const t = e.currentTarget;
              setSel({ start: t.selectionStart, end: t.selectionEnd });
            }}
            onSelect={(e) => {
              const t = e.currentTarget;
              setSel({ start: t.selectionStart, end: t.selectionEnd });
            }}
            onScroll={syncScroll}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoFocus={autoFocus}
          />
        </div>
      ) : (
        <div className="border border-gray-200 rounded p-3" style={{ minHeight }}>
          {value.trim() ? (
            <MarkdownRenderer content={value} />
          ) : (
            <p className="text-sm text-gray-400">Nothing to preview</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={onSave}
          disabled={saveDisabled}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm px-4 py-1.5 rounded"
        >
          {submitting ? 'Saving...' : submitLabel}
        </button>
        {!hideCancel && (
          <button
            onClick={onCancel}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5"
          >
            Cancel
          </button>
        )}
        {footerExtra}
      </div>
    </div>
  );
}
