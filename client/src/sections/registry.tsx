import type { ComponentType } from 'react';
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
import { SteamOverview } from './steam/SteamOverview';
import { SteamDetail } from './steam/SteamDetail';

export const SECTION_IDS = ['ai', 'github', 'spotify', 'personal', 'weather', 'health', 'steam'] as const;
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
  /** Full content for the expanded section view. */
  Detail: ComponentType;
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
    id: 'steam',
    title: 'Steam',
    label: 'Games',
    description: 'Current game, library and achievements',
    accentVar: '--color-accent-steam',
    Overview: SteamOverview,
    Detail: SteamDetail,
  },
];

export function sectionById(id: SectionId): SectionDef {
  const section = SECTIONS.find((entry) => entry.id === id);
  if (!section) throw new Error(`Unknown section: ${id}`);
  return section;
}

/** Shared per-section glyph — used by both the overview cards (colored) and the compact
    command-center nav (`monochrome`, so the pill row reads as one consistent set rather than
    a handful of brand colors next to a handful of plain glyphs). */
export function SectionIcon({ id, monochrome = false }: Readonly<{ id: SectionId; monochrome?: boolean }>) {
  if (id === 'ai') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 3.25v17.5M3.25 12h17.5M5.8 5.8l12.4 12.4M18.2 5.8 5.8 18.2" />
        <circle cx="12" cy="12" r="4.25" fill={monochrome ? 'currentColor' : 'var(--accent)'} stroke="none" />
      </svg>
    );
  }
  if (id === 'github') {
    return (
      <GitHubMark className={monochrome ? 'h-5 w-5' : 'h-5 w-5 text-(--color-github-mark)'} />
    );
  }
  if (id === 'spotify') {
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
  if (id === 'weather') {
    const accent = monochrome ? 'currentColor' : 'var(--accent)';
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="9" r="3.5" stroke={accent} />
        <path d="M9 2.5v1.4M9 14.1v1.4M2.5 9h1.4M14.1 9h1.4M4.4 4.4l1 1M12.6 12.6l1 1M13.6 4.4l-1 1M5.4 12.6l-1 1" stroke={accent} />
        <path d="M13 20.5h5.2a3.3 3.3 0 0 0 .6-6.55A4.6 4.6 0 0 0 10 12.9a3.6 3.6 0 0 0 .4 7.6H13Z" fill="var(--color-card)" />
      </svg>
    );
  }
  if (id === 'health') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="currentColor">
        <path d="M12 20.4 3.7 12.1a5.1 5.1 0 0 1 7.2-7.2L12 6l1.1-1.1a5.1 5.1 0 0 1 7.2 7.2L12 20.4Z" />
      </svg>
    );
  }
  if (id === 'steam') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="currentColor">
        <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5 10 17l9-10" /><path d="M19 13v6H5V5h9" />
    </svg>
  );
}
