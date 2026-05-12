export type AgentType = 'code' | 'research' | 'review';
export type AgentStatus = 'idle' | 'running' | 'awaiting_input' | 'failed' | 'done';
export type AgentModel = 'opus' | 'sonnet' | 'haiku';

export interface AgentMeta {
  agentType: AgentType;
  repoPath: string;
  branch?: string;
  model?: AgentModel;
  maxTurns?: number;
  costCapUsd?: number;
  allowedTools?: string[];
  status?: AgentStatus;
  runId?: string;
  startedAt?: string;
  endedAt?: string;
  lastError?: string;
}

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export const AGENT_LIST_NAMES = {
  READY: 'Ready',
  CLAIMED: 'Claimed',
  IN_PROGRESS: 'In Progress',
  NEEDS_INPUT: 'Needs Input',
  REVIEW: 'Review',
  DONE: 'Done',
} as const;
