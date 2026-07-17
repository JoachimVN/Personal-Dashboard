import type { SteamData } from '@personal-dashboard/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody } from '../../components/WidgetCard';
import { SteamLibraryStats, SteamNowPlaying } from '../../widgets/SteamWidgets';
import './steam.css';

export function SteamOverview() {
  const { envelope, offline } = useWidget<SteamData>('steam');

  return (
    <WidgetBody envelope={envelope} offline={offline}>
      {(data) => (
        <div className="space-y-4">
          <SteamNowPlaying data={data} />
          <SteamLibraryStats data={data} />
        </div>
      )}
    </WidgetBody>
  );
}
