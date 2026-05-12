import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { db } from '../db/index.js';
import { users } from '../db/schema/users.js';

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('Usage: tsx server/src/scripts/set-password.ts <email> <new-password>');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const passwordHash = await argon2.hash(password);

const result = await db
  .update(users)
  .set({ passwordHash, updatedAt: new Date() })
  .where(eq(users.email, email))
  .returning({ id: users.id, email: users.email, isAdmin: users.isAdmin });

if (result.length === 0) {
  console.error(`No user found with email ${email}`);
  process.exit(1);
}

console.log(`Password updated for ${result[0].email} (admin: ${result[0].isAdmin})`);
process.exit(0);
