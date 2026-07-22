import type { ValorantData } from '@personal-dashboard/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody, WidgetShell } from '../../components/WidgetCard';
import { ValorantMatchLog, ValorantMatchPulse, ValorantPerformance, ValorantProfile, ValorantStats } from '../../widgets/ValorantWidgets';
import { DetailIntro, DetailSectionHeading } from '../DetailIntro';
import './valorant.css';

/* client/public/valorant_wordmark.png is solid black on a transparent ground, so it's applied as
   a CSS mask (tinted via --detail-accent, set by DetailIntro) rather than rendered as-is. */
function ValorantWordmark() {
  return (
    <span
      role="img"
      aria-label="Valorant"
      className="block h-[0.78em]"
      style={{
        aspectRatio: '3633 / 533',
        backgroundColor: 'var(--detail-accent)',
        maskImage: 'url(/valorant_wordmark.png)',
        maskRepeat: 'no-repeat',
        maskPosition: 'left center',
        maskSize: 'contain',
        WebkitMaskImage: 'url(/valorant_wordmark.png)',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'left center',
        WebkitMaskSize: 'contain',
      }}
    />
  );
}

function ValorantSignals() {
  const { envelope, offline } = useWidget<ValorantData>('valorant');
  return (
    <div className="detail-signal-panel">
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) => (
          <div className="space-y-4">
            <div>
              <p className="truncate text-sm font-semibold text-ink">{data.profile.name}</p>
              <p className="truncate text-xs text-ink-faint">#{data.profile.tag}</p>
            </div>
            <ValorantStats data={data} />
          </div>
        )}
      </WidgetBody>
    </div>
  );
}

export function ValorantDetail() {
  const { envelope, offline } = useWidget<ValorantData>('valorant');

  return (
    <div>
      <DetailIntro
        title={<ValorantWordmark />}
        description="Your rank, RR, and recent match form."
        accent="var(--color-accent-valorant)"
      >
        <ValorantSignals />
      </DetailIntro>

      <DetailSectionHeading label="Rank" title="Competitive standing" />
      <WidgetShell title="Rank profile">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ValorantProfile data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading label="Performance" title="Agent pool" />
      <WidgetShell title="Performance periods">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ValorantPerformance data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading label="Form" title="Recent match pulse" />
      <WidgetShell title="Match pulse">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ValorantMatchPulse data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading label="History" title="Captured matches" />
      <WidgetShell title="Match history">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ValorantMatchLog data={data} />}
        </WidgetBody>
      </WidgetShell>
    </div>
  );
}
