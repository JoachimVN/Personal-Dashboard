import type { RobloxData } from '@personal-dashboard/shared';
import { relativeTime } from '../lib/time';

const accent = 'var(--color-accent-roblox)';

function Stat({ value, label }: Readonly<{ value: string | number; label: string }>) {
  return (
    <div>
      <p className="text-xl font-semibold tabular-nums tracking-[-0.03em]">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-ink-faint">{label}</p>
    </div>
  );
}

const PRESENCE_LABEL: Record<NonNullable<RobloxData['presence']>['status'], string> = {
  online: 'Online',
  'in-game': 'Playing now',
  'in-studio': 'In Roblox Studio',
  offline: 'Offline',
};

export function RobloxNowPlaying({ data }: Readonly<{ data: RobloxData }>) {
  if (data.availability.presence === 'unauthorized') {
    return <p className="text-sm text-rose-500">Roblox session cookie expired — grab a fresh one from your browser.</p>;
  }
  if (data.availability.presence !== 'available' || !data.presence) {
    return <p className="text-sm text-ink-faint">Presence isn&apos;t configured for this account.</p>;
  }
  const { status, gameName } = data.presence;
  return (
    <div className="flex items-center gap-4 rounded-xl bg-track/25 p-4">
      {data.profile.avatarUrl ? (
        <img src={data.profile.avatarUrl} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="h-14 w-14 shrink-0 rounded-full bg-track" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {status === 'in-game' && <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: accent }} />}
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: accent }}>{PRESENCE_LABEL[status]}</p>
        </div>
        <p className="mt-1 truncate text-lg font-semibold tracking-[-0.02em] text-ink">
          {status === 'in-game' && gameName ? gameName : data.profile.displayName}
        </p>
        {status === 'offline' && data.presence.lastOnline && (
          <p className="mt-1 text-xs text-ink-faint">Last online {relativeTime(data.presence.lastOnline)}</p>
        )}
      </div>
    </div>
  );
}

export function RobloxProfileStats({ data }: Readonly<{ data: RobloxData }>) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Stat value={data.friendsCount} label="friends" />
      <Stat value={data.recentBadges.length} label="recent badges" />
      <Stat value={data.games.length} label="games listed" />
    </div>
  );
}

export function RobloxBadges({ data }: Readonly<{ data: RobloxData }>) {
  if (data.availability.badges === 'unauthorized') {
    return <p className="text-sm text-rose-500">Roblox session cookie expired — badges can&apos;t be fetched right now.</p>;
  }
  if (data.availability.badges === 'unavailable') {
    return <p className="text-sm text-ink-faint">Badges aren&apos;t available right now.</p>;
  }
  if (data.recentBadges.length === 0) return <p className="text-sm text-ink-faint">No badges yet.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {data.recentBadges.map((badge) => (
        <li key={badge.id} className="flex items-center gap-3 rounded-xl bg-track/25 px-3 py-2">
          {badge.iconUrl ? (
            <img src={badge.iconUrl} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
          ) : (
            <div className="h-8 w-8 shrink-0 rounded-md bg-track" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">{badge.name}</p>
            {badge.awardedAt && <p className="truncate text-xs text-ink-faint">{relativeTime(badge.awardedAt)}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function RobloxGames({ data }: Readonly<{ data: RobloxData }>) {
  if (data.availability.createdGames === 'unauthorized' || data.availability.favoriteGames === 'unauthorized') {
    return <p className="text-sm text-rose-500">Roblox session cookie expired — games can&apos;t be fetched right now.</p>;
  }
  if (data.games.length === 0) return <p className="text-sm text-ink-faint">No games to show yet.</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {data.games.map((game) => (
        <li key={`${game.relation}-${game.id}`} className="overflow-hidden rounded-xl bg-track/25">
          {game.iconUrl ? (
            <img src={game.iconUrl} alt="" className="aspect-square w-full object-cover" loading="lazy" />
          ) : (
            <div className="aspect-square w-full bg-track" />
          )}
          <div className="p-2">
            <p className="truncate text-xs font-medium text-ink">{game.name}</p>
            <p className="truncate text-[10px] uppercase tracking-[0.1em] text-ink-faint">
              {game.relation === 'created' ? 'Created' : 'Favorite'}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
