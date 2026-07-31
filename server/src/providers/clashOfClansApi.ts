const COC_API_BASE = 'https://cocproxy.royaleapi.dev/v1';

export interface ClashOfClansAuth {
  apiKey: string;
  playerTag: string;
}

/** Only the fields this file actually reads off GetPlayer — verified against a live response
 * rather than assumed, since Supercell does rename things (`league` is `leagueTier` as of this
 * writing, which memory alone got wrong once already). */
export interface RawClashOfClansPlayer {
  tag: string;
  townHallLevel: number;
  builderHallLevel?: number;
  bestTrophies: number;
  bestBuilderBaseTrophies?: number;
  warStars: number;
  attackWins: number;
  donations: number;
  clanCapitalContributions: number;
  trophies: number;
  name: string;
  /** Live-verified against this codebase's own account (2026-07-29): includes real league art
   * (`iconUrls.small`/`large`) straight from Supercell's own asset host, unlike the clan badge
   * situation on Clash Royale, which needed a third-party manifest. Post-trophy-revamp, `trophies`
   * resets roughly weekly — `bestTrophies` above predates that reset cycle entirely (a never-reset
   * peak from the old system) and isn't a meaningful "best" to pair with it; not surfaced in
   * ClashOfClansData for that reason, only kept here for the activity-push milestone baseline. */
  leagueTier?: { id: number; name: string; iconUrls?: { small?: string; large?: string } };
  builderBaseLeague?: { name: string };
  /** `badgeUrls` is a documented field on GetPlayer's abbreviated `clan` object but unverified
   * against a live response by this codebase — worth checking the first time a raid-weekend card's
   * clan banner looks wrong. */
  clan?: { tag: string; name: string; badgeUrls?: { small?: string; medium?: string; large?: string } };
}

export interface RawClashOfClansAttack {
  order: number;
  stars: number;
  destructionPercentage: number;
  defenderTag: string;
}

/** Both sides of a war report the same shape — `attacks` is just absent until that member has
 * actually attacked. Kept as one type (rather than separate "us"/"opponent" shapes) because CWL
 * fallback can swap which side is ours. */
export interface RawClashOfClansWarMember {
  tag: string;
  townhallLevel: number;
  attacks?: RawClashOfClansAttack[];
}

/**
 * `teamSize`, `attacksPerMember`, `endTime`, and each side's `name`/`stars`/`destructionPercentage`
 * are documented GetCurrentWar fields, but — unlike `state`/`clan.tag`/`members`, exercised by the
 * activity push since this file's introduction — this codebase hadn't read them until the
 * command-center war event was added. Worth double-checking against a live war if that card ever
 * looks wrong.
 */
export interface RawClashOfClansWar {
  state?: string;
  teamSize?: number;
  attacksPerMember?: number;
  endTime?: string;
  clan: { tag?: string; name?: string; stars?: number; destructionPercentage?: number; members: RawClashOfClansWarMember[] };
  opponent: { tag?: string; name?: string; stars?: number; destructionPercentage?: number; members: RawClashOfClansWarMember[] };
}

export interface RawClashOfClansLeagueGroup {
  rounds: { warTags: string[] }[];
}

export interface RawClashOfClansRaidAttack {
  attacker: { tag: string };
  destructionPercent: number;
  stars: number;
}

export interface RawClashOfClansRaidDistrict {
  id: number;
  name: string;
  attacks?: RawClashOfClansRaidAttack[];
}

export interface RawClashOfClansRaidLogEntry {
  defender: { tag: string; name: string };
  districts: RawClashOfClansRaidDistrict[];
}

export interface RawClashOfClansRaidSeasonMember {
  tag: string;
  name: string;
  attacks: number;
  attackLimit: number;
  bonusAttackLimit: number;
  capitalResourcesLooted: number;
}

/**
 * `state`/`endTime`/`capitalTotalLoot`/`members` are documented GetCapitalRaidSeasons fields, but —
 * like the extra war fields above — unverified against a live response by this codebase before the
 * command-center raid-weekend event was added. `members[].attacks`/`attackLimit`/`bonusAttackLimit`/
 * `capitalResourcesLooted`/`name` are assumed to report this player's own attack usage and loot for
 * the season (and each member's display name for the contributors list); worth re-checking the
 * first time a raid-weekend card looks wrong.
 */
export interface RawClashOfClansRaidSeason {
  state: string;
  endTime: string;
  capitalTotalLoot: number;
  attackLog: RawClashOfClansRaidLogEntry[];
  members?: RawClashOfClansRaidSeasonMember[];
}

