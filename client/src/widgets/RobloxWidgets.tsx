import { useState } from 'react';
import type { RobloxData } from '@personal-dashboard/shared';
import { relativeTime } from '../lib/time';

const accent = 'var(--color-accent-roblox)';

const visitsFormatter = new Intl.NumberFormat('en', { notation: 'compact' });
function formatVisits(visits: number): string {
  return visitsFormatter.format(visits);
}

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
  const [avatarFailed, setAvatarFailed] = useState(false);
  if (data.availability.presence === 'unauthorized') {
    return <p className="text-sm text-rose-500">Roblox session cookie expired — grab a fresh one from your browser.</p>;
  }
  if (data.availability.presence !== 'available' || !data.presence) {
    return <p className="text-sm text-ink-faint">Presence isn&apos;t configured for this account.</p>;
  }
  const { status, gameName } = data.presence;
  const hasAvatar = Boolean(data.profile.avatarUrl) && !avatarFailed;
  return (
    <div className="roblox-hero p-4 sm:p-5">
      {hasAvatar && (
        <img aria-hidden src={data.profile.avatarUrl} alt="" className="roblox-hero-backdrop" onError={() => setAvatarFailed(true)} />
      )}
      <div className="roblox-hero-scrim" />
      <div className="relative flex items-center gap-4">
        {hasAvatar ? (
          <img
            src={data.profile.avatarUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full object-cover shadow-lg sm:h-20 sm:w-20"
            onError={() => setAvatarFailed(true)}
          />
        ) : (
          <div className="h-16 w-16 shrink-0 rounded-full bg-track sm:h-20 sm:w-20" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {status === 'in-game' && <span aria-hidden className="roblox-live-dot" />}
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: accent }}>{PRESENCE_LABEL[status]}</p>
          </div>
          <p className="mt-1 truncate text-lg font-semibold tracking-[-0.02em] text-ink sm:text-xl">
            {status === 'in-game' && gameName ? gameName : data.profile.displayName}
          </p>
          {status === 'offline' && data.presence.lastOnline && (
            <p className="mt-1 text-xs text-ink-faint">Last online {relativeTime(data.presence.lastOnline)}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function RobloxProfileStats({ data }: Readonly<{ data: RobloxData }>) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Stat value={data.friendsCount} label="friends" />
      <Stat value={data.recentBadges.length} label="recent badges" />
      <Stat value={data.games.length} label="favorites" />
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
  if (data.availability.favoriteGames === 'unauthorized') {
    return <p className="text-sm text-rose-500">Roblox session cookie expired — favorites can&apos;t be fetched right now.</p>;
  }
  if (data.games.length === 0) return <p className="text-sm text-ink-faint">No favorite games to show yet.</p>;
  return (
    <ul className="roblox-favorites-grid">
      {data.games.map((game) => (
        <li key={game.id} className="roblox-favorite-tile" title={game.name}>
          {game.iconUrl ? (
            <img src={game.iconUrl} alt={game.name} className="roblox-favorite-icon" loading="lazy" />
          ) : (
            <div className="roblox-favorite-icon bg-track" />
          )}
          {game.visits !== undefined && <p className="roblox-favorite-visits">{formatVisits(game.visits)}</p>}
        </li>
      ))}
    </ul>
  );
}
