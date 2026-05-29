import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface MarkdownRendererProps {
  content: string;
  /** Force inverted (light-on-dark) prose colors, for always-dark surfaces like the mobile sheet. */
  invert?: boolean;
}

/**
 * Make newlines behave like a plain-text editor instead of Markdown's
 * paragraph-collapsing rules: every blank line outside a fenced code block is
 * replaced with a non-breaking space (char 0xA0) so `marked` (with breaks:true)
 * emits a `<br>` for it. Result: one Enter = one line down, each blank line =
 * one blank line of the same height — consistent vertical spacing. Fenced ```
 * blocks are left untouched so their internal blank lines stay literal.
 */
export function preserveBlankLines(src: string): string {
  const NBSP = String.fromCharCode(0xa0); // placeholder marked renders but won't collapse
  let inFence = false;
  return src
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (!inFence && /^[ \t]*$/.test(line)) return NBSP;
      return line;
    })
    .join('\n');
}

export default function MarkdownRenderer({ content, invert = false }: MarkdownRendererProps) {
  const html = useMemo(() => {
    const raw = marked.parse(preserveBlankLines(content), {
      async: false,
      gfm: true,
      breaks: true,
    }) as string;
    return DOMPurify.sanitize(raw);
  }, [content]);

  return (
    <div
      className={`prose prose-sm max-w-none dark:prose-invert ${invert ? 'prose-invert' : ''}
        break-words [overflow-wrap:anywhere]
        prose-headings:mb-2 prose-headings:mt-4
        prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0
        prose-pre:bg-black prose-pre:text-white prose-pre:rounded prose-pre:p-3 prose-pre:overflow-x-auto
        prose-code:text-sm prose-code:bg-gray-200 prose-code:text-gray-900 prose-code:px-1 prose-code:rounded
        [&_pre_code]:bg-transparent [&_pre_code]:text-inherit [&_pre_code]:p-0
        prose-a:text-blue-600 prose-a:underline [&_a]:[overflow-wrap:anywhere]`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
