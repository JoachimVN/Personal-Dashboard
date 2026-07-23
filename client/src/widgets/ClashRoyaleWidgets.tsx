import { pathOfLegendsDisplayLeagueNumber, pathOfLegendsLeagueName, type ClashRoyaleBattle, type ClashRoyaleData } from '@personal-dashboard/shared';
import { useEffect, useState } from 'react';
import { relativeTime } from '../lib/time';
import { clashRoyaleLeagueArt } from '../lib/clashRoyale';

const BATTLE_RESULT_LABELS: Record<ClashRoyaleBattle['result'], string> = {
  win: 'Victory',
  loss: 'Defeat',
  draw: 'Draw',
};
const CLASH_ART = {
  battle: 'https://media.ffycdn.net/eu/supercell/jRQrei1MNcyVLey6oS3p.png?width=64',
  playerCrown: 'https://media.ffycdn.net/eu/supercell/m1xRh8chWGRUyA5BcuWA.png?width=64',
  opponentCrown: 'https://media.ffycdn.net/eu/supercell/QTQoZZ8e18aR8d3ZtvEK.png?width=64',
} as const;
const REGULAR_CARD_ART_WIDTH = 277;
const REGULAR_CARD_ART_HEIGHT = 330;
const EVOLUTION_CARD_ART_WIDTH = 302;
const EVOLUTION_CARD_ART_HEIGHT = 363;
type FramedCardArtType = 'regular' | 'evolution';
type DeckCardArtType = FramedCardArtType | 'hero';
const framedCardArtUrls = new Map<string, Promise<string>>();

/** Wiki files have uneven padding. Most Evolution art has an outer glow that fades to a
 * near-invisible haze without ever reaching true alpha-zero before the canvas edge, so a
 * zero threshold crops nothing; a few files (e.g. Royal Hogs) have a hard-cut margin and get
 * cropped tight. Trimming at a mid alpha instead treats that haze as background for every file,
 * so all cards crop to the same visible extent and land at the same size in the shared frame. */
function framedCardArtUrl(url: string, artType: FramedCardArtType): Promise<string> {
  const cacheKey = `${artType}:${url}`;
  const cached = framedCardArtUrls.get(cacheKey);
  if (cached) return cached;

  const request = new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const source = document.createElement('canvas');
        source.width = image.naturalWidth;
        source.height = image.naturalHeight;
        const sourceContext = source.getContext('2d', { willReadFrequently: true });
        if (!sourceContext) throw new Error('Could not read wiki card art');
        sourceContext.drawImage(image, 0, 0);
        const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
        let left = source.width;
        let top = source.height;
        let right = -1;
        let bottom = -1;
        const alphaThreshold = 32;
        for (let y = 0; y < source.height; y += 1) {
          for (let x = 0; x < source.width; x += 1) {
            if (pixels[(y * source.width + x) * 4 + 3] <= alphaThreshold) continue;
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
          }
        }
        if (right < left || bottom < top) throw new Error('Wiki card art is fully transparent');

        const sourceWidth = right - left + 1;
        const sourceHeight = bottom - top + 1;
        const scale = Math.min(window.devicePixelRatio || 1, 2);
        const target = document.createElement('canvas');
        target.width = (artType === 'regular' ? REGULAR_CARD_ART_WIDTH : EVOLUTION_CARD_ART_WIDTH) * scale;
        target.height = (artType === 'regular' ? REGULAR_CARD_ART_HEIGHT : EVOLUTION_CARD_ART_HEIGHT) * scale;
        const targetContext = target.getContext('2d');
        if (!targetContext) throw new Error('Could not draw wiki card art');
        const sourceAspectRatio = sourceWidth / sourceHeight;
        const targetAspectRatio = target.width / target.height;
        const drawWidth = sourceAspectRatio <= targetAspectRatio ? target.height * sourceAspectRatio : target.width;
        const drawHeight = sourceAspectRatio > targetAspectRatio ? target.width / sourceAspectRatio : target.height;
        targetContext.drawImage(
          image,
          left,
          top,
          sourceWidth,
          sourceHeight,
          (target.width - drawWidth) / 2,
          (target.height - drawHeight) / 2,
          drawWidth,
          drawHeight,
        );
        resolve(target.toDataURL('image/png'));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error('Could not load wiki card art'));
    image.src = url;
  });
  framedCardArtUrls.set(cacheKey, request);
  return request;
}

function FramedClashRoyaleCardImage({ card, artType }: Readonly<{ card: ClashRoyaleData['currentDeck'][number]; artType: FramedCardArtType }>) {
  const [src, setSrc] = useState(card.iconUrl);

  useEffect(() => {
    let disposed = false;
    setSrc(card.iconUrl);
    if (!card.iconUrl) return () => { disposed = true; };
    framedCardArtUrl(card.iconUrl, artType)
      .then((framedUrl) => {
        if (!disposed) setSrc(framedUrl);
      })
      .catch(() => {
        // Keep the original source visible if it cannot be framed locally.
      });
    return () => { disposed = true; };
  }, [artType, card.iconUrl]);

  if (!src) return <span aria-hidden>{card.name.charAt(0)}</span>;
  return (
    <img
      src={src}
      alt={card.name}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (card.fallbackIconUrl && src !== card.fallbackIconUrl) setSrc(card.fallbackIconUrl);
      }}
    />
  );
}
function formatNumber(value: number): string {
  return value.toLocaleString('en-GB');
}

