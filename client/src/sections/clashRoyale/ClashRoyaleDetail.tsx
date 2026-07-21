import type { ClashRoyaleData } from '@personal-dashboard/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody, WidgetShell } from '../../components/WidgetCard';
import { ClashRoyaleBattleLog, ClashRoyaleBattlePulse, ClashRoyaleChests, ClashRoyaleDeck, ClashRoyaleHero, ClashRoyaleStats } from '../../widgets/ClashRoyaleWidgets';
import { DetailIntro, DetailSectionHeading } from '../DetailIntro';
import './clashRoyale.css';

function ClashRoyaleSignals() {
  const { envelope, offline } = useWidget<ClashRoyaleData>('clash-royale');
  return (
    <div className="detail-signal-panel">
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) => (
          <div className="space-y-4">
            <div>
              <p className="truncate text-sm font-semibold text-ink">{data.profile.name}</p>
              <p className="truncate text-xs text-ink-faint">{data.profile.tag}</p>
            </div>
            <ClashRoyaleStats data={data} />
          </div>
        )}
      </WidgetBody>
    </div>
  );
}

export function ClashRoyaleDetail() {
  const { envelope, offline } = useWidget<ClashRoyaleData>('clash-royale');

  return (
    <div>
      <DetailIntro
        title="Clash Royale command center"
        description="A clear read on your trophy push, current deck, chest cycle, and the form behind your latest battles."
        accent="var(--color-accent-clash-royale)"
      >
        <ClashRoyaleSignals />
      </DetailIntro>

      <DetailSectionHeading label="Arena" title="Your trophy push" detail="Live ladder position compared with your personal best, plus the career record behind it." />
      <WidgetShell title="Arena profile">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ClashRoyaleHero data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading label="Form" title="Recent battle pulse" detail="The latest ten battles give the current win-loss record, trophy swing, and streak at a glance." />
      <WidgetShell title="Battle pulse">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ClashRoyaleBattlePulse data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading label="Deck" title="Your eight cards" detail="Each card shows its current level against its reported maximum, so upgrade gaps are immediately visible." />
      <WidgetShell title="Current deck">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ClashRoyaleDeck data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading label="Cycle" title="Chests on deck" detail="The first chest is next; the rest show their exact order in the current cycle." />
      <WidgetShell title="Chest cycle">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ClashRoyaleChests data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading label="History" title="Latest battles" detail="Results, crowns, modes and trophy changes—without making you parse a dense game log." />
      <WidgetShell title="Battle history">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ClashRoyaleBattleLog data={data} />}
        </WidgetBody>
      </WidgetShell>
    </div>
  );
}