/** Clash of Clans tags use the same '#'-prefixed, upper-case convention as Clash Royale's. */
export function normalizeClashOfClansTag(tag: string): string {
  const trimmed = tag.trim().toUpperCase();
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

export async function cocRequest<T>(signal: AbortSignal, apiKey: string, path: string, label: string): Promise<T> {
  const res = await fetch(`${COC_API_BASE}${path}`, {
    signal,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 403) throw new Error(`Clash of Clans ${label} failed: HTTP 403`);
  if (!res.ok) throw new Error(`Clash of Clans ${label} failed: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchClashOfClansPlayer(signal: AbortSignal, apiKey: string, playerTag: string): Promise<RawClashOfClansPlayer> {
  const tag = normalizeClashOfClansTag(playerTag);
  return cocRequest<RawClashOfClansPlayer>(signal, apiKey, `/players/${encodeURIComponent(tag)}`, 'GetPlayer');
}

/** Unlike GetPlayer, a missing current war is routine (not in a war, private war log) rather than
 * a configuration problem — Supercell reports it as a 403 or 404 depending on the reason, and
 * either should be treated as "nothing to report", not surfaced as an error. */
export async function currentClashOfClansWar(signal: AbortSignal, apiKey: string, clanTag: string): Promise<RawClashOfClansWar | null> {
  const res = await fetch(`${COC_API_BASE}/clans/${encodeURIComponent(clanTag)}/currentwar`, {
    signal,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new Error(`Clash of Clans GetCurrentWar failed: HTTP ${res.status}`);
  return (await res.json()) as RawClashOfClansWar;
}

/** During Clan War League, `/currentwar` reports `notInWar` — the real battles live behind this
 * separate pair of calls: the league group lists each round's war tag, and each war tag resolves
 * to a war with the same shape as `/currentwar`. Only tried as a fallback when classic war
 * explicitly reports `notInWar`, so it costs nothing outside CWL weeks. Checks the most recent
 * round first and stops at the first one that involves our clan, so it's usually one extra call,
 * not one per round.
 *
 * Unverified: this clan wasn't in a league war when this was written, so — unlike everything else
 * in this file — this schema comes from community documentation, not a live response. Worth
 * double-checking the first time a CWL push looks wrong. */
export async function currentClashOfClansLeagueWar(signal: AbortSignal, apiKey: string, clanTag: string): Promise<RawClashOfClansWar | null> {
  const groupRes = await fetch(`${COC_API_BASE}/clans/${encodeURIComponent(clanTag)}/currentwar/leaguegroup`, {
    signal,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (groupRes.status === 403 || groupRes.status === 404) return null;
  if (!groupRes.ok) throw new Error(`Clash of Clans GetLeagueGroup failed: HTTP ${groupRes.status}`);
  const group = (await groupRes.json()) as RawClashOfClansLeagueGroup;

  const warTags = group.rounds.flatMap((round) => round.warTags).filter((tag) => tag !== '#0').toReversed();
  for (const warTag of warTags) {
    const warRes = await fetch(`${COC_API_BASE}/clanwarleagues/wars/${encodeURIComponent(warTag)}`, {
      signal,
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!warRes.ok) continue;
    const war = (await warRes.json()) as RawClashOfClansWar;
    if (war.clan.tag === clanTag) return war;
    if (war.opponent.tag === clanTag) return { ...war, clan: war.opponent, opponent: war.clan };
  }
  return null;
}

/** Capital Raid attacks carry no order or timestamp field at all (war at least has `order`). A
 * same-attacker, same-district attack sequence in a live response showed destruction climbing
 * towards the *end* of its `attacks` array (20% -> 47% -> 100%) — only sensible read newest-first —
 * so callers reading `attackLog`/`districts` treat `attacks[0]` as most recent (unverified beyond
 * that one sample). */
export async function fetchLatestClashOfClansRaidSeason(
  signal: AbortSignal,
  apiKey: string,
  clanTag: string,
): Promise<RawClashOfClansRaidSeason | null> {
  const res = await fetch(`${COC_API_BASE}/clans/${encodeURIComponent(clanTag)}/capitalraidseasons?limit=1`, {
    signal,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new Error(`Clash of Clans GetCapitalRaidSeasons failed: HTTP ${res.status}`);
  const body = (await res.json()) as { items: RawClashOfClansRaidSeason[] };
  return body.items[0] ?? null;
}
