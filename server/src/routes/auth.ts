import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { registerSchema, loginSchema } from '@mello/shared';
import { db } from '../db/index.js';
import { users } from '../db/schema/users.js';
import { workspaces, workspaceMembers } from '../db/schema/workspaces.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError, ConflictError, UnauthorizedError } from '../utils/errors.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', { preHandler: [validateBody(registerSchema)] }, async (request, reply) => {
    const { email, username, password, displayName } = request.body as {
      email: string; username: string; password: string; displayName: string;
    };

    // Check if email or username already exists
    const [existingEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (existingEmail) throw new ConflictError('Email already in use');

    const [existingUsername] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
    if (existingUsername) throw new ConflictError('Username already taken');

    // Check if this is the first user (becomes admin)
    const [anyUser] = await db.select({ id: users.id }).from(users).limit(1);
    const isFirstUser = !anyUser;

    const passwordHash = await argon2.hash(password);

    const [user] = await db.insert(users).values({
      email,
      username,
      displayName,
      passwordHash,
      isAdmin: isFirstUser,
    }).returning({
      id: users.id,
      email: users.email,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      isAdmin: users.isAdmin,
      createdAt: users.createdAt,
    });

    // Create a default personal workspace
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

    return reply.status(201).send({ user, workspace });
  });

  app.post('/login', { preHandler: [validateBody(loginSchema)] }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) throw new UnauthorizedError('Invalid email or password');

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) throw new UnauthorizedError('Invalid email or password');

    await app.createSession(reply, user.id);

    const { passwordHash: _, ...userWithout } = user;
    return reply.send({ user: userWithout });
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
    return { user };
  });
}
