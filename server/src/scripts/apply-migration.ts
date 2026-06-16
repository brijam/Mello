import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import postgres from 'postgres';
import { config } from '../config.js';

// Standalone migration applier.
//
// `drizzle-kit migrate` is unreliable here: its journal (db/migrations/meta/
// _journal.json) is out of sync with the actual SQL files (e.g. 0001 is
// missing, idx numbering has gaps), so it refuses to apply or mis-tracks
// state. This script ignores that journal entirely and tracks what it has
// applied in its own `_manual_migrations` table.
//
// Usage:
//   tsx src/scripts/apply-migration.ts <tag> [<tag> ...]
//
// Example (the per-user colors fix):
//   DATABASE_URL=postgres://... tsx src/scripts/apply-migration.ts 0006_per_user_colors
//
// Each named migration is applied once, inside a transaction, and recorded.
// Re-running with the same tag is a no-op, so it is safe to leave in a deploy
// step. Tags must be named explicitly — the script never re-runs everything,
// which would clobber an already-migrated database.

const tags = process.argv.slice(2).map((t) => t.replace(/\.sql$/, ''));
if (tags.length === 0) {
  console.error('Usage: tsx src/scripts/apply-migration.ts <tag> [<tag> ...]');
  console.error('Example: tsx src/scripts/apply-migration.ts 0006_per_user_colors');
  process.exit(1);
}

const migrationsDir = path.resolve(fileURLToPath(import.meta.url), '../../db/migrations');

// A dedicated connection (not src/db/index.ts) so this runs without importing
// the full schema/app, and against whatever DATABASE_URL the deploy provides.
const sql = postgres(config.DATABASE_URL, { max: 1, onnotice: () => {} });

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS "_manual_migrations" (
      "tag" text PRIMARY KEY,
      "applied_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `;

  for (const tag of tags) {
    const [already] = await sql`SELECT 1 FROM "_manual_migrations" WHERE "tag" = ${tag}`;
    if (already) {
      console.log(`= ${tag} already applied, skipping`);
      continue;
    }

    const file = path.join(migrationsDir, `${tag}.sql`);
    let raw: string;
    try {
      raw = await readFile(file, 'utf-8');
    } catch {
      console.error(`! migration file not found: ${file}`);
      process.exitCode = 1;
      return;
    }

    // drizzle separates statements with a "--> statement-breakpoint" marker.
    const statements = raw
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    await sql.begin(async (tx) => {
      for (const statement of statements) {
        await tx.unsafe(statement);
      }
      await tx`INSERT INTO "_manual_migrations" ("tag") VALUES (${tag})`;
    });

    console.log(`+ applied ${tag} (${statements.length} statement(s))`);
  }
}

main()
  .then(() => sql.end())
  .then(() => process.exit(process.exitCode ?? 0))
  .catch(async (err) => {
    console.error('Migration failed:', err instanceof Error ? err.message : err);
    await sql.end();
    process.exit(1);
  });
