import type { ClashRoyaleData } from '@personal-dashboard/shared';
import { relativeTime } from '../lib/time';

const accent = 'var(--color-accent-clash-royale)';

function Stat({ value, label }: Readonly<{ value: string | number; label: string }>) {
  return (
    <div>
      <p className="text-xl font-semibold tabular-nums tracking-[-0.03em]">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-ink-faint">{label}</p>
    </div>
  );
}

export function ClashRoyaleHero({ data }: Readonly<{ data: ClashRoyaleData }>) {
  const { profile } = data;
  return (
    <div className="flex items-center gap-4 rounded-xl bg-track/25 p-4">
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold"
        style={{ background: `color-mix(in oklab, ${accent} 22%, var(--color-track))`, color: accent }}
      >
        {profile.expLevel}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: accent }}>{profile.arenaName}</p>
        <p className="mt-1 truncate text-lg font-semibold tracking-[-0.02em] text-ink">{profile.name}</p>
        <p className="mt-1 text-xs tabular-nums text-ink-muted">
          🏆 {profile.trophies.toLocaleString()} <span className="text-ink-faint">(best {profile.bestTrophies.toLocaleString()})</span>
        </p>
      </div>
    </div>
  );
}

export function ClashRoyaleStats({ data }: Readonly<{ data: ClashRoyaleData }>) {
  const { profile } = data;
  const winRate = profile.wins + profile.losses > 0 ? Math.round((profile.wins / (profile.wins + profile.losses)) * 100) : 0;
  return (
    <div className="grid grid-cols-3 gap-3">
      <Stat value={`${winRate}%`} label="win rate" />
      <Stat value={profile.wins} label="wins" />
      <Stat value={profile.threeCrownWins} label="3-crown wins" />
    </div>
  );
}

export function ClashRoyaleDeck({ data }: Readonly<{ data: ClashRoyaleData }>) {
  if (data.currentDeck.length === 0) return <p className="text-sm text-ink-faint">No current deck reported.</p>;
  return (
    <ul className="grid grid-cols-4 gap-2 sm:grid-cols-8">
      {data.currentDeck.map((card) => (
        <li key={card.id} className="overflow-hidden rounded-lg bg-track/25 text-center">
          {card.iconUrl ? (
            <img src={card.iconUrl} alt="" className="aspect-[3/4] w-full object-cover" loading="lazy" />
          ) : (
            <div className="aspect-[3/4] w-full bg-track" />
          )}
          <p className="truncate px-1 py-1 text-[10px] font-medium text-ink-muted">{card.level}/{card.maxLevel}</p>
        </li>
      ))}
    </ul>
  );
}

export function ClashRoyaleChests({ data }: Readonly<{ data: ClashRoyaleData }>) {
  if (data.upcomingChests.length === 0) return <p className="text-sm text-ink-faint">No upcoming chests reported.</p>;
  return (
    <ol className="flex flex-wrap gap-2">
      {data.upcomingChests.map((chest, i) => (
        <li key={`${chest}-${i}`} className="rounded-full bg-track/25 px-3 py-1 text-xs font-medium text-ink-muted">
          {chest}
        </li>
      ))}
    </ol>
  );
}

export function ClashRoyaleBattleLog({ data }: Readonly<{ data: ClashRoyaleData }>) {
  if (data.recentBattles.length === 0) return <p className="text-sm text-ink-faint">No recent battles.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {data.recentBattles.map((battle, i) => (
        <li key={`${battle.battleTime}-${i}`} className="flex items-center gap-3 rounded-xl bg-track/25 px-3 py-2">
          <span
            className="w-12 shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-bold uppercase tracking-wide"
            style={{
              color: battle.result === 'win' ? 'light-dark(#0a7a3d, #4ade80)' : battle.result === 'loss' ? 'light-dark(#b91c1c, #fb7185)' : 'var(--color-ink-faint)',
              background: battle.result === 'win' ? 'color-mix(in oklab, #22c55e 18%, transparent)' : battle.result === 'loss' ? 'color-mix(in oklab, #ef4444 18%, transparent)' : 'var(--color-track)',
            }}
          >
            {battle.result}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">{battle.opponentName ?? 'Unknown opponent'}</p>
            <p className="truncate text-xs text-ink-faint">
              {battle.crownsFor}–{battle.crownsAgainst} crowns · {battle.type} · {relativeTime(battle.battleTime)}
            </p>
          </div>
          {battle.trophyChange !== undefined && (
            <span className={`shrink-0 text-xs tabular-nums ${battle.trophyChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {battle.trophyChange >= 0 ? '+' : ''}{battle.trophyChange}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
