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
//   tsx src/scripts/apply-migration.ts --baseline <tag>    mark <= <tag> as applied without running
//
// Examples:
//   # the per-user colors hotfix
//   DATABASE_URL=postgres://... tsx src/scripts/apply-migration.ts 0006_per_user_colors
//   # one-time seed of an existing DB whose schema is already at 0005
//   DATABASE_URL=postgres://... tsx src/scripts/apply-migration.ts --baseline 0005_list_color_and_board_accent
//
// Each migration is applied once, inside a transaction, and recorded. Re-runs
// are no-ops, so `--all` is safe to leave in the deploy step. The older
// migrations are NOT all idempotent (0000 is a bare CREATE TABLE), so on an
// existing database you MUST `--baseline` to the current schema point before
// the first `--all`, or the runner will try to re-create tables that exist.

const argv = process.argv.slice(2);
const applyAll = argv.includes('--all');
const baselineIdx = argv.indexOf('--baseline');
const baselineTag =
  baselineIdx !== -1 ? argv[baselineIdx + 1]?.replace(/\.sql$/, '') : undefined;
const explicitTags = argv
  .filter((a, i) => !a.startsWith('--') && i !== baselineIdx + 1)
  .map((t) => t.replace(/\.sql$/, ''));

if (baselineIdx !== -1 && !baselineTag) {
  console.error('--baseline requires a tag, e.g. --baseline 0005_list_color_and_board_accent');
  process.exit(1);
}
if (!applyAll && baselineIdx === -1 && explicitTags.length === 0) {
  console.error('Usage: tsx src/scripts/apply-migration.ts <tag> [...] | --all | --baseline <tag>');
  process.exit(1);
}

const migrationsDir = path.resolve(fileURLToPath(import.meta.url), '../../db/migrations');

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

  // Baseline mode: record everything up to and including <tag> as applied,
  // WITHOUT executing it (the schema is assumed to already be at that point).
  if (baselineTag) {
    const tags = (await allTags()).filter((t) => t <= baselineTag);
    if (!tags.includes(baselineTag)) {
      console.error(`! no migration file matches baseline tag: ${baselineTag}`);
      process.exit(1);
    }
    const rows = tags.map((tag) => ({ tag }));
    await sql`INSERT INTO "_manual_migrations" ${sql(rows, 'tag')} ON CONFLICT DO NOTHING`;
    console.log(`= baselined ${tags.length} migration(s) up to ${baselineTag} (not executed)`);
    return;
  }

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

    await sql.begin(async (tx) => {
      for (const statement of statements) {
        await tx.unsafe(statement);
      }
      await tx.unsafe('INSERT INTO "_manual_migrations" ("tag") VALUES ($1)', [tag]);
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
