import type { ClashRoyaleData } from '@personal-dashboard/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody } from '../../components/WidgetCard';
import { ClashRoyaleBattlePulse, ClashRoyaleHero, ClashRoyaleStats } from '../../widgets/ClashRoyaleWidgets';
import './clashRoyale.css';

/* The whole overview card is one link (see SectionCard), same convention as SteamOverview. */

export function ClashRoyaleOverview() {
  const { envelope, offline } = useWidget<ClashRoyaleData>('clash-royale');

  return (
    <WidgetBody envelope={envelope} offline={offline}>
      {(data) => (
        <div className="clash-overview">
          <ClashRoyaleHero data={data} compact />
          <ClashRoyaleStats data={data} />
          <ClashRoyaleBattlePulse data={data} />
        </div>
      )}
    </WidgetBody>
  );
}
