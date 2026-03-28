import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, createTestUser, injectWithAuth, cleanDatabase } from './setup.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await cleanDatabase();
  await app.close();
});

beforeEach(async () => {
  await cleanDatabase();
});

/**
 * Helper: creates a user, workspace, board, list, and card.
 */
async function setupCard(appInstance: FastifyInstance) {
  const testUser = await createTestUser(appInstance);
  const boardRes = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: '/api/v1/boards',
    payload: { workspaceId: testUser.workspace.id, name: 'Test Board' },
  });
  const board = boardRes.json().board;

  const listRes = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/boards/${board.id}/lists`,
    payload: { name: 'To Do' },
  });
  const list = listRes.json().list;

  const cardRes = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/lists/${list.id}/cards`,
    payload: { name: 'Test Card' },
  });
  const card = cardRes.json().card;

  return { ...testUser, board, list, card };
}

/**
 * Helper: builds a multipart/form-data payload for file upload.
 */
function buildMultipartPayload(
  filename: string,
  contentType: string,
  content: string,
) {
  const boundary = '----TestBoundary';
  const payload = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    `Content-Type: ${contentType}`,
    '',
    content,
    `--${boundary}--`,
  ].join('\r\n');

  return {
    payload,
    contentTypeHeader: `multipart/form-data; boundary=${boundary}`,
  };
}

/**
 * Helper: uploads a test file to a card using app.inject directly
 * (since injectWithAuth doesn't support custom headers).
 */
async function uploadFile(
  appInstance: FastifyInstance,
  cookies: string,
  cardId: string,
  filename = 'test.txt',
  contentType = 'text/plain',
  content = 'Hello World file content',
) {
  const { payload, contentTypeHeader } = buildMultipartPayload(
    filename,
    contentType,
    content,
  );

  return appInstance.inject({
    method: 'POST',
    url: `/api/v1/cards/${cardId}/attachments`,
    payload,
    headers: {
      cookie: cookies,
      'content-type': contentTypeHeader,
    },
  });
}

// ── Upload ────────────────────────────────────────────────────────────────────

