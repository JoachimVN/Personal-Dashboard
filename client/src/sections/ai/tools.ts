import { ClaudeIcon, OpenAiIcon } from './ToolIcons';

/**
 * The AI tools rendered by this section — each is its own provider/widget id on the server.
 * `color` is the weekly-window identity color; `fastColor` is a lighter tint used for the 5-hour
 * window, `modelColor` a darker tint used for a model-specific weekly cap (e.g. Claude's "Fable").
 */
export const AI_TOOLS = [
  {
    id: 'ai-usage-claude',
    label: 'Claude Code',
    color: 'var(--color-claude)',
    fastColor: 'var(--color-claude-fast)',
    modelColor: 'var(--color-claude-model)',
    icon: ClaudeIcon,
  },
  {
    id: 'ai-usage-codex',
    label: 'Codex',
    color: 'var(--color-codex)',
    fastColor: 'var(--color-codex-fast)',
    modelColor: 'var(--color-codex-model)',
    iconColor: 'var(--color-openai-mark)',
    icon: OpenAiIcon,
  },
] as const;
