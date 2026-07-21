import type { ClashRoyaleData } from '@personal-dashboard/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody, WidgetShell } from '../../components/WidgetCard';
import { ClashRoyaleBattleLog, ClashRoyaleBattlePulse, ClashRoyaleChests, ClashRoyaleDeck, ClashRoyaleHero, ClashRoyalePath, ClashRoyaleStats } from '../../widgets/ClashRoyaleWidgets';
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
        description="Your Trophy Road, Ranked standing, active deck forms, chest rewards, and recent battle form."
        accent="var(--color-accent-clash-royale)"
      >
        <ClashRoyaleSignals />
      </DetailIntro>

      <DetailSectionHeading label="Arena" title="Your Trophy Road" detail="A precise read on the 14,000-trophy road, with your career record alongside it." />
      <WidgetShell title="Arena profile">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ClashRoyaleHero data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading label="Ranked" title="Path of Legends" detail="Your current seasonal league and ranked standing, kept separate from Trophy Road." />
      <WidgetShell title="Ranked progress">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ClashRoyalePath data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading label="Form" title="Recent battle pulse" detail="The latest ten battles give the current win-loss record, trophy swing, and streak at a glance." />
      <WidgetShell title="Battle pulse">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ClashRoyaleBattlePulse data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading label="Deck" title="Your eight cards" detail="The missing special-slot card is restored from your matching latest battle, and every rarity is shown on the game’s level-16 scale." />
      <WidgetShell title="Current deck">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ClashRoyaleDeck data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading label="Rewards" title="Upcoming chests" detail="Chests remain in Clash Royale; this is the live reward cycle reported by the official player API." />
      <WidgetShell title="Chest rewards">
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
