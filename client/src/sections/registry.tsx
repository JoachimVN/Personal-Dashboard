import { useId, type ComponentType, type CSSProperties } from 'react';
import { GitHubMark } from '../components/GitHubMark';
import { AiOverview } from './ai/AiOverview';
import { AiDetail } from './ai/AiDetail';
import { GitHubOverview } from './github/GitHubOverview';
import { GitHubDetail } from './github/GitHubDetail';
import { SpotifyOverview } from './spotify/SpotifyOverview';
import { SpotifyDetail } from './spotify/SpotifyDetail';
import { PersonalOverview } from './personal/PersonalOverview';
import { PersonalDetail } from './personal/PersonalDetail';
import { WeatherOverview } from './weather/WeatherOverview';
import { WeatherDetail } from './weather/WeatherDetail';
import { HealthOverview } from './health/HealthOverview';
import { HealthDetail } from './health/HealthDetail';
import { GamesOverview } from './games/GamesOverview';
import { GamesDetail } from './games/GamesDetail';

export const SECTION_IDS = ['ai', 'github', 'spotify', 'personal', 'weather', 'health', 'games'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export interface SectionDef {
  id: SectionId;
  title: string;
  label: string;
  description: string;
  /** Theme variable holding this section's accent color, e.g. '--color-accent-ai'. */
  accentVar: string;
  /** Condensed content for the overview block. */
  Overview: ComponentType;
  /** Full content for the expanded section view. `anchor` is the optional sub-widget id to
   *  scroll to on open (e.g. from a command-center tile) — only PersonalDetail uses it today. */
  Detail: ComponentType<{ anchor?: string }>;
}

/** Adding a section = one entry here plus its Overview/Detail components; routing and layout derive from this. */
export const SECTIONS: SectionDef[] = [
  {
    id: 'ai',
    title: 'AI',
    label: 'Intelligence',
    description: 'Usage, pace and context',
    accentVar: '--color-accent-ai',
    Overview: AiOverview,
    Detail: AiDetail,
  },
  {
    id: 'github',
    title: 'GitHub',
    label: 'Build',
    description: 'Momentum across your work',
    accentVar: '--color-accent-github',
    Overview: GitHubOverview,
    Detail: GitHubDetail,
  },
  {
    id: 'spotify',
    title: 'Spotify',
    label: 'Listening',
    description: 'Now playing and your stats',
    accentVar: '--color-accent-spotify',
    Overview: SpotifyOverview,
    Detail: SpotifyDetail,
  },
  {
    id: 'personal',
    title: 'Personal',
    label: 'Today',
    description: 'The shape of your day',
    accentVar: '--color-accent-personal',
    Overview: PersonalOverview,
    Detail: PersonalDetail,
  },
  {
    id: 'weather',
    title: 'Weather',
    label: 'Sky',
    description: 'Now, next 12 hours and the week ahead',
    accentVar: '--color-accent-weather',
    Overview: WeatherOverview,
    Detail: WeatherDetail,
  },
  {
    id: 'health',
    title: 'Health',
    label: 'Wellbeing',
    description: 'Activity, recovery and trends',
    accentVar: '--color-accent-health',
    Overview: HealthOverview,
    Detail: HealthDetail,
  },
  {
    id: 'games',
    title: 'Games',
    label: 'Games',
    description: 'Steam, Roblox and Clash Royale, all in one place',
    accentVar: '--color-accent-steam',
    Overview: GamesOverview,
    Detail: GamesDetail,
  },
];

export function sectionById(id: SectionId): SectionDef {
  const section = SECTIONS.find((entry) => entry.id === id);
  if (!section) throw new Error(`Unknown section: ${id}`);
  return section;
}

export function accentStyle(section: SectionDef): CSSProperties {
  return { '--accent': `var(${section.accentVar})` } as CSSProperties;
}

/** Mount once (see App.tsx). Every colored steam glyph references this same gradient by id — an
    SVG def can't live inside SectionIcon itself, since that renders more than once and ids must
    be unique per document. Stops match Valve's own mark (commons.wikimedia.org/wiki/File:Steam_icon_logo.svg). */
export function SteamGradientDefs() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <defs>
        <linearGradient id="steam-gradient" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#111d2e" />
          <stop offset="21.2%" stopColor="#051839" />
          <stop offset="40.7%" stopColor="#0a1b48" />
          <stop offset="58.1%" stopColor="#132e62" />
          <stop offset="73.8%" stopColor="#144b7e" />
          <stop offset="87.3%" stopColor="#136497" />
          <stop offset="100%" stopColor="#1387b8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Shared per-section glyph — used by both the overview cards (colored) and the compact
    command-center nav (`monochrome`, so the pill row reads as one consistent set rather than
    a handful of brand colors next to a handful of plain glyphs). */
export function SectionIcon({ id, monochrome = false }: Readonly<{ id: SectionId; monochrome?: boolean }>) {
  const maskId = useId();
  switch (id) {
    case 'ai': {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 3.25v17.5M3.25 12h17.5M5.8 5.8l12.4 12.4M18.2 5.8 5.8 18.2" />
        <circle cx="12" cy="12" r="4.25" fill={monochrome ? 'currentColor' : 'var(--accent)'} stroke="none" />
      </svg>
    );
  }
    case 'github': {
    return (
      <GitHubMark className={monochrome ? 'h-5 w-5' : 'h-5 w-5 text-(--color-github-mark)'} />
    );
  }
    case 'spotify': {
    if (monochrome) {
      return (
        <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="currentColor">
          <path d="M19.098 10.638c-3.868-2.297-10.248-2.508-13.941-1.387-.593.18-1.22-.155-1.399-.748-.18-.593.154-1.22.748-1.4 4.239-1.287 11.285-1.038 15.738 1.605.533.317.708 1.005.392 1.538-.316.533-1.005.709-1.538.392zm-.126 3.403c-.272.44-.847.578-1.287.308-3.225-1.982-8.142-2.557-11.958-1.399-.494.15-1.017-.129-1.167-.623-.149-.495.13-1.016.624-1.167 4.358-1.322 9.776-.682 13.48 1.595.44.27.578.847.308 1.286zm-1.469 3.267c-.215.354-.676.465-1.028.249-2.818-1.722-6.365-2.111-10.542-1.157-.402.092-.803-.16-.895-.562-.092-.403.159-.804.562-.896 4.571-1.045 8.492-.595 11.655 1.338.353.215.464.676.248 1.028zm-5.503-17.308c-6.627 0-12 5.373-12 12 0 6.628 5.373 12 12 12 6.628 0 12-5.372 12-12 0-6.627-5.372-12-12-12z" />
        </svg>
      );
    }
    return (
      <img src="/spotify.svg" alt="" aria-hidden className="h-5 w-5" />
    );
  }
    case 'weather': {
    const accent = monochrome ? 'currentColor' : 'var(--accent)';
    const cloudPath = 'M13 20.5h5.2a3.3 3.3 0 0 0 .6-6.55A4.6 4.6 0 0 0 10 12.9a3.6 3.6 0 0 0 .4 7.6H13Z';
    const cloudTransform = 'translate(-4.35 -2.06) scale(1.15)';
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5">
        {/* Filled, like the rest of the set (github/spotify/health/steam are all solid shapes,
            not linework) — the sun is a solid disc plus solid rays, rotated copies of one rounded
            rect around its center, nested well into the cloud rather than just grazing its edge.
            The cloud sits in front of the sun, so the part of the sun it covers has to actually
            disappear rather than get painted over in a background-matching color — that fill hack
            only lines up where the icon happens to sit on exactly --color-card (the overview
            card), and shows up as a visibly mismatched patch anywhere else (the nav pill's
            translucent glass, various hover states). A mask cuts the cloud's silhouette out of the
            sun instead, so it reads correctly against any background. */}
        <mask id={maskId} maskUnits="userSpaceOnUse">
          <rect x="0" y="0" width="24" height="24" fill="#fff" />
          <path d={cloudPath} fill="#000" transform={cloudTransform} />
        </mask>
        <g mask={`url(#${maskId})`} fill={accent}>
          <circle cx="10" cy="10" r="4" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
            <rect key={angle} x="9.3" y="2.8" width="1.4" height="2.1" rx="0.7" transform={`rotate(${angle} 10 10)`} />
          ))}
        </g>
        <path d={cloudPath} fill="currentColor" transform={cloudTransform} />
      </svg>
    );
  }
    case 'personal': {
    const accent = monochrome ? 'currentColor' : 'var(--accent)';
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.25" y="5" width="17.5" height="15.5" rx="3" />
        <path d="M8 3v3.4M16 3v3.4M3.25 10h17.5" />
        <rect x="13.5" y="13" width="4" height="4" rx="1" fill={accent} stroke="none" />
      </svg>
    );
  }
    case 'health': {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="currentColor">
        <path d="M12 20.4 3.7 12.1a5.1 5.1 0 0 1 7.2-7.2L12 6l1.1-1.1a5.1 5.1 0 0 1 7.2 7.2L12 20.4Z" />
      </svg>
    );
  }
    case 'games': {
    /* Generic controller glyph — the section now covers three platforms (Steam/Roblox/Clash
       Royale), each with its own brand mark inside the Games detail page's tab switcher, so the
       top-level nav icon stays platform-neutral rather than favoring one. */
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 8.5h10a4 4 0 0 1 3.9 4.9l-.7 3a3 3 0 0 1-5.1 1.4L13.5 16h-3l-1.6 1.8a3 3 0 0 1-5.1-1.4l-.7-3A4 4 0 0 1 7 8.5Z" />
        <path d="M8 11v3M6.5 12.5h3" />
        <circle cx="15.5" cy="11.5" r=".6" fill="currentColor" stroke="none" />
        <circle cx="17.5" cy="13.5" r=".6" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  default:
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5 10 17l9-10" /><path d="M19 13v6H5V5h9" />
      </svg>
    );
  }
}
