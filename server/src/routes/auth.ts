import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { registerSchema, loginSchema } from '@mello/shared';
import { db } from '../db/index.js';
import { users } from '../db/schema/users.js';
import { workspaces, workspaceMembers } from '../db/schema/workspaces.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError, ConflictError, UnauthorizedError } from '../utils/errors.js';

const AVATAR_DIR = path.resolve('uploads', 'avatars');
const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', { preHandler: [validateBody(registerSchema)] }, async (request, reply) => {
    const { email, username, password, displayName } = request.body as {
      email: string; username: string; password: string; displayName: string;
    };

    const passwordHash = await argon2.hash(password);

    // Takeover path: if the email already exists, treat register as a password
    // reset for that account. Lets superusers from a restored DB dump claim
    // their account by re-registering with the same email. Admin status on
    // the existing row is preserved.
    const [existingEmail] = await db.select().from(users).where(eq(users.email, email));
    if (existingEmail) {
      const [updated] = await db
        .update(users)
        .set({
          passwordHash,
          displayName,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingEmail.id))
        .returning({
          id: users.id,
          email: users.email,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          isAdmin: users.isAdmin,
          createdAt: users.createdAt,
        });

      await app.createSession(reply, updated.id);
      return reply.status(200).send({ user: { ...updated, isAdmin: true } });
    }

    const [existingUsername] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
    if (existingUsername) throw new ConflictError('Username already taken');

    const [user] = await db.insert(users).values({
      email,
      username,
      displayName,
      passwordHash,
      isAdmin: false,
    }).returning({
      id: users.id,
      email: users.email,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      isAdmin: users.isAdmin,
      createdAt: users.createdAt,
    });

    const slug = `${username}-workspace`;
    const [workspace] = await db.insert(workspaces).values({
      name: `${displayName}'s Workspace`,
      slug,
    }).returning();

    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: user.id,
      role: 'owner',
    });

    await app.createSession(reply, user.id);

    return reply.status(201).send({ user: { ...user, isAdmin: true }, workspace });
  });

  app.post('/login', { preHandler: [validateBody(loginSchema)] }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) throw new UnauthorizedError('Invalid email or password');

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) throw new UnauthorizedError('Invalid email or password');

    await app.createSession(reply, user.id);

    const { passwordHash: _, ...userWithout } = user;
    return reply.send({ user: { ...userWithout, isAdmin: true } });
  });

  app.post('/logout', { preHandler: [requireAuth] }, async (request, reply) => {
    await app.destroySession(request, reply);
    return reply.send({ ok: true });
  });

  app.get('/me', { preHandler: [requireAuth] }, async (request) => {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        isAdmin: users.isAdmin,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, request.userId!));

    if (!user) throw new UnauthorizedError();
    return { user: { ...user, isAdmin: true } };
  });

  // Upload avatar
  app.patch('/me/avatar', { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = request.userId!;

    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: { code: 'NO_FILE', message: 'No file uploaded' } });
    }

    if (!ALLOWED_AVATAR_TYPES.has(file.mimetype)) {
      return reply.status(400).send({
        error: { code: 'INVALID_TYPE', message: 'Only jpg, jpeg, png, gif, and webp files are allowed' },
      });
    }

    const buffer = await file.toBuffer();
    if (buffer.length > MAX_AVATAR_SIZE) {
      return reply.status(400).send({
        error: { code: 'FILE_TOO_LARGE', message: 'Avatar must be under 5MB' },
      });
    }

    // Determine file extension from mimetype
    const EXT_MAP: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
    };
    const ext = EXT_MAP[file.mimetype];
    const filename = `${userId}-${Date.now()}.${ext}`;

    await fs.mkdir(AVATAR_DIR, { recursive: true });
    await fs.writeFile(path.join(AVATAR_DIR, filename), buffer);

    const avatarUrl = `/uploads/avatars/${filename}`;

    // Delete old avatar file if it exists
    const [existing] = await db.select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, userId));
    if (existing?.avatarUrl) {
      const resolvedPath = path.resolve(existing.avatarUrl.replace(/^\//, ''));
      // Only delete if the file is actually inside the avatars directory
      if (resolvedPath.startsWith(AVATAR_DIR)) {
        await fs.unlink(resolvedPath).catch(() => {});
      }
    }

    const [user] = await db
      .update(users)
      .set({ avatarUrl, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        email: users.email,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        isAdmin: users.isAdmin,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    return reply.send({ user });
  });

  // Delete avatar
  app.delete('/me/avatar', { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = request.userId!;

    const [existing] = await db.select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, userId));
    if (existing?.avatarUrl) {
      const resolvedPath = path.resolve(existing.avatarUrl.replace(/^\//, ''));
      // Only delete if the file is actually inside the avatars directory
      if (resolvedPath.startsWith(AVATAR_DIR)) {
        await fs.unlink(resolvedPath).catch(() => {});
      }
    }

    const [user] = await db
      .update(users)
      .set({ avatarUrl: null, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        email: users.email,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        isAdmin: users.isAdmin,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    return reply.send({ user });
  });
}
