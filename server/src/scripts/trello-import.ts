/**
 * Trello-to-Mello Import Script
 *
 * Imports 11 Trello boards (28K cards, 89K attachments) into Mello.
 * Run with: npx tsx src/scripts/trello-import.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import * as argon2 from 'argon2';
import { db } from '../db/index.js';
import { users } from '../db/schema/users.js';
import { workspaces, workspaceMembers } from '../db/schema/workspaces.js';
import { boards, boardMembers } from '../db/schema/boards.js';
import { lists } from '../db/schema/lists.js';
import { cards } from '../db/schema/cards.js';
import { labels, cardLabels } from '../db/schema/labels.js';
import { cardAssignments } from '../db/schema/card-assignments.js';
import { checklists, checklistItems } from '../db/schema/checklists.js';
import { comments } from '../db/schema/comments.js';
import { attachments } from '../db/schema/attachments.js';
import { eq } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRELLO_BASE = 'https://api.trello.com/1';
const ATTACHMENT_ROOT = 'D:\\MelloAttachments';
const REQUEST_DELAY_MS = 125; // ~8 req/sec
const MAX_RETRIES = 3;
const BATCH_SIZE = 200;

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

function authParams(): string {
  return `key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
}

function trelloUrl(endpoint: string, extraParams = ''): string {
  const sep = endpoint.includes('?') ? '&' : '?';
  const extra = extraParams ? `&${extraParams}` : '';
  return `${TRELLO_BASE}${endpoint}${sep}${authParams()}${extra}`;
}

async function trelloFetch<T = unknown>(endpoint: string, extraParams = ''): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    await sleep(REQUEST_DELAY_MS);
    try {
      const url = trelloUrl(endpoint, extraParams);
      const res = await fetch(url);
      if (res.status === 429) {
        // Rate limited — back off
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
        const wait = attempt * 1000 * attempt; // exponential: 1s, 4s, 9s
        console.warn(`  Retry ${attempt}/${MAX_RETRIES} for ${endpoint}: ${(err as Error).message.slice(0, 120)} — waiting ${wait}ms`);
        await sleep(wait);
      }
    }
  }
  throw lastError!;
}

/**
 * Paginate through ALL comments for a board.
 * Trello returns max 1000 per request; paginate with `before` param.
 */
async function fetchAllComments(boardId: string): Promise<TrelloAction[]> {
  const all: TrelloAction[] = [];
  let before: string | undefined;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const params = before ? `before=${before}` : '';
    const batch = await trelloFetch<TrelloAction[]>(
      `/boards/${boardId}/actions?filter=commentCard&limit=1000`,
      params,
    );
    if (!batch || batch.length === 0) break;
    all.push(...batch);
    before = batch[batch.length - 1].date;
    if (batch.length < 1000) break; // last page
  }
  return all;
}

// ---------------------------------------------------------------------------
// Trello types (minimal)
// ---------------------------------------------------------------------------

interface TrelloBoard {
  id: string;
  name: string;
  desc: string;
  prefs: { background: string; backgroundColor?: string; [k: string]: unknown };
  [k: string]: unknown;
}

interface TrelloList {
  id: string;
  name: string;
  pos: number;
  closed: boolean;
}

interface TrelloLabel {
  id: string;
  name: string;
  color: string | null;
}

interface TrelloMember {
  id: string;
  username: string;
  fullName: string;
  [k: string]: unknown;
}

interface TrelloAttachment {
  id: string;
  name: string;
  url: string;
  bytes: number | null;
  mimeType: string | null;
  [k: string]: unknown;
}

interface TrelloChecklistItem {
  id: string;
  name: string;
  pos: number;
  state: 'complete' | 'incomplete';
}

interface TrelloChecklist {
  id: string;
  name: string;
  pos: number;
  checkItems: TrelloChecklistItem[];
}

interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  pos: number;
  idList: string;
  idLabels: string[];
  idMembers: string[];
  attachments: TrelloAttachment[];
  checklists: TrelloChecklist[];
  closed: boolean;
  [k: string]: unknown;
}

interface TrelloAction {
  id: string;
  type: string;
  date: string;
  idMemberCreator: string;
  data: {
    text: string;
    card: { id: string; name: string };
    [k: string]: unknown;
  };
}

// ---------------------------------------------------------------------------
// Batch insert helper
// ---------------------------------------------------------------------------

