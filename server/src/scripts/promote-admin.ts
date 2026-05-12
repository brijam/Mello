import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema/users.js';

const email = process.argv[2];
if (!email) {
  console.error('Usage: tsx server/src/scripts/promote-admin.ts <email>');
  process.exit(1);
}

const result = await db
  .update(users)
  .set({ isAdmin: true, updatedAt: new Date() })
  .where(eq(users.email, email))
  .returning({ id: users.id, email: users.email, isAdmin: users.isAdmin });

if (result.length === 0) {
  console.error(`No user found with email ${email}`);
  process.exit(1);
}

console.log(`Promoted ${result[0].email} to admin (id: ${result[0].id})`);
process.exit(0);
