import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import postgres from 'postgres';
import { config } from '../config.js';

// Standalone migration applier.
//
// `drizzle-kit migrate` is unreliable here: its journal (db/migrations/meta/
// _journal.json) is out of sync with the actual SQL files (e.g. 0001 is
// missing, idx numbering has gaps), so it silently skips or mis-tracks
// migrations — which is how prod ended up missing 0006. This script ignores
// that journal entirely and tracks what it has applied in its own
// `_manual_migrations` table.
//
// Usage:
//   tsx src/scripts/apply-migration.ts <tag> [<tag> ...]   apply named migrations
//   tsx src/scripts/apply-migration.ts --all               apply every pending migration
//
// Example:
//   DATABASE_URL=postgres://... tsx src/scripts/apply-migration.ts --all
//
// `--all` is safe to run against ANY database — fresh or already-populated —
// with no baseline step. Each statement runs inside a savepoint; if it fails
// only because the object already exists, that statement is skipped and the
// migration is recorded as applied (auto-baseline). Missing objects are still
// created. Any OTHER error aborts the whole run, so genuine migration failures
// are never swallowed. Already-recorded migrations are skipped outright, so
// re-running is a no-op — fine to leave in the deploy step.

const argv = process.argv.slice(2);
const applyAll = argv.includes('--all');
const explicitTags = argv.filter((a) => !a.startsWith('--')).map((t) => t.replace(/\.sql$/, ''));

if (!applyAll && explicitTags.length === 0) {
  console.error('Usage: tsx src/scripts/apply-migration.ts <tag> [...] | --all');
  process.exit(1);
}

const migrationsDir = path.resolve(fileURLToPath(import.meta.url), '../../db/migrations');

// SQLSTATE codes meaning "this object already exists" — the only failures we
// treat as already-applied rather than fatal. Everything else aborts.
const ALREADY_EXISTS = new Set([
  '42P07', // duplicate_table (also index / view / sequence — any relation)
  '42710', // duplicate_object (constraint, trigger, enum value, ...)
  '42701', // duplicate_column
  '42P06', // duplicate_schema
  '42723', // duplicate_function
  '42P04', // duplicate_database
]);

function alreadyExists(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    ALREADY_EXISTS.has(String((err as { code: unknown }).code))
  );
}

/** All migration tags in lexical (= numeric, they are zero-padded) order. */
async function allTags(): Promise<string[]> {
  const files = await readdir(migrationsDir);
  return files
    .filter((f) => f.endsWith('.sql'))
    .map((f) => f.replace(/\.sql$/, ''))
    .sort();
}

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

  const tags = applyAll ? await allTags() : explicitTags;

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

    let created = 0;
    let present = 0;

    // One transaction per migration. Each statement gets its own savepoint so
    // an "already exists" failure can be rolled back individually and the rest
    // of the migration still runs (handles fully- or partially-applied DBs).
    await sql.begin(async (tx) => {
      for (const statement of statements) {
        try {
          await tx.savepoint((sp) => sp.unsafe(statement));
          created++;
        } catch (err) {
          if (alreadyExists(err)) {
            present++;
          } else {
            throw err; // real failure — roll the whole migration back and abort
          }
        }
      }
      await tx.unsafe('INSERT INTO "_manual_migrations" ("tag") VALUES ($1)', [tag]);
    });

    if (created > 0 && present === 0) {
      console.log(`+ applied ${tag} (${created} statement(s))`);
    } else if (created === 0) {
      console.log(`~ ${tag} already present (${present} statement(s)); recorded as baseline`);
    } else {
      console.log(`+ reconciled ${tag} (${created} new, ${present} already present)`);
    }
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
