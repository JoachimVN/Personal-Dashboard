import type { ComponentType } from 'react';
import { AiOverview } from './ai/AiOverview';
import { AiDetail } from './ai/AiDetail';
import { GitHubOverview } from './github/GitHubOverview';
import { GitHubDetail } from './github/GitHubDetail';
import { PersonalOverview } from './personal/PersonalOverview';
import { PersonalDetail } from './personal/PersonalDetail';

export const SECTION_IDS = ['ai', 'github', 'personal'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export interface SectionDef {
  id: SectionId;
  title: string;
  /** Theme variable holding this section's accent color, e.g. '--color-accent-ai'. */
  accentVar: string;
  /** Condensed content for the overview block. */
  Overview: ComponentType;
  /** Full content for the expanded section view. */
  Detail: ComponentType;
}

/** Adding a section = one entry here plus its Overview/Detail components; routing and layout derive from this. */
export const SECTIONS: SectionDef[] = [
  { id: 'ai', title: 'AI', accentVar: '--color-accent-ai', Overview: AiOverview, Detail: AiDetail },
  { id: 'github', title: 'GitHub', accentVar: '--color-accent-github', Overview: GitHubOverview, Detail: GitHubDetail },
  { id: 'personal', title: 'Personal', accentVar: '--color-accent-personal', Overview: PersonalOverview, Detail: PersonalDetail },
];

export function sectionById(id: SectionId): SectionDef {
  const section = SECTIONS.find((entry) => entry.id === id);
  if (!section) throw new Error(`Unknown section: ${id}`);
  return section;
}
