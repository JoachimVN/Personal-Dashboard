import type { AiUsageToolData } from '@personal-dashboard/shared';
import { motion } from 'motion/react';
import { relativeTime } from '../../lib/time';
import { formatCompactNumber } from '../../lib/format';
import { useWidget } from '../../useWidget';
import { StaleBadge, WidgetBody, WidgetShell } from '../../components/WidgetCard';
import { FIVE_HOUR_MS, UsageMeter, WEEKLY_MS } from './UsageMeter';
import { UsageHistoryChart } from './UsageHistoryChart';
import { UsageRefreshButton } from './UsageRefreshButton';
import { AI_TOOLS } from './tools';
import { DetailIntro, DetailSectionHeading } from '../DetailIntro';

const DAY_MS = 24 * 60 * 60_000;

/** Fallback for when the account-wide quota (behind a flaky, tightly rate-limited endpoint) isn't available. */
function TokenRow({ label, tokens }: Readonly<{ label: string; tokens: number }>) {
  return (
    <div className="flex items-baseline text-xs">
      <span className="text-ink-muted">{label}</span>
      <span className="ml-auto font-semibold tabular-nums">{formatCompactNumber(tokens)} tokens</span>
    </div>
  );
}

function WindowUnavailable({
  label,
  status,
  tokens,
}: Readonly<{
  label: string;
  status: AiUsageToolData['fiveHourStatus'];
  tokens?: number;
}>) {
  if (status === 'unlimited') {
    return (
      <div className="flex items-baseline text-xs">
        <span className="text-ink-muted">{label}</span>
        <span className="ml-auto font-semibold text-emerald-400">Temporarily unlimited</span>
        {tokens !== undefined && <span className="ml-2 tabular-nums text-ink-faint">{formatCompactNumber(tokens)} tokens</span>}
      </div>
    );
  }
  return tokens !== undefined ? <TokenRow label={label} tokens={tokens} /> : null;
}

function ToolCard({ id, label, color }: Readonly<{ id: string; label: string; color: string }>) {
  const { envelope, offline, refresh, refreshing } = useWidget<AiUsageToolData>(id);

  return (
    <motion.div
      className="ai-tool-panel"
      style={{ '--tool-color': color } as React.CSSProperties}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <WidgetShell
        title={label}
        badge={
          <div className="flex items-center gap-2">
            <StaleBadge envelope={envelope} />
            <UsageRefreshButton label={label} refreshing={refreshing} onRefresh={refresh} />
          </div>
        }
      >
        <WidgetBody envelope={envelope} offline={offline}>
        {(data) =>
          data.available ? (
            <div className="space-y-4">
              {data.fiveHour ? (
                <UsageMeter
                  label="5 hours"
                  limit={data.fiveHour}
                  tokens={data.tokens?.fiveHour}
                  color={color}
                  windowMs={FIVE_HOUR_MS}
                />
              ) : (
                <WindowUnavailable label="5 hours" status={data.fiveHourStatus} tokens={data.tokens?.fiveHour} />
              )}
              {data.weekly ? (
                <UsageMeter
                  label="Weekly"
                  limit={data.weekly}
                  tokens={data.tokens?.weekly}
                  color={color}
                  windowMs={WEEKLY_MS}
                />
              ) : (
                <WindowUnavailable label="Weekly" status={data.weeklyStatus} tokens={data.tokens?.weekly} />
              )}
              {(data.fiveHour || data.weekly) && (
                <>
                  <UsageHistoryChart
                    points={data.history}
                    metric="fiveHourUsedPercent"
                    windowMs={DAY_MS}
                    color={color}
                    caption="5-hour window · last 24 h"
                  />
                  <UsageHistoryChart
                    points={data.history}
                    metric="weeklyUsedPercent"
                    windowMs={WEEKLY_MS}
                    color={color}
                    caption="Weekly window · last 7 d"
                  />
                </>
              )}
              {data.asOf && <p className="text-[11px] text-ink-faint">As of {relativeTime(data.asOf)}</p>}
            </div>
          ) : (
            <p className="text-xs text-ink-faint">No current limit snapshot available on this machine.</p>
          )
        }
        </WidgetBody>
      </WidgetShell>
    </motion.div>
  );
}

export function AiDetail() {
  return (
    <div>
      <DetailIntro
        eyebrow="Live intelligence"
        title={<>Know your pace.<br /><span className="text-ink-faint">Keep your flow.</span></>}
        description="A calm, honest view of your active context and account allowances—so the tools stay useful without becoming a distraction."
        accent="var(--color-accent-ai)"
      >
        <div className="detail-signal-panel">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-muted">Telemetry</span>
            <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-ink-faint">
              <i aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" /> Live
            </span>
          </div>
          <div className="mt-6 flex items-end gap-1.5" aria-hidden>
            {[32, 54, 40, 72, 58, 88, 64, 78, 46, 68, 52, 82].map((height, index) => (
              <motion.span
                key={index}
                className="flex-1 rounded-full bg-(--color-accent-ai)"
                initial={{ height: 4 }}
                animate={{ height }}
                transition={{ delay: 0.18 + index * 0.025, type: 'spring', stiffness: 180, damping: 20 }}
                style={{ opacity: 0.22 + index * 0.035 }}
              />
            ))}
          </div>
        </div>
      </DetailIntro>
      <DetailSectionHeading label="Allowance" title="Your working headroom" detail="Live context is local. Account quota updates on a conservative cadence." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {AI_TOOLS.map((tool) => <ToolCard key={tool.id} {...tool} />)}
      </div>
    </div>
  );
}
