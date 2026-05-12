import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentModel } from '@mello/shared';

const MODEL_IDS: Record<AgentModel, string> = {
  opus: 'claude-opus-4-7',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
};

export interface RunAgentOptions {
  prompt: string;
  cwd: string;
  model: AgentModel;
  maxTurns: number;
  allowedTools?: string[];
  onProgress: (msg: string) => void;
  onAskHuman: (question: string) => Promise<never>;
}

export interface RunAgentResult {
  summary: string;
  transcript: string;
  paused: boolean;
}

const ASK_HUMAN_MARKER = '__ASK_HUMAN__:';

function extractText(message: any): string {
  if (typeof message?.message?.content === 'string') return message.message.content;
  if (Array.isArray(message?.message?.content)) {
    return message.message.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');
  }
  return '';
}

export async function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  const transcript: string[] = [];
  let lastAssistantText = '';

  const systemPreamble =
    `You are a Mello agent running an autonomous task. ` +
    `If you need clarification from a human at any point, output a single line beginning with "${ASK_HUMAN_MARKER}" ` +
    `followed by your question, then stop. Otherwise, complete the task and end with a "## Summary" section.`;

  const fullPrompt = `${systemPreamble}\n\n---\n\n${opts.prompt}`;

  for await (const message of query({
    prompt: fullPrompt,
    options: {
      cwd: opts.cwd,
      model: MODEL_IDS[opts.model],
      maxTurns: opts.maxTurns,
      allowedTools: opts.allowedTools,
    } as any,
  })) {
    if ((message as any).type === 'assistant') {
      const text = extractText(message);
      if (text) {
        transcript.push(text);
        lastAssistantText = text;
        opts.onProgress(text);

        if (text.includes(ASK_HUMAN_MARKER)) {
          const question = text.split(ASK_HUMAN_MARKER)[1]?.split('\n')[0]?.trim() ?? 'unspecified';
          await opts.onAskHuman(question);
        }
      }
    }
  }

  return {
    summary: lastAssistantText,
    transcript: transcript.join('\n\n---\n\n'),
    paused: false,
  };
}
