import { publicAsset } from './publicAsset';

/**
 * Clash of Clans brand and moment art, sourced from Supercell's own asset CDN (media.ffycdn.net —
 * same host Clash Royale's app icon hotlinks in clashRoyale.ts). Unlike Clash Royale's assets,
 * these came down heavily padded (e.g. the war icon's actual glyph filled under 40% of its
 * canvas) — hotlinking them as-is would render a tiny mark inside a mostly-empty box at the small
 * sizes these are used at. Cropped to the glyph's bounding box (plus a little breathing room) and
 * vendored locally rather than hotlinked, since there's no CSS-only way to crop a remote image
 * without knowing each one's padding in advance.
 */
export const CLASH_OF_CLANS_APP_ICON_URL = publicAsset('clash-of-clans/app-icon.png');
export const CLASH_OF_CLANS_WORDMARK_URL = publicAsset('clash-of-clans/wordmark.png');

/** Badge for the "Clan war" moment card — covers both classic war and Clan War League matchdays;
 * the command center doesn't yet distinguish which one a given war is (see clashOfClansApi.ts). */
export const CLASH_OF_CLANS_WAR_ICON_URL = publicAsset('clash-of-clans/war-icon.png');

/** Badge for the "Raid weekend" moment card. */
export const CLASH_OF_CLANS_RAID_WEEKEND_ICON_URL = publicAsset('clash-of-clans/raid-weekend-icon.png');

/** Inline war-star icon, used next to a clan's/opponent's star tally instead of a plain glyph. */
export const CLASH_OF_CLANS_STAR_ICON_URL = publicAsset('clash-of-clans/star-icon.png');

/** Inline capital-gold icon, used next to a raid weekend's loot total. */
export const CLASH_OF_CLANS_CAPITAL_GOLD_ICON_URL = publicAsset('clash-of-clans/capital-gold-icon.png');