/** Win/loss/draw tally only — battle trophyChange isn't safe to sum across battles: Path of
 * Legends swings share the same field but aren't fixed-size like ladder trophies, so a mixed-mode
 * sum reads as a plausible but meaningless "trophy gain". Individual battles still show their own
 * real trophyChange in the battle log, just never combined across battles of different types. */
function recentRecord(battles: ClashRoyaleBattle[]) {
  return battles.reduce((record, battle) => {
    if (battle.result === 'win') record.wins += 1;
    else if (battle.result === 'loss') record.losses += 1;
    else record.draws += 1;
    return record;
  }, { wins: 0, losses: 0, draws: 0 });
}

function formatBattleType(type: string): string {
  return type
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll(/[_-]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function Crown({ filled }: Readonly<{ filled: boolean }>) {
  return (
    <svg viewBox="0 0 24 18" aria-hidden className="clash-crown">
      <path d="M2 15.5h20l-1.1-8.9-5.4 4.3L12 2.5 8.5 10.9 3.1 6.6 2 15.5Z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M4 17h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ClashCrownScore({ crownsFor, crownsAgainst, className = '' }: Readonly<{ crownsFor: number; crownsAgainst: number; className?: string }>) {
  return (
    <span className={`clash-crown-score${className ? ` ${className}` : ''}`} aria-hidden>
      <span className="clash-crown-score-art-frame"><img src={CLASH_ART.playerCrown} alt="" width="64" height="48" className="clash-crown-score-art" /></span>
      <strong>{crownsFor}–{crownsAgainst}</strong>
      <span className="clash-crown-score-art-frame"><img src={CLASH_ART.opponentCrown} alt="" width="64" height="48" className="clash-crown-score-art" /></span>
    </span>
  );
}

function ClashBattleHeading({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <p className="clash-eyebrow clash-battle-heading">
      <span className="clash-battle-heading-art"><img src={CLASH_ART.battle} alt="" width="64" height="64" /></span>
      {children}
    </p>
  );
}

export function ClashRoyaleProfile({ data, compact = false }: Readonly<{ data: ClashRoyaleData; compact?: boolean }>) {
  const { profile } = data;
  const path = profile.pathOfLegends;
  const displayLeagueNumber = path ? pathOfLegendsDisplayLeagueNumber(path.leagueNumber) : undefined;
  const leagueName = path ? pathOfLegendsLeagueName(path.leagueNumber) : undefined;

  return (
    <section className={`clash-profile${compact ? ' clash-profile--compact' : ''}`}>
      <div className="clash-profile-main">
        <h2 className="clash-profile-name">{profile.name}</h2>
        <p className="clash-profile-tag">{profile.tag}</p>
        {profile.clanName && (
          <p className="clash-profile-clan">
            {profile.clanBadgeUrl && <img src={profile.clanBadgeUrl} alt="" aria-hidden width="18" height="18" decoding="async" />}
            {profile.clanName}{profile.clanScore !== undefined ? ` · ${formatNumber(profile.clanScore)}` : ''}
          </p>
        )}
      </div>
      <div className="clash-profile-panels">
        <div className="clash-trophy-panel">
          <p className="clash-trophy-label">Trophy road</p>
          <p className="clash-trophy-value">{formatNumber(profile.trophies)}</p>
        </div>
        {path && displayLeagueNumber && (
          <div className="clash-path-panel">
            <p className="clash-eyebrow">Path of Legends</p>
            <div className="clash-path-league">
              {clashRoyaleLeagueArt(displayLeagueNumber) && (
                <img src={clashRoyaleLeagueArt(displayLeagueNumber)} alt="" aria-hidden className="clash-path-league-badge" />
              )}
              <div className="min-w-0">
                <p className="clash-path-league-name">{leagueName}</p>
                {(path.trophies > 0 || (path.rank ?? 0) > 0) && (
                  <div className="clash-path-figures">
                    {path.trophies > 0 && <strong>{formatNumber(path.trophies)}</strong>}
                    {path.rank !== undefined && path.rank !== null && path.rank > 0 && <span>#{formatNumber(path.rank)}</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function ClashRoyaleDeck({ data, compact = false }: Readonly<{ data: ClashRoyaleData; compact?: boolean }>) {
  const deck: { card: ClashRoyaleData['currentDeck'][number]; artType: DeckCardArtType }[] = data.currentDeck.map((card) => ({
    card,
    artType: card.iconUrl?.endsWith('CardEvolution.png') ? 'evolution' as const : 'regular' as const,
  }));
  if (data.deckHero) deck.splice(Math.min(data.deckHeroIndex ?? deck.length, deck.length), 0, { card: data.deckHero, artType: 'hero' as const });
  if (deck.length === 0) return <p className="text-sm text-ink-faint">No current deck reported.</p>;
  return (
    <ul className={`clash-deck-grid${compact ? ' clash-deck-grid--compact' : ''}`}>
      {deck.map(({ card, artType }) => (
        <li key={card.id} className={`clash-card clash-card--${artType}${artType === 'regular' && card.rarity === 'legendary' ? ' clash-card--legendary' : ''}`}>
          {artType === 'hero' ? (card.iconUrl ? (
            <img
              src={card.iconUrl}
              alt={card.name}
              loading="lazy"
              decoding="async"
              onError={(event) => {
                if (card.fallbackIconUrl && event.currentTarget.src !== card.fallbackIconUrl) {
                  event.currentTarget.src = card.fallbackIconUrl;
                }
              }}
            />
          ) : <span aria-hidden>{card.name.charAt(0)}</span>) : <FramedClashRoyaleCardImage card={card} artType={artType} />}
        </li>
      ))}
    </ul>
  );
}

export function ClashRoyaleBattlePulse({ data }: Readonly<{ data: ClashRoyaleData }>) {
  if (data.recentBattles.length === 0) return <p className="text-sm text-ink-faint">Play a battle to start a fresh activity readout.</p>;
  // The API supplies up to 25 battles, while this compact pulse explicitly represents twelve.
  // Use one bounded list for both the result strip and its aggregate figures.
  const battles = data.recentBattles.slice(0, 12);
  const chronologicalBattles = battles.slice().reverse();
  const record = recentRecord(battles);
  const battleCount = battles.length;
  const winRate = Math.round((record.wins / battleCount) * 100);
  const gamesLabel = `Last ${battleCount} ${battleCount === 1 ? 'game' : 'games'}`;
  return (
    <section className="clash-recent-games">
      <header className="clash-recent-games-header">
        <div>
          <ClashBattleHeading>{gamesLabel}</ClashBattleHeading>
          <p className="clash-recent-games-record"><strong>{record.wins}</strong> wins <span>·</span> <strong>{record.losses}</strong> losses{record.draws > 0 && <><span>·</span> <strong>{record.draws}</strong> draws</>}</p>
        </div>
        <p className="clash-recent-games-rate"><strong>{winRate}%</strong><span>win rate</span></p>
      </header>
      <ol className="clash-recent-games-grid" aria-label={`Results of ${gamesLabel.toLowerCase()}, oldest to newest`}>
        {chronologicalBattles.map((battle, index) => (
          <li key={`${battle.battleTime}-${index}`} data-result={battle.result} aria-label={`Game ${index + 1} of ${battleCount}: ${BATTLE_RESULT_LABELS[battle.result]}, ${battle.crownsFor} to ${battle.crownsAgainst} crowns, ${relativeTime(battle.battleTime)}`}>
            <ClashCrownScore crownsFor={battle.crownsFor} crownsAgainst={battle.crownsAgainst} className="clash-recent-games-score" />
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ClashRoyaleBattleLog({ data }: Readonly<{ data: ClashRoyaleData }>) {
  const battles = data.recentBattles;
  if (battles.length === 0) return <p className="text-sm text-ink-faint">No recent battles.</p>;
  const record = recentRecord(battles);
  const winRate = Math.round((record.wins / battles.length) * 100);
  return (
    <div className="clash-battle-log-section">
      <header className="clash-recent-games-header">
        <div>
          <ClashBattleHeading>Last {battles.length} battles</ClashBattleHeading>
          <p className="clash-recent-games-record"><strong>{record.wins}</strong> wins <span>·</span> <strong>{record.losses}</strong> losses{record.draws > 0 && <><span>·</span> <strong>{record.draws}</strong> draws</>}</p>
        </div>
        <p className="clash-recent-games-rate"><strong>{winRate}%</strong><span>win rate</span></p>
      </header>
      <ol className="clash-battle-log">
        {battles.map((battle, index) => (
          <li key={`${battle.battleTime}-${index}`} className="clash-battle-row" data-result={battle.result}>
            <div className="clash-battle-score" aria-label={`${battle.crownsFor} to ${battle.crownsAgainst} crowns`}>
              <ClashCrownScore crownsFor={battle.crownsFor} crownsAgainst={battle.crownsAgainst} />
            </div>
            <div className="clash-battle-main">
              <div className="clash-battle-title-row">
                <p>{battle.opponentName ?? 'Unknown opponent'}</p>
                <time dateTime={battle.battleTime}>{relativeTime(battle.battleTime)}</time>
              </div>
              <div className="clash-battle-meta">
                <span>{formatBattleType(battle.type)}</span>
                <span>{BATTLE_RESULT_LABELS[battle.result]}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
