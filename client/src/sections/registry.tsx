import type { ComponentType } from 'react';
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
