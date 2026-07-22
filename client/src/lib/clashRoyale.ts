/** The game's own app icon — hotlinked the same way as the Steam mark (Wikimedia Commons) and the
 * nav pill's Clash Royale icon (see sections/registry.tsx), which this re-exports for reuse. */
export const CLASH_ROYALE_APP_ICON_URL = 'https://media.ffycdn.net/eu/supercell/nxaaEWAgbRGADkoAETG8.png';

/**
 * Trophy-road arena key art, keyed by the exact `arenaName` string the Clash Royale API reports
 * (e.g. `player.arena.name`). Sourced from the Clash Royale Fandom wiki's Trophy Road table
 * (clashroyale.fandom.com/wiki/Arenas), covering all 32 current arenas — fan content per
 * Supercell's Fan Content Policy (supercell.com/en/fan-content-policy), hotlinked from Fandom's own
 * asset CDN rather than vendored (unlike the Path of Legends badges below, Fandom doesn't ask
 * consumers not to hotlink).
 *
 * The CR API doesn't expose a stable numeric arena id in the player payload worth keying off, and
 * Supercell adds new arenas to the trophy road periodically — an arena reached that isn't in this
 * map just renders without a backdrop (see clashRoyaleArenaArt below) rather than breaking. To add
 * one later: find its Fandom page, resolve the image via the wiki's `File:` page, and add an entry
 * here keyed by the arena's exact in-game name.
 */
