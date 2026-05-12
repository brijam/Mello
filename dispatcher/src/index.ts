import { io, Socket } from 'socket.io-client';
import { WS_EVENTS, AGENT_LIST_NAMES, type AgentMeta, type CardDetail } from '@mello/shared';
import { MelloClient, type ListSummary } from './mello-client.js';
import { runAgent } from './run-agent.js';

const MELLO_URL = required('MELLO_URL');
const MELLO_API_KEY = required('MELLO_API_KEY');
const WATCH_BOARD_IDS = required('WATCH_BOARD_IDS').split(',').map((s) => s.trim()).filter(Boolean);
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT ?? 2);

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const client = new MelloClient(MELLO_URL, MELLO_API_KEY);
const inflight = new Set<string>();
// boardId -> map of list name -> ListSummary
const listsByBoard = new Map<string, Map<string, ListSummary>>();

async function refreshLists(boardId: string) {
  const { lists } = await client.getBoardLists(boardId);
  const map = new Map<string, ListSummary>();
  for (const l of lists) map.set(l.name, l);
  listsByBoard.set(boardId, map);
}

function listIdByName(boardId: string, name: string): string {
  const list = listsByBoard.get(boardId)?.get(name);
  if (!list) throw new Error(`Board ${boardId} missing list "${name}"`);
  return list.id;
}

async function moveTo(card: CardDetail, listName: string) {
  await client.moveCard(card.id, listIdByName(card.boardId, listName), Date.now());
}

function throttle<T extends (...args: any[]) => unknown>(fn: T, ms: number): T {
  let last = 0;
  let pending: any = null;
  return ((...args: any[]) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      return fn(...args);
    }
    pending = args;
    setTimeout(() => {
      if (pending) {
        last = Date.now();
        const a = pending;
        pending = null;
        fn(...a);
      }
    }, ms - (now - last));
  }) as T;
}

async function maybeClaim(cardId: string) {
  if (inflight.size >= MAX_CONCURRENT || inflight.has(cardId)) return;

  let detail: { card: CardDetail };
  try {
    detail = await client.getCard(cardId);
  } catch (err) {
    console.error(`getCard(${cardId}) failed:`, err);
    return;
  }
  const card = detail.card;
  if (!card.agentMeta) return;
  if (card.agentMeta.status === 'running') return;

  // Check it's actually in Ready
  const readyId = listsByBoard.get(card.boardId)?.get(AGENT_LIST_NAMES.READY)?.id;
  if (!readyId || card.listId !== readyId) return;

  inflight.add(cardId);
  runOne(card).catch((err) => console.error(`runOne(${cardId}) crashed:`, err))
    .finally(() => inflight.delete(cardId));
}

async function runOne(card: CardDetail) {
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const meta: AgentMeta = card.agentMeta!;

  // Atomic-ish claim
  await client.patchAgentMeta(card.id, { ...meta, status: 'running', runId, startedAt });
  await moveTo(card, AGENT_LIST_NAMES.CLAIMED);
  await moveTo(card, AGENT_LIST_NAMES.IN_PROGRESS);

  const post = throttle(
    (msg: string) => client.addComment(card.id, msg).catch(() => { /* best-effort */ }),
    30_000,
  );

  let pausedForInput = false;
  let outcome: 'done' | 'failed' = 'done';
  let lastError = '';
  let result: Awaited<ReturnType<typeof runAgent>> | null = null;

  try {
    result = await runAgent({
      prompt: card.description ?? '(no description provided)',
      cwd: meta.repoPath,
      model: meta.model ?? 'sonnet',
      maxTurns: meta.maxTurns ?? 40,
      allowedTools: meta.allowedTools,
      onProgress: (msg) => post(msg),
      onAskHuman: async (question) => {
        pausedForInput = true;
        await client.addComment(card.id, `**Need input from human:** ${question}\n\n_Move card back to "${AGENT_LIST_NAMES.READY}" after replying to resume._`);
        await moveTo(card, AGENT_LIST_NAMES.NEEDS_INPUT);
        await client.patchAgentMeta(card.id, {
          ...meta, status: 'awaiting_input', runId, startedAt,
          endedAt: new Date().toISOString(),
        });
        throw new Error('PAUSED');
      },
    });
  } catch (err) {
    if (pausedForInput) return;
    outcome = 'failed';
    lastError = (err as Error).message;
  }

  if (pausedForInput) return;

  // Persist transcript as attachment (durable artifact, not chat)
  if (result?.transcript) {
    try {
      await client.uploadAttachment(
        card.id,
        `agent-run-${runId}.md`,
        `# Agent run ${runId}\n\nStarted: ${startedAt}\nEnded: ${new Date().toISOString()}\nModel: ${meta.model ?? 'sonnet'}\n\n---\n\n${result.transcript}`,
        'text/markdown',
      );
    } catch (err) {
      console.error('uploadAttachment failed:', err);
    }
  }

  await client.addComment(
    card.id,
    outcome === 'done'
      ? (result?.summary ?? 'Run finished.')
      : `**Failed:** ${lastError}`,
  );
  await moveTo(card, outcome === 'done' ? AGENT_LIST_NAMES.REVIEW : AGENT_LIST_NAMES.NEEDS_INPUT);
  await client.patchAgentMeta(card.id, {
    ...meta,
    status: outcome,
    runId,
    startedAt,
    endedAt: new Date().toISOString(),
    lastError: outcome === 'failed' ? lastError : undefined,
  });
}

async function sweep() {
  for (const boardId of WATCH_BOARD_IDS) {
    const readyId = listsByBoard.get(boardId)?.get(AGENT_LIST_NAMES.READY)?.id;
    if (!readyId) continue;
    // Best-effort cold-start: relies on Mello not exposing a list-cards-by-list endpoint here;
    // skipped to keep dispatcher token-light. WS will pick up new moves.
  }
}

async function main() {
  for (const boardId of WATCH_BOARD_IDS) {
    await refreshLists(boardId);
  }

  const socket: Socket = io(MELLO_URL, {
    extraHeaders: { authorization: `Bearer ${MELLO_API_KEY}` },
    auth: { token: MELLO_API_KEY },
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    console.log('Dispatcher connected to Mello');
    for (const boardId of WATCH_BOARD_IDS) {
      socket.emit(WS_EVENTS.JOIN_BOARD, boardId);
    }
  });

  socket.on('connect_error', (err) => console.error('WS error:', err.message));

  socket.on(WS_EVENTS.CARD_MOVED, (payload: { card: { id: string } }) => {
    if (payload?.card?.id) maybeClaim(payload.card.id);
  });

  socket.on(WS_EVENTS.CARD_UPDATED, (payload: { card: { id: string } }) => {
    if (payload?.card?.id) maybeClaim(payload.card.id);
  });

  socket.on(WS_EVENTS.LIST_CREATED, (p: { list?: { boardId: string } }) => {
    if (p?.list?.boardId) refreshLists(p.list.boardId).catch(() => {});
  });

  await sweep();
  console.log(`Dispatcher watching ${WATCH_BOARD_IDS.length} board(s), max concurrent=${MAX_CONCURRENT}`);
}

main().catch((err) => {
  console.error('Dispatcher fatal:', err);
  process.exit(1);
});
