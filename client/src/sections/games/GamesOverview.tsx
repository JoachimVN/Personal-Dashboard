import type { ClashRoyaleData, RobloxData, SteamData, WidgetEnvelope } from '@personal-dashboard/shared';
import { useWidget } from '../../useWidget';
import { SteamNowPlaying } from '../../widgets/SteamWidgets';
import { RobloxNowPlaying } from '../../widgets/RobloxWidgets';
import './games.css';

function readyData<T>(envelope: WidgetEnvelope<T> | null): T | undefined {
  if (!envelope || envelope.status === 'loading' || envelope.status === 'disabled' || envelope.status === 'error') return undefined;
  return envelope.data;
}

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return hours < 10 ? `${hours.toFixed(1)}h` : `${Math.round(hours)}h`;
}

interface QuickStat {
  key: string;
  value: string;
  label: string;
}

export function GamesOverview() {
  const steam = useWidget<SteamData>('steam');
  const roblox = useWidget<RobloxData>('roblox');
  const clashRoyale = useWidget<ClashRoyaleData>('clash-royale');

  const steamData = readyData(steam.envelope);
  const robloxData = readyData(roblox.envelope);
  const clashRoyaleData = readyData(clashRoyale.envelope);

  if (steamData?.currentGame) return <SteamNowPlaying data={steamData} />;
  if (robloxData?.presence?.status === 'in-game') return <RobloxNowPlaying data={robloxData} />;

  const tiles: QuickStat[] = [];
  if (steam.envelope?.status !== 'disabled') {
    tiles.push({
      key: 'steam',
      value: steamData?.library ? formatHours(steamData.library.totalPlaytimeMinutes) : '—',
      label: 'Steam hours',
    });
  }
  if (roblox.envelope?.status !== 'disabled') {
    tiles.push({ key: 'roblox', value: robloxData ? String(robloxData.friendsCount) : '—', label: 'Roblox friends' });
  }
  if (clashRoyale.envelope?.status !== 'disabled') {
    tiles.push({
      key: 'clash-royale',
      value: clashRoyaleData ? clashRoyaleData.profile.trophies.toLocaleString() : '—',
      label: 'CR trophies',
    });
  }

  if (tiles.length === 0) {
    return <p className="text-sm text-ink-faint">No game sources configured yet.</p>;
  }

  return (
    <div className="games-quick-stats">
      {tiles.map((tile) => (
        <div key={tile.key} className="games-quick-stat">
          <p className="text-lg font-semibold tabular-nums tracking-[-0.03em] text-ink">{tile.value}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-ink-faint">{tile.label}</p>
        </div>
      ))}
    </div>
  );
}
