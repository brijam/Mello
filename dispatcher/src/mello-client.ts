import { request, FormData } from 'undici';
import type { AgentMeta, CardDetail } from '@mello/shared';

export interface ListSummary {
  id: string;
  name: string;
  boardId: string;
}

export class MelloClient {
  constructor(private baseUrl: string, private apiKey: string) {}

  private headers(extra: Record<string, string> = {}) {
    return {
      'authorization': `Bearer ${this.apiKey}`,
      'content-type': 'application/json',
      ...extra,
    };
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await request(`${this.baseUrl}${path}`, {
      method: method as any,
      headers: this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.statusCode >= 400) {
      const text = await res.body.text();
      throw new Error(`${method} ${path} -> ${res.statusCode}: ${text}`);
    }
    if (res.statusCode === 204) return undefined as T;
    return (await res.body.json()) as T;
  }

  getCard(cardId: string): Promise<{ card: CardDetail }> {
    return this.req('GET', `/api/v1/cards/${cardId}`);
  }

  patchCard(cardId: string, patch: Partial<{ agentMeta: AgentMeta | null }> & Record<string, unknown>) {
    return this.req<{ card: CardDetail }>('PATCH', `/api/v1/cards/${cardId}`, patch);
  }

  patchAgentMeta(cardId: string, meta: AgentMeta) {
    return this.patchCard(cardId, { agentMeta: meta });
  }

  moveCard(cardId: string, listId: string, position: number) {
    return this.req('POST', `/api/v1/cards/${cardId}/move`, { listId, position });
  }

  addComment(cardId: string, body: string) {
    return this.req('POST', `/api/v1/cards/${cardId}/comments`, { body });
  }

  // Note: this endpoint returns lists-with-cards; we only consume id/name/boardId.
  getBoardLists(boardId: string): Promise<{ lists: ListSummary[] }> {
    return this.req('GET', `/api/v1/boards/${boardId}/lists`);
  }

  async uploadAttachment(cardId: string, filename: string, content: Buffer | string, mimeType = 'text/plain') {
    const fd = new FormData();
    const buffer = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    const ab = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(ab).set(buffer);
    fd.set('file', new File([ab], filename, { type: mimeType }));
    const res = await request(`${this.baseUrl}/api/v1/cards/${cardId}/attachments`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: fd as any,
    });
    if (res.statusCode >= 400) {
      const text = await res.body.text();
      throw new Error(`upload -> ${res.statusCode}: ${text}`);
    }
    return res.body.json();
  }
}