async function batchInsert<T extends Record<string, unknown>>(
  table: Parameters<typeof db.insert>[0],
  rows: T[],
  chunkSize = BATCH_SIZE,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await (db.insert(table) as any).values(chunk);
  }
}

async function batchInsertReturning<T extends Record<string, unknown>>(
  table: Parameters<typeof db.insert>[0],
  rows: T[],
  chunkSize = BATCH_SIZE,
): Promise<any[]> {
  const results: any[] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const inserted = await (db.insert(table) as any).values(chunk).returning();
    results.push(...inserted);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Sanitize board/file names for filesystem paths
// ---------------------------------------------------------------------------

function sanitizeForFs(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

// ---------------------------------------------------------------------------
// Map Trello background to color hex
// ---------------------------------------------------------------------------

const TRELLO_BG_COLORS: Record<string, string> = {
  blue: '#0079bf',
  orange: '#d29034',
  green: '#519839',
  red: '#b04632',
  purple: '#89609e',
  pink: '#cd5a91',
  lime: '#4bbf6b',
  sky: '#00aecc',
  grey: '#838c91',
  default: '#0079bf',
};

function mapBackground(prefs: TrelloBoard['prefs']): string {
  if (prefs.backgroundColor) return prefs.backgroundColor;
  const bg = prefs.background;
  if (bg && TRELLO_BG_COLORS[bg]) return TRELLO_BG_COLORS[bg];
  // If it looks like a hex color, use it directly
  if (bg && /^#[0-9a-fA-F]{3,8}$/.test(bg)) return bg;
  return '#0079bf';
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

const totals = {
  boards: 0,
  lists: 0,
  cards: 0,
  labels: 0,
  checklists: 0,
  checklistItems: 0,
  comments: 0,
  attachments: 0,
  attachmentDownloads: 0,
  attachmentSkips: 0,
  attachmentErrors: 0,
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.time('Total import time');
  console.log('=== Trello-to-Mello Import ===\n');

  // 1. Find or create main user
  const existingUsers = await db.select().from(users).limit(1);
  let mainUser: { id: string };
  if (existingUsers.length > 0) {
    mainUser = existingUsers[0];
    console.log(`Using existing user: ${existingUsers[0].displayName} (${existingUsers[0].id})`);
  } else {
    const hash = await argon2.hash('placeholder-no-login');
    const [created] = await db.insert(users).values({
      email: 'brian@import.local',
      username: 'brian',
      displayName: 'Brian Jamison',
      passwordHash: hash,
    }).returning();
    mainUser = created;
    console.log(`Created main user: Brian Jamison (${mainUser.id})`);
  }

  // 2. Create or reuse workspace
  const [existingWorkspace] = await db.select().from(workspaces).where(eq(workspaces.slug, 'trello-import')).limit(1);
  let workspace: { id: string; name: string };
  if (existingWorkspace) {
    workspace = existingWorkspace;
    console.log(`Reusing workspace: ${workspace.name} (${workspace.id})`);
  } else {
    const [created] = await db.insert(workspaces).values({
      name: 'Trello Import',
      slug: 'trello-import',
      description: 'Imported from Trello',
    }).returning();
    workspace = created;
    console.log(`Created workspace: ${workspace.name} (${workspace.id})`);
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: mainUser.id,
      role: 'owner',
    });
  }

  // 3. Collect all Trello members across all boards
  console.log('\nFetching members across all boards...');
  const trelloMemberMap = new Map<string, TrelloMember>(); // trelloId -> member
  for (const boardId of BOARD_IDS) {
    try {
      const members = await trelloFetch<TrelloMember[]>(`/boards/${boardId}/members?fields=all`);
      for (const m of members) {
        if (!trelloMemberMap.has(m.id)) {
          trelloMemberMap.set(m.id, m);
        }
      }
    } catch (err) {
      console.warn(`  Warning: could not fetch members for board ${boardId}: ${(err as Error).message.slice(0, 120)}`);
    }
  }
  console.log(`  Found ${trelloMemberMap.size} unique Trello members`);

  // 4. Create Mello users for each Trello member
  const memberIdMap = new Map<string, string>(); // trelloMemberId -> melloUserId
  const placeholderHash = await argon2.hash('placeholder-no-login');

  for (const [trelloId, member] of trelloMemberMap) {
    // Check if this is the main user
    if (member.username === 'brianjamison1' || member.fullName === 'Brian Jamison') {
      memberIdMap.set(trelloId, mainUser.id);
      continue;
    }

    // Check if user already exists (by username)
    const existing = await db.select().from(users).where(eq(users.username, member.username)).limit(1);
    if (existing.length > 0) {
      memberIdMap.set(trelloId, existing[0].id);
      continue;
    }

    try {
      const [newUser] = await db.insert(users).values({
        email: `${member.username}@trello-import.local`,
        username: member.username,
        displayName: member.fullName || member.username,
        passwordHash: placeholderHash,
      }).returning();
      memberIdMap.set(trelloId, newUser.id);
    } catch (err) {
      console.warn(`  Warning: could not create user for ${member.username}: ${(err as Error).message.slice(0, 120)}`);
      // Fallback to main user
      memberIdMap.set(trelloId, mainUser.id);
    }
  }
  console.log(`  Mapped ${memberIdMap.size} members to Mello users`);

  // Also add workspace membership for all created users
  for (const melloUserId of new Set(memberIdMap.values())) {
    if (melloUserId === mainUser.id) continue;
    try {
      await db.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: melloUserId,
        role: 'member',
      });
    } catch {
      // Already exists or other issue — skip
    }
  }

  // 5. Import each board
  for (let boardIdx = 0; boardIdx < BOARD_IDS.length; boardIdx++) {
    const trelloBoardId = BOARD_IDS[boardIdx];
    try {
      await importBoard(trelloBoardId, boardIdx, workspace.id, mainUser.id, memberIdMap);
    } catch (err) {
      console.error(`\n!!! FAILED board ${boardIdx + 1}/${BOARD_IDS.length} (${trelloBoardId}): ${(err as Error).message}`);
      console.error((err as Error).stack?.split('\n').slice(0, 5).join('\n'));
    }
  }

  // Summary
  console.log('\n========================================');
  console.log('          IMPORT SUMMARY');
  console.log('========================================');
  console.log(`  Boards:           ${totals.boards}`);
  console.log(`  Lists:            ${totals.lists}`);
  console.log(`  Cards:            ${totals.cards}`);
  console.log(`  Labels:           ${totals.labels}`);
  console.log(`  Checklists:       ${totals.checklists}`);
  console.log(`  Checklist items:  ${totals.checklistItems}`);
  console.log(`  Comments:         ${totals.comments}`);
  console.log(`  Attachments (DB): ${totals.attachments}`);
  console.log(`  Downloads OK:     ${totals.attachmentDownloads}`);
  console.log(`  Downloads skipped:${totals.attachmentSkips}`);
  console.log(`  Download errors:  ${totals.attachmentErrors}`);
  console.log('========================================');
  console.timeEnd('Total import time');

  process.exit(0);
}

