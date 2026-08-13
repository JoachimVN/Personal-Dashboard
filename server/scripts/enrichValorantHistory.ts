// Resumable private-history enrichment. Riot's official data export supplies complete match IDs
// but no map, agent, scoreline, or combat stats. HenrikDev's match-by-ID endpoint can recover a
// full payload for some of those IDs. This script fills only sparse imported rows, checkpoints
// successful matches into the existing DB cache, and remembers confirmed 404s in server/.tokens
// so interrupted runs do not waste the account's API allowance by starting over.
//
// Private IDs and raw responses stay in ignored local state. Console output is aggregate only.
import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { createDatabase } from '../src/db/client.js';
import { mapMatch, mergeMatches } from '../src/providers/valorant.js';
import { ValorantHistoryStore, type ValorantHistoryCache } from '../src/valorantHistory.js';

const API_BASE = 'https://api.henrikdev.xyz';
const DEFAULT_DELAY_MS = 3_200;
const CHECKPOINT_EVERY = 10;
const stateSchema = z.object({
  unavailableMatchIds: z.array(z.string()).default([]),
  updatedAt: z.string().optional(),
});

interface HenrikResponse<T> {
  status?: number;
  data?: T;
}

function numericArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const parsed = raw === undefined ? fallback : Number(raw);
  if ((raw !== undefined && !Number.isFinite(parsed)) || parsed < 0) throw new Error(`--${name} must be a non-negative number`);
  return parsed;
}

export function stratifiedSamples<T extends { startedAt: string }>(matches: T[], perYear: number): T[] {
  if (perYear <= 0) return matches;
  const byYear = new Map<number, T[]>();
  for (const match of matches) {
    const year = new Date(match.startedAt).getUTCFullYear();
    const group = byYear.get(year) ?? [];
    group.push(match);
    byYear.set(year, group);
  }
  return [...byYear.entries()]
    .sort(([yearA], [yearB]) => yearB - yearA)
    .flatMap(([, group]) => {
      const count = Math.min(perYear, group.length);
      if (count === 1) return [group[Math.floor(group.length / 2)]!];
      return Array.from({ length: count }, (_, index) => group[Math.round(index * (group.length - 1) / (count - 1))]!);
    });
}

function readState(path: string): z.infer<typeof stateSchema> {
  try {
    return stateSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { unavailableMatchIds: [] };
    throw error;
  }
}

function writeState(path: string, unavailableMatchIds: Set<string>): void {
  writeFileSync(path, JSON.stringify({
    unavailableMatchIds: [...unavailableMatchIds],
    updatedAt: new Date().toISOString(),
  }, null, 2));
}

function checkpoint(
  historyStore: ValorantHistoryStore,
  history: ValorantHistoryCache,
): Promise<ValorantHistoryCache> {
  return historyStore.set({
    matches: history.matches,
    totalMatchesAvailable: history.totalMatchesAvailable,
    nextPage: history.nextPage,
    sourceVersion: history.sourceVersion,
  });
}

async function pause(ms: number): Promise<void> {
  await new Promise((resolvePause) => setTimeout(resolvePause, ms));
}

