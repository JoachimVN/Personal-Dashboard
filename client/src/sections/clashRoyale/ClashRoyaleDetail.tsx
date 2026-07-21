import type { ClashRoyaleData } from '@personal-dashboard/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody, WidgetShell } from '../../components/WidgetCard';
import { ClashRoyaleBattleLog, ClashRoyaleChests, ClashRoyaleDeck, ClashRoyaleHero, ClashRoyaleStats } from '../../widgets/ClashRoyaleWidgets';
import { DetailSectionHeading } from '../DetailIntro';

export function ClashRoyaleSignals() {
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
      <DetailSectionHeading label="Now" title="Player card" />
      <WidgetShell title="Player">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ClashRoyaleHero data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading label="Deck" title="Current deck" />
      <WidgetShell title="Deck">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ClashRoyaleDeck data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading label="Chests" title="Upcoming chest cycle" />
      <WidgetShell title="Chests">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ClashRoyaleChests data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading label="Battles" title="Recent battle log" />
      <WidgetShell title="Battle log">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ClashRoyaleBattleLog data={data} />}
        </WidgetBody>
      </WidgetShell>
    </div>
  );
}
