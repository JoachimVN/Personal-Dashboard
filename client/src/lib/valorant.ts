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
