/**
 * Match-card art keyed by the names HenrikDev returns. Keeping this shared means the dashboard
 * overview and command-center cards always use the same map artwork.
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
