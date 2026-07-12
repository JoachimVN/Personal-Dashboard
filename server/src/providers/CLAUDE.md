## AI usage history

The AI usage providers additionally record trend points through `../usageHistory.ts`
(`UsageHistoryStore`): a shared store that samples each genuinely-new snapshot (deduped by `asOf`,
throttled by `aiUsage.historySampleMs`, pruned after `aiUsage.historyRetentionDays`) into the
gitignored `server/.data/ai-usage-history.json` and embeds the history in the provider payload.

## Why some providers look more complex than others

- **AI usage** (`aiUsage.ts`) is actually two providers,
  `createClaudeUsageProvider` and `createCodexUsageProvider`, each with its own widget id
  (`ai-usage-claude`, `ai-usage-codex`) and refresh cadence, even though they render in one section.
  Codex reads local session files (cheap, configurable cadence via `config.json`). Claude shells out to
  `claude -p "/usage" --output-format json` and regex-parses the report text — a local command the CLI
  short-circuits before the model, so it's free and untouched by `/api/oauth/usage`'s rate limiting
  (that endpoint proved unusable from server-side automation: 0 successful reads ever recorded on the
  dev machine — see git history around the switch). Each CLI invocation writes a small local session
  transcript, which is why `aiUsage.claudeRefreshMs` stays coarse (15 min default) instead of polling
  every scheduler tick.
- Provider `fetch` functions generally avoid logging raw response bodies/errors for anything that
  touches an authenticated account (see the comment in `claudeSnapshot`) — sanitize before logging,
  don't rely solely on the scheduler's category-string sanitization.
