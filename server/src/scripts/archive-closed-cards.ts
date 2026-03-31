/**
 * Post-import script: Moves Trello-archived cards into dedicated archive lists.
 *
 * For each archived card in Trello, finds the matching Mello card (by board name,
 * list position, card name + position) and moves it to a list named
 * "{original list name} Archived Cards".
 *
 * Also handles archived lists: all cards in a closed Trello list are moved to
 * "{list name} Archived Cards".
 *
 * Run with: npx tsx src/scripts/archive-closed-cards.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/index.js';
import { boards } from '../db/schema/boards.js';
import { lists } from '../db/schema/lists.js';
import { cards } from '../db/schema/cards.js';
import { eq, and, asc } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Constants (must match trello-import.ts)
// ---------------------------------------------------------------------------

const TRELLO_BASE = 'https://api.trello.com/1';
const REQUEST_DELAY_MS = 125;

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
// Read credentials
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
// Trello API helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function trelloFetch<T>(endpoint: string): Promise<T> {
  await sleep(REQUEST_DELAY_MS);
  const url = `${TRELLO_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Trello API ${res.status}: ${endpoint}`);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface TrelloBoard { id: string; name: string }
interface TrelloList { id: string; name: string; pos: number; closed: boolean }
interface TrelloCard { id: string; name: string; pos: number; idList: string; closed: boolean }

async function main() {
  console.time('Archive script');
  console.log('=== Move Archived Cards to Archive Lists ===\n');

  let totalMoved = 0;
  let totalArchiveLists = 0;

  for (let i = 0; i < BOARD_IDS.length; i++) {
    const trelloBoardId = BOARD_IDS[i];
    const num = `${i + 1}/${BOARD_IDS.length}`;

    // Fetch Trello data
    console.log(`\n--- Board ${num}: Fetching Trello data...`);
    const [trelloBoard, trelloLists, trelloCards] = await Promise.all([
      trelloFetch<TrelloBoard>(`/boards/${trelloBoardId}?fields=name`),
      trelloFetch<TrelloList[]>(`/boards/${trelloBoardId}/lists?fields=all&filter=all`),
      trelloFetch<TrelloCard[]>(`/boards/${trelloBoardId}/cards?fields=name,pos,idList,closed&filter=all`),
    ]);

    // Find matching Mello board by name
    const [melloBoard] = await db
      .select({ id: boards.id, name: boards.name })
      .from(boards)
      .where(eq(boards.name, trelloBoard.name))
      .limit(1);

    if (!melloBoard) {
      console.log(`  Board "${trelloBoard.name}" not found in Mello — skipping`);
      continue;
    }

    // Get Mello lists for this board
    const melloLists = await db
      .select({ id: lists.id, name: lists.name, position: lists.position })
      .from(lists)
      .where(eq(lists.boardId, melloBoard.id))
      .orderBy(asc(lists.position));

    // Build Trello list ID -> Mello list mapping (by matching position)
    const trelloListToMello = new Map<string, { id: string; name: string }>();
    for (const tl of trelloLists) {
      const match = melloLists.find((ml) => ml.position === tl.pos);
      if (match) {
        trelloListToMello.set(tl.id, { id: match.id, name: match.name });
      }
    }

    // Identify which Trello list IDs are closed (archived lists)
    const closedListIds = new Set(trelloLists.filter((l) => l.closed).map((l) => l.id));

    // Find cards that need archiving:
    // 1. Cards that are individually archived (closed: true)
    // 2. Cards in archived lists (list.closed: true)
    const cardsToArchive: TrelloCard[] = trelloCards.filter(
      (tc) => tc.closed || closedListIds.has(tc.idList),
    );

    if (cardsToArchive.length === 0) {
      console.log(`  Board ${num}: "${trelloBoard.name}" — no archived cards`);
      continue;
    }

    console.log(`  Board ${num}: "${trelloBoard.name}" — ${cardsToArchive.length} archived cards to move`);

    // Group archived cards by their original Mello list
    const byList = new Map<string, { listName: string; trelloCards: TrelloCard[] }>();
    for (const tc of cardsToArchive) {
      const melloList = trelloListToMello.get(tc.idList);
      if (!melloList) continue;

      let entry = byList.get(melloList.id);
      if (!entry) {
        entry = { listName: melloList.name, trelloCards: [] };
        byList.set(melloList.id, entry);
      }
      entry.trelloCards.push(tc);
    }

    // For each original list, create an archive list and move cards
    // Find max list position for appending new lists
    const maxListPos = melloLists.length > 0
      ? melloLists[melloLists.length - 1].position
      : 0;
    let nextArchivePos = maxListPos + 65536;

    for (const [originalListId, { listName, trelloCards: archivedCards }] of byList) {
      const archiveListName = `${listName} Archived Cards`;

      // Check if the archive list already exists
      let archiveList = melloLists.find((ml) => ml.name === archiveListName);

      if (!archiveList) {
        // Create the archive list
        const [created] = await db.insert(lists).values({
          boardId: melloBoard.id,
          name: archiveListName,
          position: nextArchivePos,
        }).returning();
        archiveList = { id: created.id, name: archiveListName, position: nextArchivePos };
        nextArchivePos += 65536;
        totalArchiveLists++;
      }

      // Find matching Mello cards and move them
      let movedInList = 0;
      for (const tc of archivedCards) {
        // Match by name + position in the original list
        const [melloCard] = await db
          .select({ id: cards.id })
          .from(cards)
          .where(
            and(
              eq(cards.boardId, melloBoard.id),
              eq(cards.listId, originalListId),
              eq(cards.name, tc.name || '(untitled)'),
              eq(cards.position, tc.pos),
            ),
          )
          .limit(1);

        if (melloCard) {
          await db
            .update(cards)
            .set({ listId: archiveList.id })
            .where(eq(cards.id, melloCard.id));
          movedInList++;
        }
      }

      if (movedInList > 0) {
        console.log(`    "${listName}" → "${archiveListName}": ${movedInList} cards moved`);
        totalMoved += movedInList;
      }
    }
  }

  console.log(`\n========================================`);
  console.log(`Archive lists created: ${totalArchiveLists}`);
  console.log(`Cards moved:           ${totalMoved}`);
  console.log(`========================================`);
  console.timeEnd('Archive script');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
