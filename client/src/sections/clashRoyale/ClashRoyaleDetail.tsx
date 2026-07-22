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
        title="Clash Royale"
        description="Your Trophy Road, Ranked standing, deck lineup, and recent battle form."
        accent="var(--color-accent-clash-royale)"
      >
        <ClashRoyaleSignals />
      </DetailIntro>

      <DetailSectionHeading label="Arena" title="Trophy Road & Ranked" />
      <WidgetShell title="Arena profile">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ClashRoyaleProfile data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading label="Form" title="Recent battle pulse" />
      <WidgetShell title="Battle pulse">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ClashRoyaleBattlePulse data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading label="Deck" title="Your eight cards" />
      <WidgetShell title="Current deck">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ClashRoyaleDeck data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading label="History" title="Latest battles" />
      <WidgetShell title="Battle history">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ClashRoyaleBattleLog data={data} />}
        </WidgetBody>
      </WidgetShell>
    </div>
  );
}
