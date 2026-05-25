import { useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import MarkdownRenderer from './MarkdownRenderer.js';
import { MARKDOWN_SYNTAX } from './markdownSyntax.js';

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  /** Wrap the current selection with `before`/`after`, then restore selection. */
  function surround(before: string, after: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, end + before.length);
    });
  }

  /** Prepend `prefix` to every line touched by the current selection. */
  function prefixLines(prefix: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const block = value.slice(lineStart, end);
    const prefixed = block
      .split('\n')
      .map((l) => prefix + l)
      .join('\n');
    const next = value.slice(0, lineStart) + prefixed + value.slice(end);
    onChange(next);
    const added = prefixed.length - block.length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, end + added);
    });
  }

  const tools: { key: string; title: string; glyph: ReactNode; action: () => void }[] = [
    { key: 'bold', title: 'Bold (Ctrl/Cmd+B)', glyph: <span className="font-bold">B</span>, action: () => surround('**', '**') },
    { key: 'underline', title: 'Underline (Ctrl/Cmd+U)', glyph: <span className="underline">U</span>, action: () => surround('<u>', '</u>') },
    { key: 'italic', title: 'Italic (Ctrl/Cmd+I)', glyph: <span className="italic font-serif">I</span>, action: () => surround('*', '*') },
    { key: 'strike', title: 'Strikethrough', glyph: <span className="line-through">S</span>, action: () => surround('~~', '~~') },
    { key: 'ul', title: 'Bulleted list', glyph: <ListIcon />, action: () => prefixLines('- ') },
    { key: 'code', title: 'Code', glyph: <CodeIcon />, action: () => surround('`', '`') },
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
        <textarea
          ref={textareaRef}
          className="w-full border border-gray-300 rounded p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          style={{ minHeight }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
        />
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
