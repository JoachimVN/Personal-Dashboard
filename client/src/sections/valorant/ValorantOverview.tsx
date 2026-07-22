import { useEffect, useRef } from 'react';
import type { ValorantData } from '@personal-dashboard/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody } from '../../components/WidgetCard';
import { ValorantMatchPulse, ValorantProfile, ValorantStats } from '../../widgets/ValorantWidgets';
import './valorant.css';

/* The whole overview card is one link (see SectionCard), same convention as ClashRoyaleOverview. */

export function ValorantOverview() {
  const { envelope, offline } = useWidget<ValorantData>('valorant');

  return (
    <WidgetBody envelope={envelope} offline={offline}>
      {(data) => (
        <ValorantOverviewContent data={data} />
      )}
    </WidgetBody>
  );
}

function ValorantOverviewContent({ data }: Readonly<{ data: ValorantData }>) {
  const overviewRef = useRef<HTMLDivElement>(null);
  const cardArtUrl = data.profile.cardIconUrl;

  useEffect(() => {
    const card = overviewRef.current?.closest<HTMLElement>('.dashboard-section-card--valorant');
    if (!card) return undefined;
    if (!cardArtUrl) {
      card.style.removeProperty('--valorant-card-art');
      return undefined;
    }

    const probe = new Image();
    probe.onload = () => card.style.setProperty('--valorant-card-art', `url("${cardArtUrl}")`);
    probe.src = cardArtUrl;
    return () => {
      probe.onload = null;
      card.style.removeProperty('--valorant-card-art');
    };
  }, [cardArtUrl]);

  return (
    <div ref={overviewRef} className="valorant-overview">
      <ValorantProfile data={data} compact />
      <ValorantStats data={data} />
      <ValorantMatchPulse data={data} />
    </div>
  );
}
