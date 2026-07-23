/**
 * Map loading-screen art, keyed by the exact `map` string HenrikDev reports (e.g. `match.map`).
 * Sourced from wiki.playvalorant.com, the official VALORANT wiki Riot partnered with in 2026
 * (moved off Fandom, hosted by Weird Gloop) — fan-maintained content Riot itself now backs, hotlinked
 * from the wiki's own asset host rather than vendored.
 *
 * Deathmatch-only arenas (Piazza, District, Kasbah, the Skirmish rooms) aren't standard maps and
 * mostly lack dedicated loading-screen art on the wiki; a map missing here just renders without a
 * backdrop (see valorantMapArt below) rather than breaking.
 */
const MAP_ART: Record<string, string> = {
  Ascent: 'https://wiki.playvalorant.com/en-us/images/Loading_Screen_Ascent.png',
  Bind: 'https://wiki.playvalorant.com/en-us/images/Loading_Screen_Bind.png',
  Breeze: 'https://wiki.playvalorant.com/en-us/images/Loading_Screen_Breeze.png',
  Fracture: 'https://wiki.playvalorant.com/en-us/images/Loading_Screen_Fracture.png',
  Haven: 'https://wiki.playvalorant.com/en-us/images/Loading_Screen_Haven.png',
  Icebox: 'https://wiki.playvalorant.com/en-us/images/Loading_Screen_Icebox.png',
  Lotus: 'https://wiki.playvalorant.com/en-us/images/Loading_Screen_Lotus.png',
  Pearl: 'https://wiki.playvalorant.com/en-us/images/Loading_Screen_Pearl.png',
  Split: 'https://wiki.playvalorant.com/en-us/images/Loading_Screen_Split.png',
  Sunset: 'https://wiki.playvalorant.com/en-us/images/Loading_Screen_Sunset.png',
  Abyss: 'https://wiki.playvalorant.com/en-us/images/Loading_Screen_Abyss.png',
  Corrode: 'https://wiki.playvalorant.com/en-us/images/Loading_Screen_Corrode.png',
  Piazza: 'https://wiki.playvalorant.com/en-us/images/Piazza_Loading_Screen.png',
};

export function valorantMapArt(mapName: string): string | undefined {
  return MAP_ART[mapName];
}

/** Riot's public valorant-api.com asset mirror, keyed by agent UUID — same source the server
 * provider resolves from the live match payload's `character.id` (see agentIconUrl in
 * server/src/providers/valorant.ts). The demo has no live match payload to read an id from, so
 * these are the fixed UUIDs for the fixture's five-agent rotation. */
const AGENT_ICON_URLS: Record<string, string> = {
  Jett: 'https://media.valorant-api.com/agents/add6443a-41bd-e414-f6ad-e58d267f4e95/displayicon.png',
  Omen: 'https://media.valorant-api.com/agents/8e253930-4c05-31dd-1b6c-968525494517/displayicon.png',
  Sova: 'https://media.valorant-api.com/agents/320b2a48-4d9b-a075-30f1-1f93a9b638fa/displayicon.png',
  Reyna: 'https://media.valorant-api.com/agents/a3bfb853-43b2-7238-a4f1-ad90e9e46bcc/displayicon.png',
  Killjoy: 'https://media.valorant-api.com/agents/1e58de9c-4950-5125-93e9-a0aee9f98746/displayicon.png',
};

export function valorantAgentIconUrl(agentName: string): string | undefined {
  return AGENT_ICON_URLS[agentName];
}

/** competitivetiers UUID is fixed across the whole game — same constant the server provider uses. */
const COMPETITIVE_TIERS_UUID = '03621f52-342b-cf4e-4f86-9350a49c6d04';

export function valorantTierIconUrl(tierId: number): string | undefined {
  return tierId > 0 ? `https://media.valorant-api.com/competitivetiers/${COMPETITIVE_TIERS_UUID}/${tierId}/smallicon.png` : undefined;
}

/** A single fixed player card ("Firestarter") for the demo's wide/large art — the server provider
 * resolves this per-account from the real equipped card id, which the demo has no account to read. */
export const VALORANT_DEMO_CARD_WIDE_ART = 'https://media.valorant-api.com/playercards/7c7becb5-a6b4-4b48-ad20-5a816fbc5750/wideart.png';
export const VALORANT_DEMO_CARD_LARGE_ART = 'https://media.valorant-api.com/playercards/7c7becb5-a6b4-4b48-ad20-5a816fbc5750/largeart.png';
