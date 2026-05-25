import { describe, it, expect } from 'vitest';
import { preserveBlankLines } from '../MarkdownRenderer.js';

const NBSP = String.fromCharCode(0xa0);

describe('preserveBlankLines', () => {
  it('leaves non-blank consecutive lines untouched', () => {
    expect(preserveBlankLines('a\nb')).toBe('a\nb');
  });

  it('replaces a blank line with a non-breaking space so it is not collapsed', () => {
    expect(preserveBlankLines('a\n\nb')).toBe(`a\n${NBSP}\nb`);
  });

  it('replaces each of multiple consecutive blank lines', () => {
    expect(preserveBlankLines('a\n\n\nb')).toBe(`a\n${NBSP}\n${NBSP}\nb`);
  });

  it('treats whitespace-only lines as blank', () => {
    expect(preserveBlankLines('a\n   \nb')).toBe(`a\n${NBSP}\nb`);
  });

  it('does NOT touch blank lines inside a fenced code block', () => {
    const src = '```\nl1\n\nl2\n```';
    expect(preserveBlankLines(src)).toBe(src);
  });

  it('still preserves blank lines outside a fence when a fence is present', () => {
    const src = 'intro\n\n```\ncode\n```\n\nouter';
    expect(preserveBlankLines(src)).toBe(`intro\n${NBSP}\n\`\`\`\ncode\n\`\`\`\n${NBSP}\nouter`);
  });
});
