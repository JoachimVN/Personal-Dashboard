import { z } from 'zod';

export const sonarRatingSchema = z.enum(['A', 'B', 'C', 'D', 'E']);
export type SonarRating = z.infer<typeof sonarRatingSchema>;

export const sonarQualityGateConditionSchema = z.object({
  metricKey: z.string(),
  status: z.enum(['passed', 'failed']),
  comparator: z.string(),
  errorThreshold: z.string().optional(),
  actualValue: z.string().optional(),
});

export const sonarProjectSchema = z.object({
  key: z.string(),
  name: z.string(),
  visibility: z.enum(['public', 'private']),
  lastAnalysis: z.string().optional(),
  qualityGateStatus: z.enum(['passed', 'failed', 'none']),
  qualityGateConditions: z.array(sonarQualityGateConditionSchema).optional(),
  linesOfCode: z.number().optional(),
  languages: z.array(z.string()),
  security: sonarRatingSchema.optional(),
  reliability: sonarRatingSchema.optional(),
  maintainability: sonarRatingSchema.optional(),
  hotspotsReviewedPercent: z.number().optional(),
  coveragePercent: z.number().optional(),
  duplicationsPercent: z.number().optional(),
  vulnerabilitiesCount: z.number().optional(),
  bugsCount: z.number().optional(),
  codeSmellsCount: z.number().optional(),
  newIssuesCount: z.number().optional(),
  newCoveragePercent: z.number().optional(),
  newDuplicationsPercent: z.number().optional(),
  newHotspotsCount: z.number().optional(),
  newHotspotsReviewedPercent: z.number().optional(),
});

export type SonarProject = z.infer<typeof sonarProjectSchema>;

export const sonarCloudSchema = z.object({
  projects: z.array(sonarProjectSchema),
});

export type SonarCloudData = z.infer<typeof sonarCloudSchema>;
