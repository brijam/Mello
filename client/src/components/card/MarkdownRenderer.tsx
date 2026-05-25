import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface MarkdownRendererProps {
  content: string;
  /** Force inverted (light-on-dark) prose colors, for always-dark surfaces like the mobile sheet. */
  invert?: boolean;
}

export default function MarkdownRenderer({ content, invert = false }: MarkdownRendererProps) {
  const html = useMemo(() => {
    const raw = marked.parse(content, { async: false, gfm: true, breaks: true }) as string;
    return DOMPurify.sanitize(raw);
  }, [content]);

  return (
    <div
      className={`prose prose-sm max-w-none dark:prose-invert ${invert ? 'prose-invert' : ''}
        prose-headings:mb-2 prose-headings:mt-4
        prose-p:my-1 prose-ul:my-1 prose-ol:my-1
        prose-li:my-0 prose-pre:bg-gray-100 prose-pre:rounded
        prose-code:text-sm prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded
        prose-a:text-blue-600 prose-a:underline`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
