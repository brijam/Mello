import { useState, type ReactNode, type KeyboardEvent } from 'react';
import MarkdownRenderer from './MarkdownRenderer.js';

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

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

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
        <span className="text-xs text-gray-400">Markdown supported</span>
      </div>

      {tab === 'write' ? (
        <textarea
          className="w-full border border-gray-300 rounded p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          style={{ minHeight }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
        />
      ) : (
        <div
          className="border border-gray-200 rounded p-3"
          style={{ minHeight }}
        >
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
