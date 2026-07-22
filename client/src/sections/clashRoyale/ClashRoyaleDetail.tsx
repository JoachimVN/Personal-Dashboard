import type { ClashRoyaleData } from '@personal-dashboard/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody, WidgetShell } from '../../components/WidgetCard';
import { ClashRoyaleBattleLog, ClashRoyaleBattlePulse, ClashRoyaleDeck, ClashRoyaleProfile, ClashRoyaleStats } from '../../widgets/ClashRoyaleWidgets';
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
        description="Your Trophy Road, Ranked standing, deck lineup, and recent battle form."
        accent="var(--color-accent-clash-royale)"
      >
        <ClashRoyaleSignals />
      </DetailIntro>

      <DetailSectionHeading label="Arena" title="Trophy Road & Ranked" detail="A precise read on the 14,000-trophy road, with your Path of Legends standing right beside it." />
      <WidgetShell title="Arena profile">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ClashRoyaleProfile data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading label="Form" title="Recent battle pulse" detail="The latest ten battles give the current win-loss record, trophy swing, and streak at a glance." />
      <WidgetShell title="Battle pulse">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ClashRoyaleBattlePulse data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading label="Deck" title="Your eight cards" detail="Rarity-coded frames and evolution/level detail, plus the tower troop backing them up. The missing special-slot card is restored from your matching latest battle." />
      <WidgetShell title="Current deck">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ClashRoyaleDeck data={data} />}
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
