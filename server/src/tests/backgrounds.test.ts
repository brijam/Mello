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
 * Helper: creates a user, workspace, and board.
 */
async function setupBoard(appInstance: FastifyInstance) {
  const testUser = await createTestUser(appInstance);
  const boardRes = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: '/api/v1/boards',
    payload: { workspaceId: testUser.workspace.id, name: 'Test Board' },
  });
  const board = boardRes.json().board;
  return { ...testUser, board };
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
 * Helper: uploads a background image to a board.
 */
async function uploadBackground(
  appInstance: FastifyInstance,
  cookies: string,
  boardId: string,
  filename = 'background.png',
  contentType = 'image/png',
  content = 'fake png image content',
) {
  const { payload, contentTypeHeader } = buildMultipartPayload(
    filename,
    contentType,
    content,
  );

  return appInstance.inject({
    method: 'POST',
    url: `/api/v1/boards/${boardId}/background`,
    payload,
    headers: {
      cookie: cookies,
      'content-type': contentTypeHeader,
    },
  });
}

// ── Upload ────────────────────────────────────────────────────────────────────

describe('POST /api/v1/boards/:boardId/background', () => {
  it('uploads an image and updates the board', async () => {
    const { cookies, board } = await setupBoard(app);

    const res = await uploadBackground(app, cookies, board.id);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.board).toBeDefined();
    expect(body.board.id).toBe(board.id);
  });

  it('sets backgroundType to image after upload', async () => {
    const { cookies, board } = await setupBoard(app);

    const res = await uploadBackground(app, cookies, board.id);

    expect(res.statusCode).toBe(200);
    expect(res.json().board.backgroundType).toBe('image');
  });

  it('sets backgroundValue to the serve URL path', async () => {
    const { cookies, board } = await setupBoard(app);

    const res = await uploadBackground(app, cookies, board.id);

    expect(res.statusCode).toBe(200);
    const backgroundValue = res.json().board.backgroundValue;
    expect(backgroundValue).toContain(`/api/v1/boards/${board.id}/background/image`);
  });

  it('response includes the updated board object', async () => {
    const { cookies, board } = await setupBoard(app);

    const res = await uploadBackground(app, cookies, board.id);

    expect(res.statusCode).toBe(200);
    const returnedBoard = res.json().board;
    expect(returnedBoard.id).toBe(board.id);
    expect(returnedBoard.name).toBe('Test Board');
    expect(returnedBoard.backgroundType).toBe('image');
    expect(returnedBoard.backgroundValue).toBeDefined();
    expect(returnedBoard.updatedAt).toBeDefined();
  });

  it('returns 401 for unauthenticated upload', async () => {
    const { board } = await setupBoard(app);

    const { payload, contentTypeHeader } = buildMultipartPayload(
      'background.png',
      'image/png',
      'fake content',
    );

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/boards/${board.id}/background`,
      payload,
      headers: {
        'content-type': contentTypeHeader,
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it('only board admin can upload (normal member gets 403)', async () => {
    const owner = await setupBoard(app);
    const member = await createTestUser(app);

    // Add member as normal role
    await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: `/api/v1/boards/${owner.board.id}/members`,
      payload: { userId: member.user.id, role: 'normal' },
    });

    const res = await uploadBackground(app, member.cookies, owner.board.id);

    expect(res.statusCode).toBe(403);
  });

  it('only board admin can upload (observer gets 403)', async () => {
    const owner = await setupBoard(app);
    const observer = await createTestUser(app);

    // Add observer
    await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: `/api/v1/boards/${owner.board.id}/members`,
      payload: { userId: observer.user.id, role: 'observer' },
    });

    const res = await uploadBackground(app, observer.cookies, owner.board.id);

    expect(res.statusCode).toBe(403);
  });

  it('returns 404 for non-existent board', async () => {
    const { cookies } = await createTestUser(app);

    const res = await uploadBackground(
      app,
      cookies,
      '00000000-0000-0000-0000-000000000000',
    );

    expect(res.statusCode).toBe(404);
  });

  it('rejects non-image file types with 400', async () => {
    const { cookies, board } = await setupBoard(app);

    const res = await uploadBackground(
      app,
      cookies,
      board.id,
      'document.pdf',
      'application/pdf',
      'fake pdf content',
    );

    expect(res.statusCode).toBe(400);
  });

  it('accepts JPEG images', async () => {
    const { cookies, board } = await setupBoard(app);

    const res = await uploadBackground(
      app,
      cookies,
      board.id,
      'photo.jpg',
      'image/jpeg',
      'fake jpeg content',
    );

    expect(res.statusCode).toBe(200);
    expect(res.json().board.backgroundType).toBe('image');
  });

  it('accepts WebP images', async () => {
    const { cookies, board } = await setupBoard(app);

    const res = await uploadBackground(
      app,
      cookies,
      board.id,
      'photo.webp',
      'image/webp',
      'fake webp content',
    );

    expect(res.statusCode).toBe(200);
    expect(res.json().board.backgroundType).toBe('image');
  });

  it('accepts GIF images', async () => {
    const { cookies, board } = await setupBoard(app);

    const res = await uploadBackground(
      app,
      cookies,
      board.id,
      'animation.gif',
      'image/gif',
      'fake gif content',
    );

    expect(res.statusCode).toBe(200);
    expect(res.json().board.backgroundType).toBe('image');
  });

  it('uploading a new image replaces the old one', async () => {
    const { cookies, board } = await setupBoard(app);

    // Upload first image
    const res1 = await uploadBackground(app, cookies, board.id, 'first.png', 'image/png', 'first content');
    expect(res1.statusCode).toBe(200);

    // Upload second image
    const res2 = await uploadBackground(app, cookies, board.id, 'second.png', 'image/png', 'second content');
    expect(res2.statusCode).toBe(200);
    expect(res2.json().board.backgroundType).toBe('image');
  });
});

// ── Serve Background Image ──────────────────────────────────────────────────

describe('GET /api/v1/boards/:boardId/background/image', () => {
  it('returns the uploaded background image file', async () => {
    const { cookies, board } = await setupBoard(app);

    // Upload first
    await uploadBackground(app, cookies, board.id, 'bg.png', 'image/png', 'image file content');

    // Serve
    const res = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${board.id}/background/image`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('image file content');
  });

  it('returns correct Content-Type header', async () => {
    const { cookies, board } = await setupBoard(app);

    await uploadBackground(app, cookies, board.id, 'bg.png', 'image/png', 'png data');

    const res = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${board.id}/background/image`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/');
  });

  it('returns 404 when no background image exists', async () => {
    const { cookies, board } = await setupBoard(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${board.id}/background/image`,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 401 for unauthenticated request', async () => {
    const { board } = await setupBoard(app);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/boards/${board.id}/background/image`,
    });

    expect(res.statusCode).toBe(401);
  });

  it('non-board-member cannot access the background image (403)', async () => {
    const owner = await setupBoard(app);
    const outsider = await createTestUser(app);

    await uploadBackground(app, owner.cookies, owner.board.id, 'bg.png', 'image/png', 'data');

    const res = await injectWithAuth(app, outsider.cookies, {
      method: 'GET',
      url: `/api/v1/boards/${owner.board.id}/background/image`,
    });

    expect(res.statusCode).toBe(403);
  });
});

// ── Color Backgrounds ───────────────────────────────────────────────────────

describe('Color backgrounds via PATCH /api/v1/boards/:boardId', () => {
  it('sets backgroundType to color with a hex value', async () => {
    const { cookies, board } = await setupBoard(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'PATCH',
      url: `/api/v1/boards/${board.id}`,
      payload: { backgroundType: 'color', backgroundValue: '#ff5733' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().board.backgroundType).toBe('color');
    expect(res.json().board.backgroundValue).toBe('#ff5733');
  });

  it('can switch from image back to color background', async () => {
    const { cookies, board } = await setupBoard(app);

    // First upload an image
    const uploadRes = await uploadBackground(app, cookies, board.id);
    expect(uploadRes.statusCode).toBe(200);
    expect(uploadRes.json().board.backgroundType).toBe('image');

    // Switch to color
    const res = await injectWithAuth(app, cookies, {
      method: 'PATCH',
      url: `/api/v1/boards/${board.id}`,
      payload: { backgroundType: 'color', backgroundValue: '#0079bf' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().board.backgroundType).toBe('color');
    expect(res.json().board.backgroundValue).toBe('#0079bf');
  });
});