const ARENA_ART: Record<string, string> = {
  'Goblin Stadium': 'https://static.wikia.nocookie.net/clashroyale/images/3/39/Goblin_Stadium.png/revision/latest?cb=20170505222252',
  'Bone Pit': 'https://static.wikia.nocookie.net/clashroyale/images/2/2d/Bone_Pit.png/revision/latest?cb=20170505222215',
  'Barbarian Bowl': 'https://static.wikia.nocookie.net/clashroyale/images/9/94/Barbarian_Bowl.png/revision/latest?cb=20170505222203',
  'Spell Valley': 'https://static.wikia.nocookie.net/clashroyale/images/e/ef/Spell_Valley.png/revision/latest?cb=20170505222416',
  "Builder's Workshop": 'https://static.wikia.nocookie.net/clashroyale/images/3/32/Builder%27s_Workshop.png/revision/latest?cb=20170505222229',
  "P.E.K.K.A.'s Playhouse": 'https://static.wikia.nocookie.net/clashroyale/images/9/91/P.E.K.K.A.%27s_Playhouse.png/revision/latest?cb=20170505222350',
  'Royal Arena': 'https://static.wikia.nocookie.net/clashroyale/images/3/32/Royal_Arena.png/revision/latest?cb=20170505222406',
  'Frozen Peak': 'https://static.wikia.nocookie.net/clashroyale/images/0/01/Frozen_Peak.png/revision/latest?cb=20170505222242',
  'Jungle Arena': 'https://static.wikia.nocookie.net/clashroyale/images/f/fc/Jungle_Arena.png/revision/latest?cb=20170505222325',
  'Hog Mountain': 'https://static.wikia.nocookie.net/clashroyale/images/4/45/Hog_Mountain.png/revision/latest?cb=20170505222311',
  'Electro Valley': 'https://static.wikia.nocookie.net/clashroyale/images/3/31/Electro_Valley.png/revision/latest?cb=20171211181158',
  'Spooky Town': 'https://static.wikia.nocookie.net/clashroyale/images/3/3a/Spooky_Town.png/revision/latest?cb=20190129051740',
  "Rascal's Hideout": 'https://static.wikia.nocookie.net/clashroyale/images/c/c3/Rascal%27s_Hideout.png/revision/latest?cb=20210606230038',
  'Serenity Peak': 'https://static.wikia.nocookie.net/clashroyale/images/1/14/Serenity_Peak.png/revision/latest?cb=20210606230634',
  "Miner's Mine": 'https://static.wikia.nocookie.net/clashroyale/images/9/97/Miner%27s_Mine.png/revision/latest?cb=20220404080733',
  "Executioner's Kitchen": 'https://static.wikia.nocookie.net/clashroyale/images/c/c2/Executioner%27s_Kitchen.png/revision/latest?cb=20221026160351',
  'Royal Crypt': 'https://static.wikia.nocookie.net/clashroyale/images/5/55/Royal_Crypt.png/revision/latest?cb=20221026160217',
  'Silent Sanctuary': 'https://static.wikia.nocookie.net/clashroyale/images/7/7e/Silent_Sanctuary.png/revision/latest?cb=20221026161050',
  'Dragon Spa': 'https://static.wikia.nocookie.net/clashroyale/images/5/58/Dragon_Spa.png/revision/latest?cb=20221026160613',
  'Boot Camp': 'https://static.wikia.nocookie.net/clashroyale/images/9/98/Boot_Camp.png/revision/latest?cb=20230710212823',
  'Clash Fest': 'https://static.wikia.nocookie.net/clashroyale/images/d/d6/Clash_Fest.png/revision/latest?cb=20230704064411',
  'PANCAKES!': 'https://static.wikia.nocookie.net/clashroyale/images/7/7c/PANCAKES%21.png/revision/latest?cb=20220704141850',
  'Valkalla': 'https://static.wikia.nocookie.net/clashroyale/images/b/be/Valkalla_Arena.png/revision/latest?cb=20240310101041',
  'Legendary Arena': 'https://static.wikia.nocookie.net/clashroyale/images/e/ed/Legendary_Arena.png/revision/latest?cb=20170505222335',
  'Lumberlove Cabin': 'https://static.wikia.nocookie.net/clashroyale/images/6/66/Lumberlove_Cabin_Arena.png/revision/latest?cb=20250305121148',
  'Royal Road': 'https://static.wikia.nocookie.net/clashroyale/images/5/59/Royal_Road_Arena.png/revision/latest?cb=20250409105051',
  'Musketeer Street': 'https://static.wikia.nocookie.net/clashroyale/images/7/75/Musketeer_Street_Arena.png/revision/latest?cb=20251103095404',
  'Summit of Heroes': 'https://static.wikia.nocookie.net/clashroyale/images/d/dc/Summit_of_Heroes_Arena.png/revision/latest?cb=20251204022851',
  'Magic Academy': 'https://static.wikia.nocookie.net/clashroyale/images/a/a1/Magic_Academy_Arena.png/revision/latest?cb=20240506161625',
  'Ultimate Clash Pit': 'https://static.wikia.nocookie.net/clashroyale/images/7/71/Ultimate_Clash_Arena.png/revision/latest?cb=20240905102933',
  "Little Prince's Tavern": 'https://static.wikia.nocookie.net/clashroyale/images/9/9e/Little_Prince%27s_Tavern_Arena.png/revision/latest?cb=20231130142021',
  'Spirit Square': 'https://static.wikia.nocookie.net/clashroyale/images/a/af/Spirit_Square_Arena.png/revision/latest?cb=20250829072619',
};

/** Normalizes curly apostrophes to straight ones — the API and the wiki don't always agree on which one they use. */
function normalizeApostrophes(value: string): string {
  return value.replace(/[‘’]/g, "'");
}

export function clashRoyaleArenaArt(arenaName: string): string | undefined {
  return ARENA_ART[normalizeApostrophes(arenaName)];
}

/**
 * Path of Legends league badges, vendored locally (not hotlinked) at the source repo's own request
 * — see client/public/clash-royale/leagues, sourced from github.com/RoyaleAPI/cr-api-assets under
 * Supercell's Fan Content Policy. Covers leagues 0–10, the full current range.
 */
export function clashRoyaleLeagueArt(leagueNumber: number): string | undefined {
  return leagueNumber >= 0 && leagueNumber <= 10 ? `/clash-royale/leagues/league-${leagueNumber}.png` : undefined;
}