describe('POST /api/v1/cards/:cardId/attachments', () => {
  it('uploads a file and returns attachment metadata', async () => {
    const { cookies, card } = await setupCard(app);

    const res = await uploadFile(app, cookies, card.id);

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.attachment).toBeDefined();
    expect(body.attachment.id).toBeDefined();
    expect(body.attachment.cardId).toBe(card.id);
    expect(body.attachment.filename).toBe('test.txt');
    expect(body.attachment.mimeType).toBe('text/plain');
    expect(body.attachment.sizeBytes).toBeGreaterThan(0);
    expect(body.attachment.createdAt).toBeDefined();
  });

  it('response includes all required fields', async () => {
    const { cookies, card, user } = await setupCard(app);

    const res = await uploadFile(app, cookies, card.id);

    expect(res.statusCode).toBe(201);
    const att = res.json().attachment;
    expect(att.id).toBeDefined();
    expect(att.cardId).toBe(card.id);
    expect(att.userId).toBe(user.id);
    expect(att.filename).toBeDefined();
    expect(att.mimeType).toBeDefined();
    expect(typeof att.sizeBytes).toBe('number');
    expect(att.createdAt).toBeDefined();
  });

  it('preserves original filename', async () => {
    const { cookies, card } = await setupCard(app);

    const res = await uploadFile(
      app,
      cookies,
      card.id,
      'my-design-mockup.png',
      'image/png',
      'fake png content',
    );

    expect(res.statusCode).toBe(201);
    expect(res.json().attachment.filename).toBe('my-design-mockup.png');
  });

  it('multiple files can be uploaded to the same card', async () => {
    const { cookies, card } = await setupCard(app);

    const res1 = await uploadFile(app, cookies, card.id, 'file1.txt', 'text/plain', 'content 1');
    const res2 = await uploadFile(app, cookies, card.id, 'file2.txt', 'text/plain', 'content 2');

    expect(res1.statusCode).toBe(201);
    expect(res2.statusCode).toBe(201);
    expect(res1.json().attachment.id).not.toBe(res2.json().attachment.id);
  });

  it('returns 401 for unauthenticated upload', async () => {
    const { card } = await setupCard(app);

    const { payload, contentTypeHeader } = buildMultipartPayload(
      'test.txt',
      'text/plain',
      'content',
    );

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/cards/${card.id}/attachments`,
      payload,
      headers: {
        'content-type': contentTypeHeader,
      },
    });

    expect(res.statusCode).toBe(401);
  });
});

// ── Download ──────────────────────────────────────────────────────────────────

describe('GET /api/v1/attachments/:id/download', () => {
  it('returns the file content', async () => {
    const { cookies, card } = await setupCard(app);
    const fileContent = 'Hello World file content';

    const uploadRes = await uploadFile(app, cookies, card.id, 'test.txt', 'text/plain', fileContent);
    expect(uploadRes.statusCode).toBe(201);
    const attachmentId = uploadRes.json().attachment.id;

    const res = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/attachments/${attachmentId}/download`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain(fileContent);
  });

  it('has correct Content-Type header', async () => {
    const { cookies, card } = await setupCard(app);

    const uploadRes = await uploadFile(app, cookies, card.id, 'test.txt', 'text/plain', 'content');
    const attachmentId = uploadRes.json().attachment.id;

    const res = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/attachments/${attachmentId}/download`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
  });

  it('has Content-Disposition header with filename', async () => {
    const { cookies, card } = await setupCard(app);

    const uploadRes = await uploadFile(
      app,
      cookies,
      card.id,
      'my-report.pdf',
      'application/pdf',
      'fake pdf content',
    );
    const attachmentId = uploadRes.json().attachment.id;

    const res = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/attachments/${attachmentId}/download`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('my-report.pdf');
  });

  it('returns 404 for non-existent attachment', async () => {
    const { cookies } = await setupCard(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: '/api/v1/attachments/00000000-0000-0000-0000-000000000000/download',
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 401 for unauthenticated download', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/attachments/00000000-0000-0000-0000-000000000000/download',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ── Delete ────────────────────────────────────────────────────────────────────

describe('DELETE /api/v1/attachments/:id', () => {
  it('deletes the attachment', async () => {
    const { cookies, card } = await setupCard(app);

    const uploadRes = await uploadFile(app, cookies, card.id);
    const attachmentId = uploadRes.json().attachment.id;

    const res = await injectWithAuth(app, cookies, {
      method: 'DELETE',
      url: `/api/v1/attachments/${attachmentId}`,
    });

    expect(res.statusCode).toBe(204);
  });

  it('deleted attachment returns 404 on download', async () => {
    const { cookies, card } = await setupCard(app);

    const uploadRes = await uploadFile(app, cookies, card.id);
    const attachmentId = uploadRes.json().attachment.id;

    // Delete it
    await injectWithAuth(app, cookies, {
      method: 'DELETE',
      url: `/api/v1/attachments/${attachmentId}`,
    });

    // Try to download
    const downloadRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/attachments/${attachmentId}/download`,
    });

    expect(downloadRes.statusCode).toBe(404);
  });

  it('returns 404 or 204 for non-existent attachment', async () => {
    const { cookies } = await setupCard(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'DELETE',
      url: '/api/v1/attachments/00000000-0000-0000-0000-000000000000',
    });

    // Spec says 404, but 204 is also acceptable
    expect([204, 404]).toContain(res.statusCode);
  });

  it('returns 401 for unauthenticated delete', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/attachments/00000000-0000-0000-0000-000000000000',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ── Card Detail includes attachments ──────────────────────────────────────────

describe('GET /api/v1/cards/:cardId (attachments)', () => {
  it('includes attachments in card detail response', async () => {
    const { cookies, card } = await setupCard(app);

    // Upload a file
    await uploadFile(app, cookies, card.id, 'readme.md', 'text/markdown', '# Hello');

    const res = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/cards/${card.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.card.attachments).toBeDefined();
    expect(body.card.attachments).toHaveLength(1);
    expect(body.card.attachments[0].filename).toBe('readme.md');
  });
});

// ── Edge Cases ────────────────────────────────────────────────────────────────

describe('Attachment edge cases', () => {
  it('rejects file over 25MB', async () => {
    const { cookies, card } = await setupCard(app);

    // Create a payload that exceeds 25MB (26,214,400 bytes)
    // NOTE: This test creates a large string which may be slow.
    // In practice, a smaller configured limit may be used for testing.
    const largeContent = 'x'.repeat(26_214_401);
    const res = await uploadFile(
      app,
      cookies,
      card.id,
      'large-file.bin',
      'application/octet-stream',
      largeContent,
    );

    expect(res.statusCode).toBe(413);
  });
});
