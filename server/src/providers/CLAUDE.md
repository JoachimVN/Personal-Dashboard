## AI usage history

The AI usage providers additionally record trend points through `../usageHistory.ts`
(`UsageHistoryStore`): a shared store that samples each genuinely-new snapshot (deduped by `asOf`,
throttled by `aiUsage.historySampleMs`) into Postgres and embeds the history in the provider
payload.

Rows are kept permanently, but **reads are windowed to `READ_WINDOW_DAYS` (45)**. The whole series
ships inside the widget payload on every poll, and the dashboards reach Postgres over Railway's
public TCP proxy where that is billed egress — unbounded, it was 7,970 sequential scans over 23.4M
tuples in four days and growing. 45 days clears the widest chart window (`MONTH_MS`, 30 d in
`client/src/sections/ai/AiDetail.tsx`) and the importance baseline; raise it if either grows.

`signalHistory.prune` is the one thing here that does delete on a retention window
(`history.retentionDays`, 180 days, always keeping each signal's newest row). Health, Steam
playtime, and the rest are still kept in full.

## Why some providers look more complex than others

- **AI usage** (`aiUsage/`) is actually two providers,
  `createClaudeUsageProvider` (`aiUsage/claude.ts`) and `createCodexUsageProvider`
  (`aiUsage/codex.ts`) over a small shared base (`aiUsage/shared.ts`), each with its own widget id
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
