import { ClaudeIcon, OpenAiIcon } from './ToolIcons';

/** The AI tools rendered by this section — each is its own provider/widget id on the server. */
export const AI_TOOLS = [
  { id: 'ai-usage-claude', label: 'Claude Code', color: 'var(--color-claude)', icon: ClaudeIcon },
  { id: 'ai-usage-codex', label: 'Codex', color: 'var(--color-codex)', icon: OpenAiIcon },
] as const;
