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
        <div className="valorant-overview">
          <ValorantProfile data={data} compact />
          <ValorantStats data={data} />
          <ValorantMatchPulse data={data} />
        </div>
      )}
    </WidgetBody>
  );
}
