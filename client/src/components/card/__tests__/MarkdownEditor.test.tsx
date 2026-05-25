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
    expect(screen.getByRole('button', { name: /Markdown/ })).toBeInTheDocument();
    expect(screen.queryByTestId('markdown-renderer')).not.toBeInTheDocument();
  });

  it('toggles a syntax cheatsheet when the Markdown hint is clicked', () => {
    renderEditor();
    expect(screen.queryByText('Bold')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Markdown/ }));
    expect(screen.getByText('Bold')).toBeInTheDocument();
    expect(screen.getByText('**bold**')).toBeInTheDocument();
    expect(screen.getByText('Bullet list')).toBeInTheDocument();
  });

  it('wraps the selected text in bold markers when the Bold button is clicked', () => {
    const { onChange } = renderEditor({ value: 'hello world' });
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 5); // select "hello"
    fireEvent.click(screen.getByRole('button', { name: /Bold/ }));
    expect(onChange).toHaveBeenCalledWith('**hello** world');
  });

  it('prefixes the current line with a bullet when the bulleted-list button is clicked', () => {
    const { onChange } = renderEditor({ value: 'item one' });
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);
    fireEvent.click(screen.getByRole('button', { name: /Bulleted list/ }));
    expect(onChange).toHaveBeenCalledWith('- item one');
  });

  it('un-bolds when the selection is already wrapped in ** markers', () => {
    const { onChange } = renderEditor({ value: '**hello** world' });
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 9); // select "**hello**"
    fireEvent.click(screen.getByRole('button', { name: /Bold/ }));
    expect(onChange).toHaveBeenCalledWith('hello world');
  });

  it('un-bolds when ** markers surround (but are outside) the selection', () => {
    const { onChange } = renderEditor({ value: '**hello** world' });
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.setSelectionRange(2, 7); // select just "hello"
    fireEvent.click(screen.getByRole('button', { name: /Bold/ }));
    expect(onChange).toHaveBeenCalledWith('hello world');
  });

  it('nests italic inside bold rather than eating an asterisk', () => {
    const { onChange } = renderEditor({ value: '**bold**' });
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.setSelectionRange(2, 6); // select "bold" inside **bold**
    fireEvent.click(screen.getByRole('button', { name: /Italic/ }));
    expect(onChange).toHaveBeenCalledWith('***bold***');
  });

  it('removes the bullet prefix when the line already has one', () => {
    const { onChange } = renderEditor({ value: '- item one' });
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);
    fireEvent.click(screen.getByRole('button', { name: /Bulleted list/ }));
    expect(onChange).toHaveBeenCalledWith('item one');
  });

  it('inserts underline HTML tags around the selection', () => {
    const { onChange } = renderEditor({ value: 'abc' });
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 3);
    fireEvent.click(screen.getByRole('button', { name: /Underline/ }));
    expect(onChange).toHaveBeenCalledWith('<u>abc</u>');
  });

  it('hides the formatting toolbar on the Preview tab', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.queryByRole('button', { name: /Bold/ })).not.toBeInTheDocument();
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
