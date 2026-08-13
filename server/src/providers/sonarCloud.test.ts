import { describe, expect, it, vi } from 'vitest';
import { createSonarCloudProvider, parseLanguages, toRating } from './sonarCloud.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('toRating', () => {
  it('maps 1..5 to A..E', () => {
    expect(toRating('1.0')).toBe('A');
    expect(toRating('2')).toBe('B');
    expect(toRating('3')).toBe('C');
    expect(toRating('4')).toBe('D');
    expect(toRating('5')).toBe('E');
  });

  it('is undefined for missing, zero, or out-of-range values', () => {
    expect(toRating(undefined)).toBeUndefined();
    expect(toRating('0')).toBeUndefined();
    expect(toRating('6')).toBeUndefined();
    expect(toRating('not-a-number')).toBeUndefined();
  });
});

describe('parseLanguages', () => {
  it('parses a Sonar language distribution string into display names', () => {
    expect(parseLanguages('js=1200;ts=400;css=90')).toEqual(['JavaScript', 'TypeScript', 'CSS']);
  });

  it('falls back to an upper-cased key for languages with no display-name mapping', () => {
    expect(parseLanguages('elixir=50')).toEqual(['ELIXIR']);
  });

  it('is empty for an undefined distribution', () => {
    expect(parseLanguages(undefined)).toEqual([]);
  });
});

function routedFetch(routes: [string, () => Response][]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    const match = routes.find(([substring]) => url.includes(substring));
    if (!match) throw new Error(`Unmocked fetch: ${url}`);
    return match[1]();
  });
}

describe('createSonarCloudProvider', () => {
  it('is unconfigured without auth', () => {
    expect(createSonarCloudProvider(undefined).isConfigured()).toBe(false);
  });

  it('authenticates with the token as a Basic auth username', async () => {
    const fetchMock = routedFetch([
      ['components/search_projects', () => jsonResponse({ components: [] })],
    ]);
    await createSonarCloudProvider({ token: 'my-token', orgKey: 'my-org' }).fetch(new AbortController().signal, false);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.headers).toMatchObject({ Authorization: `Basic ${Buffer.from('my-token:').toString('base64')}` });
    fetchMock.mockRestore();
  });

  it('fetches every project, mapping quality gate status and measures, sorted by most recent analysis', async () => {
    const fetchMock = routedFetch([
      [
        'components/search_projects',
        () =>
          jsonResponse({
            components: [
              { key: 'old-repo', name: 'Old Repo', visibility: 'public', analysisDateAllBranches: '2026-01-01T00:00:00Z' },
              { key: 'new-repo', name: 'New Repo', visibility: 'private', analysisDateAllBranches: '2026-07-21T00:00:00Z' },
            ],
          }),
      ],
      [
        'qualitygates/project_status?projectKey=old-repo',
        () => jsonResponse({
          projectStatus: {
            status: 'ERROR',
            conditions: [
              { status: 'ERROR', metricKey: 'new_coverage', comparator: 'LT', errorThreshold: '80', actualValue: '62.5' },
            ],
          },
        }),
      ],
      [
        'qualitygates/project_status?projectKey=new-repo',
        () => jsonResponse({ projectStatus: { status: 'OK' } }),
      ],
      [
        'measures/component?component=old-repo',
        () =>
          jsonResponse({
            component: { measures: [{ metric: 'ncloc', value: '500' }, { metric: 'security_rating', value: '3' }] },
          }),
      ],
      [
        'measures/component?component=new-repo',
        () =>
          jsonResponse({
            component: {
              measures: [
                { metric: 'ncloc', value: '5700' },
                { metric: 'ncloc_language_distribution', value: 'js=5000;css=700' },
                { metric: 'security_rating', value: '1' },
                { metric: 'reliability_rating', value: '1' },
                { metric: 'sqale_rating', value: '1' },
                { metric: 'security_hotspots_reviewed', value: '100' },
                { metric: 'coverage', value: '0' },
                { metric: 'duplicated_lines_density', value: '0.4' },
                { metric: 'vulnerabilities', value: '2' },
                { metric: 'bugs', value: '1' },
                { metric: 'code_smells', value: '17' },
                { metric: 'new_violations', value: '0' },
                { metric: 'new_coverage', value: '86.2' },
                { metric: 'new_duplicated_lines_density', value: '1.1' },
                { metric: 'new_security_hotspots', value: '2' },
                { metric: 'new_security_hotspots_reviewed', value: '100' },
              ],
            },
          }),
      ],
    ]);

    const data = await createSonarCloudProvider({ token: 'tok', orgKey: 'org' }).fetch(new AbortController().signal, false);

    expect(data.projects.map((p) => p.key)).toEqual(['new-repo', 'old-repo']);
    const [newRepo, oldRepo] = data.projects;
    expect(newRepo).toMatchObject({
      qualityGateStatus: 'passed',
      linesOfCode: 5700,
      languages: ['JavaScript', 'CSS'],
      security: 'A',
      reliability: 'A',
      maintainability: 'A',
      hotspotsReviewedPercent: 100,
      coveragePercent: 0,
      duplicationsPercent: 0.4,
      vulnerabilitiesCount: 2,
      bugsCount: 1,
      codeSmellsCount: 17,
      newIssuesCount: 0,
      newCoveragePercent: 86.2,
      newDuplicationsPercent: 1.1,
      newHotspotsCount: 2,
      newHotspotsReviewedPercent: 100,
    });
    expect(oldRepo).toMatchObject({
      qualityGateStatus: 'failed',
      qualityGateConditions: [{
        metricKey: 'new_coverage',
        status: 'failed',
        comparator: 'LT',
        errorThreshold: '80',
        actualValue: '62.5',
      }],
      linesOfCode: 500,
      security: 'C',
    });
    fetchMock.mockRestore();
  });
});