// ---------------------------------------------------------------------------
// Import a single board
// ---------------------------------------------------------------------------

async function importBoard(
  trelloBoardId: string,
  boardIdx: number,
  workspaceId: string,
  mainUserId: string,
  memberIdMap: Map<string, string>,
) {
  const num = `${boardIdx + 1}/${BOARD_IDS.length}`;

  // Fetch everything from Trello
  console.log(`\n--- Board ${num}: Fetching data for ${trelloBoardId}...`);

  const [boardData, trelloLists, trelloLabels, trelloCards, trelloComments] = await Promise.all([
    trelloFetch<TrelloBoard>(`/boards/${trelloBoardId}?fields=all`),
    trelloFetch<TrelloList[]>(`/boards/${trelloBoardId}/lists?fields=all&filter=all`),
    trelloFetch<TrelloLabel[]>(`/boards/${trelloBoardId}/labels?fields=all`),
    trelloFetch<TrelloCard[]>(`/boards/${trelloBoardId}/cards?fields=all&attachments=true&checklists=all&members=true&filter=all`),
    fetchAllComments(trelloBoardId),
  ]);

  const totalAttachments = trelloCards.reduce((s, c) => s + (c.attachments?.length || 0), 0);
  console.log(`Board ${num}: "${boardData.name}" — ${trelloLists.length} lists, ${trelloCards.length} cards, ${totalAttachments} attachments, ${trelloComments.length} comments`);

  // --- Create Mello board ---
  const [melloBoard] = await db.insert(boards).values({
    workspaceId,
    name: boardData.name,
    description: boardData.desc || null,
    backgroundType: 'color',
    backgroundValue: mapBackground(boardData.prefs),
    position: boardIdx * 65536,
  }).returning();
  totals.boards++;

  // --- Add board members ---
  // All mapped members get added to the board
  const boardMemberRows: { boardId: string; userId: string; role: 'admin' | 'normal' | 'observer' }[] = [];
  const addedUserIds = new Set<string>();

  // Main user is always admin
  boardMemberRows.push({ boardId: melloBoard.id, userId: mainUserId, role: 'admin' });
  addedUserIds.add(mainUserId);

  for (const [, melloUserId] of memberIdMap) {
    if (addedUserIds.has(melloUserId)) continue;
    addedUserIds.add(melloUserId);
    boardMemberRows.push({ boardId: melloBoard.id, userId: melloUserId, role: 'normal' });
  }
  if (boardMemberRows.length > 0) {
    await batchInsert(boardMembers, boardMemberRows);
  }

  // --- Create lists ---
  const listIdMap = new Map<string, string>(); // trelloListId -> melloListId
  if (trelloLists.length > 0) {
    const listRows = trelloLists.map((tl) => ({
      boardId: melloBoard.id,
      name: tl.name,
      position: tl.pos,
    }));
    const insertedLists = await batchInsertReturning(lists, listRows);
    for (let i = 0; i < trelloLists.length; i++) {
      listIdMap.set(trelloLists[i].id, insertedLists[i].id);
    }
    totals.lists += insertedLists.length;
  }

  // --- Create labels ---
  const labelIdMap = new Map<string, string>(); // trelloLabelId -> melloLabelId
  if (trelloLabels.length > 0) {
    const labelRows = trelloLabels.map((tl, idx) => ({
      boardId: melloBoard.id,
      name: tl.name || null,
      color: tl.color || 'blue', // default if null
      position: idx * 65536,
    }));
    const insertedLabels = await batchInsertReturning(labels, labelRows);
    for (let i = 0; i < trelloLabels.length; i++) {
      labelIdMap.set(trelloLabels[i].id, insertedLabels[i].id);
    }
    totals.labels += insertedLabels.length;
  }

  // --- Create cards (batch) ---
  const cardIdMap = new Map<string, string>(); // trelloCardId -> melloCardId
  const cardsBatch: { boardId: string; listId: string; name: string; description: string | null; position: number }[] = [];
  const cardsOrder: TrelloCard[] = [];

  for (const tc of trelloCards) {
    const melloListId = listIdMap.get(tc.idList);
    if (!melloListId) {
      // Card references an unknown list (possibly from a different board). Skip.
      continue;
    }
    cardsBatch.push({
      boardId: melloBoard.id,
      listId: melloListId,
      name: tc.name || '(untitled)',
      description: tc.desc || null,
      position: tc.pos,
    });
    cardsOrder.push(tc);
  }

  if (cardsBatch.length > 0) {
    const insertedCards = await batchInsertReturning(cards, cardsBatch);
    for (let i = 0; i < cardsOrder.length; i++) {
      cardIdMap.set(cardsOrder[i].id, insertedCards[i].id);
    }
    totals.cards += insertedCards.length;
  }

  // --- Create card_labels ---
  const cardLabelRows: { cardId: string; labelId: string }[] = [];
  for (const tc of cardsOrder) {
    const melloCardId = cardIdMap.get(tc.id);
    if (!melloCardId) continue;
    for (const trelloLabelId of tc.idLabels) {
      const melloLabelId = labelIdMap.get(trelloLabelId);
      if (melloLabelId) {
        cardLabelRows.push({ cardId: melloCardId, labelId: melloLabelId });
      }
    }
  }
  if (cardLabelRows.length > 0) {
    await batchInsert(cardLabels, cardLabelRows);
  }

  // --- Create card assignments ---
  const assignmentRows: { cardId: string; userId: string }[] = [];
  for (const tc of cardsOrder) {
    const melloCardId = cardIdMap.get(tc.id);
    if (!melloCardId) continue;
    const seen = new Set<string>();
    for (const trelloMemberId of tc.idMembers) {
      const melloUserId = memberIdMap.get(trelloMemberId);
      if (melloUserId && !seen.has(melloUserId)) {
        seen.add(melloUserId);
        assignmentRows.push({ cardId: melloCardId, userId: melloUserId });
      }
    }
  }
  if (assignmentRows.length > 0) {
    await batchInsert(cardAssignments, assignmentRows);
  }

  // --- Create checklists and items ---
  for (const tc of cardsOrder) {
    const melloCardId = cardIdMap.get(tc.id);
    if (!melloCardId || !tc.checklists || tc.checklists.length === 0) continue;

    for (const tcl of tc.checklists) {
      const [melloChecklist] = await db.insert(checklists).values({
        cardId: melloCardId,
        name: tcl.name,
        position: tcl.pos,
      }).returning();
      totals.checklists++;

      if (tcl.checkItems && tcl.checkItems.length > 0) {
        const itemRows = tcl.checkItems.map((ci) => ({
          checklistId: melloChecklist.id,
          name: ci.name,
          checked: ci.state === 'complete',
          position: ci.pos,
        }));
        await batchInsert(checklistItems, itemRows);
        totals.checklistItems += itemRows.length;
      }
    }
  }

  // --- Create comments ---
  if (trelloComments.length > 0) {
    const commentRows: { cardId: string; userId: string; body: string; createdAt: Date }[] = [];
    for (const action of trelloComments) {
      const melloCardId = cardIdMap.get(action.data.card?.id);
      if (!melloCardId) continue;
      const melloUserId = memberIdMap.get(action.idMemberCreator) || mainUserId;
      commentRows.push({
        cardId: melloCardId,
        userId: melloUserId,
        body: action.data.text,
        createdAt: new Date(action.date),
      });
    }
    if (commentRows.length > 0) {
      await batchInsert(comments, commentRows);
      totals.comments += commentRows.length;
    }
  }

  // --- Download attachments ---
  const boardDirName = sanitizeForFs(boardData.name);
  let attachmentCount = 0;
  let cardProgress = 0;

  for (const tc of cardsOrder) {
    const melloCardId = cardIdMap.get(tc.id);
    if (!melloCardId || !tc.attachments || tc.attachments.length === 0) continue;

    cardProgress++;
    if (cardProgress % 100 === 0) {
      console.log(`  Board ${num}: Attachment progress — ${cardProgress} cards processed, ${attachmentCount} files so far`);
    }

    const cardDir = path.join(ATTACHMENT_ROOT, boardDirName, melloCardId);
    fs.mkdirSync(cardDir, { recursive: true });

    for (const ta of tc.attachments) {
      const originalFilename = sanitizeForFs(ta.name || 'attachment');
      const storagePath = path.join(cardDir, originalFilename);

      // Create DB record
      const attachmentId = crypto.randomUUID();
      try {
        await db.insert(attachments).values({
          id: attachmentId,
          cardId: melloCardId,
          userId: mainUserId,
          filename: ta.name || 'attachment',
          storagePath,
          url: ta.url || null,
          mimeType: ta.mimeType || null,
          sizeBytes: ta.bytes || null,
        });
        totals.attachments++;
      } catch (err) {
        console.warn(`  Warning: DB insert failed for attachment "${ta.name}": ${(err as Error).message.slice(0, 120)}`);
        continue;
      }

      // Download file (skip if already exists)
      if (fs.existsSync(storagePath)) {
        totals.attachmentSkips++;
        attachmentCount++;
        continue;
      }

      try {
        await downloadAttachment(ta.url, storagePath);
        totals.attachmentDownloads++;
        attachmentCount++;
      } catch (err) {
        totals.attachmentErrors++;
        // Don't spam the console for every failure — just count them
        if (totals.attachmentErrors <= 20) {
          console.warn(`  Download failed: ${ta.name} — ${(err as Error).message.slice(0, 100)}`);
        } else if (totals.attachmentErrors === 21) {
          console.warn(`  (suppressing further download error messages)`);
        }
      }
    }
  }

  console.log(`  Board ${num}: Done. ${cardIdMap.size} cards, ${attachmentCount} attachment files processed.`);
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

async function downloadAttachment(url: string, destPath: string): Promise<void> {
  if (!url) throw new Error('No URL');

  // For Trello-hosted files, use OAuth header auth (query-param auth returns 401
  // on attachment download endpoints).
  const isTrelloUrl =
    url.includes('trello.com') ||
    url.includes('trello-attachments') ||
    url.includes('trello-backgrounds') ||
    url.includes('trello.');
  const headers: Record<string, string> = {};
  if (isTrelloUrl) {
    headers['Authorization'] =
      `OAuth oauth_consumer_key="${TRELLO_KEY}", oauth_token="${TRELLO_TOKEN}"`;
  }

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
      if ((lastError.message.includes('HTTP 401') || lastError.message.includes('HTTP 403') || lastError.message.includes('HTTP 404') || lastError.message.includes('HTTP 410')) && !lastError.message.includes('retryable')) {
        break;
      }
      if (attempt < MAX_RETRIES) {
        await sleep(attempt * 1000);
      }
    }
  }
  throw lastError!;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
