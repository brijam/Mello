import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MarkdownEditor from '../MarkdownEditor.js';

vi.mock('../MarkdownRenderer.js', () => ({
  default: ({ content }: { content: string }) => (
    <div data-testid="markdown-renderer">{content}</div>
  ),
}));

function renderEditor(props: Partial<React.ComponentProps<typeof MarkdownEditor>> = {}) {
  const onChange = vi.fn();
  const onSave = vi.fn();
  const onCancel = vi.fn();
  const result = render(
    <MarkdownEditor
      value="hello"
      onChange={onChange}
      onSave={onSave}
      onCancel={onCancel}
      {...props}
    />
  );
  return { ...result, onChange, onSave, onCancel };
}

describe('MarkdownEditor', () => {
  it('shows the Write textarea and the markdown hint by default', () => {
    renderEditor();
    expect(screen.getByRole('textbox')).toHaveValue('hello');
    expect(screen.getByText('Markdown supported')).toBeInTheDocument();
    expect(screen.queryByTestId('markdown-renderer')).not.toBeInTheDocument();
  });

  it('renders MarkdownRenderer with the current value when Preview is selected', () => {
    renderEditor({ value: 'hello world' });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const preview = screen.getByTestId('markdown-renderer');
    expect(preview).toHaveTextContent('hello world');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows "Nothing to preview" when value is empty', () => {
    renderEditor({ value: '   ' });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByText('Nothing to preview')).toBeInTheDocument();
    expect(screen.queryByTestId('markdown-renderer')).not.toBeInTheDocument();
  });

  it('calls onSave on Ctrl/Cmd+Enter and onCancel on Escape', () => {
    const { onSave, onCancel } = renderEditor();
    const textarea = screen.getByRole('textbox');
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables Save when disableEmpty and value is blank', () => {
    renderEditor({ value: '', disableEmpty: true });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows "Saving..." and disables Save when submitting', () => {
    renderEditor({ submitting: true });
    const btn = screen.getByRole('button', { name: 'Saving...' });
    expect(btn).toBeDisabled();
  });

  it('renders footerExtra content', () => {
    renderEditor({ footerExtra: <span>tip text</span> });
    expect(screen.getByText('tip text')).toBeInTheDocument();
  });
});
