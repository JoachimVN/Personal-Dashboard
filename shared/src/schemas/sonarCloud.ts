import { z } from 'zod';

export const sonarRatingSchema = z.enum(['A', 'B', 'C', 'D', 'E']);
export type SonarRating = z.infer<typeof sonarRatingSchema>;

export const sonarProjectSchema = z.object({
  key: z.string(),
  name: z.string(),
  visibility: z.enum(['public', 'private']),
  lastAnalysis: z.string().optional(),
  qualityGateStatus: z.enum(['passed', 'failed', 'none']),
  linesOfCode: z.number().optional(),
  languages: z.array(z.string()),
  security: sonarRatingSchema.optional(),
  reliability: sonarRatingSchema.optional(),
  maintainability: sonarRatingSchema.optional(),
  hotspotsReviewedPercent: z.number().optional(),
  coveragePercent: z.number().optional(),
  duplicationsPercent: z.number().optional(),
});

export type SonarProject = z.infer<typeof sonarProjectSchema>;

export const sonarCloudSchema = z.object({
  projects: z.array(sonarProjectSchema),
});

export type SonarCloudData = z.infer<typeof sonarCloudSchema>;
