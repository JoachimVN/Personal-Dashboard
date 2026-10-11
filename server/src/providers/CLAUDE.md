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
  Codex reads local session files by modification time and checks `account/rateLimits/read` through
  `codex app-server` every five minutes (immediately on manual Refresh). It starts no coding thread
  or MCP servers. Claude captures the interactive `/usage` screen in screen-reader mode. Print mode
  treats `/usage` as a model prompt and must not be used. Transcripts supply token totals only:
  recursively searching their text for quota reports also matches code examples and test fixtures,
  which previously rewound the card to unrelated, days-old values. Failed probes retain confirmed
  readings with their real timestamps. Cleanup removes only the probe's explicit session ID.
- Provider `fetch` functions generally avoid logging raw response bodies/errors for anything that
  touches an authenticated account (see the comment in `claudeSnapshot`) — sanitize before logging,
  don't rely solely on the scheduler's category-string sanitization.