async function main(): Promise<void> {
  if (!process.argv.includes('--apply')) {
    throw new Error('Pass --apply to confirm private match-ID requests and DB checkpoints.');
  }

  const databaseUrl = process.env.DATABASE_URL;
  const apiKey = process.env.HENRIKDEV_API_KEY;
  const riotId = process.env.RIOT_ID;
  const region = process.env.RIOT_REGION || 'eu';
  if (!databaseUrl || !apiKey || !riotId) {
    throw new Error('DATABASE_URL, HENRIKDEV_API_KEY, and RIOT_ID must be configured.');
  }

  const separator = riotId.lastIndexOf('#');
  if (separator < 1 || separator === riotId.length - 1) throw new Error('RIOT_ID must be in Name#Tag form.');
  const name = riotId.slice(0, separator);
  const tag = riotId.slice(separator + 1);
  const delayMs = numericArg('delay-ms', DEFAULT_DELAY_MS);
  const maxRequests = numericArg('max', Number.POSITIVE_INFINITY);
  const samplePerYear = numericArg('sample-per-year', 0);

  const privateDir = resolve(import.meta.dirname, '../.tokens');
  const statePath = resolve(privateDir, 'valorant-match-enrichment.json');
  mkdirSync(privateDir, { recursive: true });
  const state = readState(statePath);
  const unavailableMatchIds = new Set(process.argv.includes('--retry-not-found') ? [] : state.unavailableMatchIds);

  const database = createDatabase(databaseUrl);
  const historyStore = new ValorantHistoryStore(database);
  let history = await historyStore.get();
  if (!history) throw new Error('No stored Valorant history exists. Run the Riot export backfill first.');

  const sparseCandidates = history.matches
    .filter((match) => match.agentName === '' && !unavailableMatchIds.has(match.matchId));
  const candidates = stratifiedSamples(sparseCandidates, samplePerYear).slice(0, maxRequests);
  const backupPath = resolve(privateDir, `valorant-enrichment-backup-${Date.now()}.json`);
  writeFileSync(backupPath, JSON.stringify(history));

  const accountResponse = await fetch(`${API_BASE}/valorant/v2/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`, {
    headers: { Authorization: apiKey, Accept: 'application/json' },
  });
  if (!accountResponse.ok) throw new Error(`HenrikDev account lookup failed with HTTP ${accountResponse.status}`);
  const accountBody = await accountResponse.json() as HenrikResponse<{ puuid: string }>;
  const puuid = accountBody.data?.puuid;
  if (!puuid) throw new Error('HenrikDev account lookup returned no PUUID.');

  let attempted = 0;
  let resolved = 0;
  let notFound = 0;
  let errors = 0;
  let resolvedSinceCheckpoint = 0;
  let lastRequestAt = 0;

  console.log(JSON.stringify({
    event: 'start',
    archiveMatches: history.matches.length,
    candidates: candidates.length,
    previouslyUnavailable: unavailableMatchIds.size,
    delayMs,
    samplePerYear,
  }));

  for (const candidate of candidates) {
    const waitMs = Math.max(0, delayMs - (Date.now() - lastRequestAt));
    if (waitMs > 0) await pause(waitMs);
    lastRequestAt = Date.now();

    let response = await fetch(`${API_BASE}/valorant/v4/match/${region}/${encodeURIComponent(candidate.matchId)}`, {
      headers: { Authorization: apiKey, Accept: 'application/json' },
    });
    if (response.status === 429) {
      const retryAfterSeconds = Number(response.headers.get('retry-after') ?? 60);
      await pause((Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 60) * 1000);
      lastRequestAt = Date.now();
      response = await fetch(`${API_BASE}/valorant/v4/match/${region}/${encodeURIComponent(candidate.matchId)}`, {
        headers: { Authorization: apiKey, Accept: 'application/json' },
      });
    }

    attempted += 1;
    if (response.status === 404) {
      unavailableMatchIds.add(candidate.matchId);
      notFound += 1;
    } else if (response.ok) {
      const body = await response.json() as HenrikResponse<Parameters<typeof mapMatch>[0]>;
      const mapped = body.data && mapMatch(body.data, puuid);
      if (mapped) {
        history = { ...history, matches: mergeMatches(history.matches, [mapped]) };
        resolved += 1;
        resolvedSinceCheckpoint += 1;
      } else {
        errors += 1;
      }
    } else {
      errors += 1;
    }

    if (attempted % CHECKPOINT_EVERY === 0) {
      if (resolvedSinceCheckpoint > 0) {
        history = await checkpoint(historyStore, history);
        resolvedSinceCheckpoint = 0;
      }
      writeState(statePath, unavailableMatchIds);
      console.log(JSON.stringify({ event: 'progress', attempted, resolved, notFound, errors }));
    }
  }

  if (resolvedSinceCheckpoint > 0) history = await checkpoint(historyStore, history);
  writeState(statePath, unavailableMatchIds);
  await database.client.end({ timeout: 5 });
  console.log(JSON.stringify({
    event: 'complete',
    attempted,
    resolved,
    notFound,
    errors,
    richMatches: history.matches.filter((match) => match.agentName !== '').length,
    sparseMatches: history.matches.filter((match) => match.agentName === '').length,
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    console.error('Valorant enrichment failed:', (error as Error).message);
    process.exitCode = 1;
  }
}
