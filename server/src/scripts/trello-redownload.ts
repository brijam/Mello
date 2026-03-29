/**
 * Trello Redownload Script
 *
 * Backfills attachment URLs from the Trello API and downloads files.
 * The original import created ~89K attachment DB records but the `url` column
 * was added after the import, so all records have url = NULL.
 *
 * Run with: npx tsx src/scripts/trello-redownload.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { db } from '../db/index.js';
import { attachments } from '../db/schema/attachments.js';
import { cards } from '../db/schema/cards.js';
import { eq, isNull, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRELLO_BASE = 'https://api.trello.com/1';
const REQUEST_DELAY_MS = 125;
const MAX_RETRIES = 3;
const PROGRESS_INTERVAL = 500;

const BOARD_IDS = [
  '6071e25c837e5c7dd208f1bc',
  '606ca6cb9a3f7f79e7d6a910',
  '5eaf5ba87966973d9618d76a',
  '60b55d3b6d062788995ff7fc',
  '622edca7815eb50f0116e20f',
  '606ca6926bbe1a01e21552bc',
  '63326ac1dc60bf01a576e05f',
  '621bf84fe7a0ee02cbf763e0',
  '56cb56ba47fe9062d4ec7d15',
  '56cb85bb5447b221504dc227',
  '56cb56cdbed63e65d7983b64',
];

// ---------------------------------------------------------------------------
// Read credentials from secret.env (same pattern as trello-import.ts)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const secretPath = path.resolve(__dirname, '..', '..', '..', 'secret.env');
const secretContents = fs.readFileSync(secretPath, 'utf-8');
const envVars: Record<string, string> = {};
for (const line of secretContents.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx === -1) continue;
  envVars[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
}

const TRELLO_KEY = envVars['TRELLO_API_KEY'];
const TRELLO_TOKEN = envVars['TRELLO_TOKEN'];
if (!TRELLO_KEY || !TRELLO_TOKEN) {
  console.error('Missing TRELLO_API_KEY or TRELLO_TOKEN in secret.env');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function authParams(): string {
  return `key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
}

function trelloApiUrl(endpoint: string, extraParams = ''): string {
  const sep = endpoint.includes('?') ? '&' : '?';
  const extra = extraParams ? `&${extraParams}` : '';
  return `${TRELLO_BASE}${endpoint}${sep}${authParams()}${extra}`;
}

async function trelloFetch<T = unknown>(endpoint: string, extraParams = ''): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    await sleep(REQUEST_DELAY_MS);
    try {
      const url = trelloApiUrl(endpoint, extraParams);
      const res = await fetch(url);
      if (res.status === 429) {
        const wait = attempt * 2000;
        console.warn(`  Rate limited on ${endpoint}, waiting ${wait}ms...`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Trello API ${res.status}: ${endpoint} — ${body.slice(0, 200)}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastError = err as Error;
      if (attempt < MAX_RETRIES) {
        const wait = attempt * 1000 * attempt;
        console.warn(
          `  Retry ${attempt}/${MAX_RETRIES} for ${endpoint}: ${(err as Error).message.slice(0, 120)} — waiting ${wait}ms`,
        );
        await sleep(wait);
      }
    }
  }
  throw lastError!;
}

// ---------------------------------------------------------------------------
// Trello types (minimal)
// ---------------------------------------------------------------------------

interface TrelloAttachment {
  id: string;
  name: string;
  url: string;
  mimeType: string | null;
  bytes: number | null;
}

interface TrelloCard {
  name: string;
  attachments: TrelloAttachment[];
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

const totals = {
  totalRecords: 0,
  urlsBackfilled: 0,
  urlsNotFound: 0,
  filesDownloaded: 0,
  filesSkippedExist: 0,
  filesSkippedExternal: 0,
  filesSkippedNoUrl: 0,
  downloadFailures: 0,
};

// ---------------------------------------------------------------------------
// Phase 1: Fetch Trello attachment data and build mapping
// ---------------------------------------------------------------------------

async function buildTrelloMap(): Promise<Map<string, string>> {
  console.log('\n=== Phase 1: Fetching attachment data from Trello API ===\n');

  // Map key: `${cardName}|||${attachmentFilename}` -> Trello URL
  const urlMap = new Map<string, string>();
  let totalAttachments = 0;

  for (let i = 0; i < BOARD_IDS.length; i++) {
    const boardId = BOARD_IDS[i];
    console.log(`  Board ${i + 1}/${BOARD_IDS.length}: ${boardId}`);

    try {
      const trelloCards = await trelloFetch<TrelloCard[]>(
        `/boards/${boardId}/cards?fields=name&attachments=true&attachment_fields=id,name,url,mimeType,bytes&filter=all`,
      );

      let boardAttachments = 0;
      for (const card of trelloCards) {
        if (!card.attachments || card.attachments.length === 0) continue;
        for (const att of card.attachments) {
          if (att.url) {
            const key = `${card.name}|||${att.name}`;
            urlMap.set(key, att.url);
            boardAttachments++;
          }
        }
      }
      totalAttachments += boardAttachments;
      console.log(`    ${trelloCards.length} cards, ${boardAttachments} attachments with URLs`);
    } catch (err) {
      console.error(`    FAILED: ${(err as Error).message.slice(0, 150)}`);
    }
  }

  console.log(`\n  Total Trello attachments mapped: ${totalAttachments}`);
  return urlMap;
}

// ---------------------------------------------------------------------------
// Phase 2: Backfill URLs in the database
// ---------------------------------------------------------------------------

async function backfillUrls(urlMap: Map<string, string>): Promise<void> {
  console.log('\n=== Phase 2: Backfilling URLs in database ===\n');

  // Query all attachments with NULL url, joined with card names
  const rows = await db
    .select({
      id: attachments.id,
      filename: attachments.filename,
      storagePath: attachments.storagePath,
      cardName: cards.name,
    })
    .from(attachments)
    .innerJoin(cards, eq(cards.id, attachments.cardId))
    .where(isNull(attachments.url));

  totals.totalRecords = rows.length;
  console.log(`  Found ${rows.length} attachments with NULL url`);

  let updated = 0;
  let notFound = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const key = `${row.cardName}|||${row.filename}`;
    const url = urlMap.get(key);

    if (url) {
      await db
        .update(attachments)
        .set({ url })
        .where(eq(attachments.id, row.id));
      updated++;
    } else {
      notFound++;
    }

    if ((i + 1) % PROGRESS_INTERVAL === 0) {
      console.log(
        `  Backfill progress: ${i + 1}/${rows.length} processed (${updated} updated, ${notFound} not found)`,
      );
    }
  }

  totals.urlsBackfilled = updated;
  totals.urlsNotFound = notFound;
  console.log(`\n  Backfill complete: ${updated} URLs set, ${notFound} not matched`);
}

// ---------------------------------------------------------------------------
// Phase 3: Download missing files
// ---------------------------------------------------------------------------

async function downloadFiles(): Promise<void> {
  console.log('\n=== Phase 3: Downloading missing files ===\n');

  // Query all attachments that now have a URL
  const rows = await db
    .select({
      id: attachments.id,
      filename: attachments.filename,
      storagePath: attachments.storagePath,
      url: attachments.url,
    })
    .from(attachments)
    .where(sql`${attachments.url} IS NOT NULL`);

  console.log(`  Found ${rows.length} attachments with URLs`);

  let processed = 0;

  for (const row of rows) {
    processed++;

    if (processed % PROGRESS_INTERVAL === 0) {
      console.log(
        `  Download progress: ${processed}/${rows.length} ` +
          `(downloaded: ${totals.filesDownloaded}, skipped-exist: ${totals.filesSkippedExist}, ` +
          `skipped-external: ${totals.filesSkippedExternal}, failures: ${totals.downloadFailures})`,
      );
    }

    if (!row.url) {
      totals.filesSkippedNoUrl++;
      continue;
    }

    // Only download Trello-hosted URLs
    const isTrello =
      row.url.includes('trello.com') ||
      row.url.includes('trello-attachments') ||
      row.url.includes('trello-backgrounds') ||
      row.url.includes('trello.');

    if (!isTrello) {
      totals.filesSkippedExternal++;
      continue;
    }

    // Skip files that already exist on disk
    if (fs.existsSync(row.storagePath)) {
      totals.filesSkippedExist++;
      continue;
    }

    // Download the file
    try {
      await downloadFile(row.url, row.storagePath);
      totals.filesDownloaded++;
    } catch (err) {
      totals.downloadFailures++;
      if (totals.downloadFailures <= 20) {
        console.warn(`  Download failed: ${row.filename} — ${(err as Error).message.slice(0, 100)}`);
      } else if (totals.downloadFailures === 21) {
        console.warn(`  (suppressing further download error messages)`);
      }
    }
  }
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const headers: Record<string, string> = {
    Authorization: `OAuth oauth_consumer_key="${TRELLO_KEY}", oauth_token="${TRELLO_TOKEN}"`,
  };

  await sleep(REQUEST_DELAY_MS);

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        // Don't retry permanent failures
        if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 410) {
          throw new Error(`HTTP ${res.status}`);
        }
        throw new Error(`HTTP ${res.status} (retryable)`);
      }
      if (!res.body) {
        throw new Error('No response body');
      }

      // Ensure parent dir exists
      const dir = path.dirname(destPath);
      fs.mkdirSync(dir, { recursive: true });

      // Stream to file
      const fileStream = fs.createWriteStream(destPath);
      const readable = Readable.fromWeb(res.body as any);
      await pipeline(readable, fileStream);
      return;
    } catch (err) {
      lastError = err as Error;
      // Don't retry permanent HTTP errors
      if (
        lastError.message.includes('HTTP 401') ||
        lastError.message.includes('HTTP 403') ||
        lastError.message.includes('HTTP 404') ||
        lastError.message.includes('HTTP 410')
      ) {
        if (!lastError.message.includes('retryable')) break;
      }
      if (attempt < MAX_RETRIES) {
        await sleep(attempt * 1000);
      }
    }
  }
  throw lastError!;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.time('Total time');
  console.log('=== Trello Redownload: Backfill URLs & Download Files ===');

  // Phase 1: Build URL mapping from Trello API
  const urlMap = await buildTrelloMap();

  // Phase 2: Backfill URLs in database
  await backfillUrls(urlMap);

  // Phase 3: Download missing files
  await downloadFiles();

  // Final summary
  console.log('\n========================================');
  console.log('       REDOWNLOAD SUMMARY');
  console.log('========================================');
  console.log(`  Total NULL-url records:  ${totals.totalRecords}`);
  console.log(`  URLs backfilled:         ${totals.urlsBackfilled}`);
  console.log(`  URLs not matched:        ${totals.urlsNotFound}`);
  console.log(`  Files downloaded:        ${totals.filesDownloaded}`);
  console.log(`  Files already existed:   ${totals.filesSkippedExist}`);
  console.log(`  Skipped (external URL):  ${totals.filesSkippedExternal}`);
  console.log(`  Skipped (no URL):        ${totals.filesSkippedNoUrl}`);
  console.log(`  Download failures:       ${totals.downloadFailures}`);
  console.log('========================================');
  console.timeEnd('Total time');

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
