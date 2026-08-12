// One-off diagnostic: checks how far back Riot's own match-v1 API still holds detail for a match
// ID, using a development key (X-Riot-Token, expires ~24h — see developer.riotgames.com). Answers
// the question of whether match-v1 could enrich the sparse Riot data-export matches that
// backfillValorantHistory.ts imports with zeroed stats, before investing in a full 2,656-match
// fetch loop. Not wired into the app — just prints results.
import 'dotenv/config';

const apiKey = process.env.RIOT_DEVELOPMENT_API_KEY;
const region = process.env.RIOT_REGION || 'eu';
if (!apiKey) {
  console.error('Set RIOT_DEVELOPMENT_API_KEY in server/.env first.');
  process.exit(1);
}

// One match ID per era, spread across the full account history (earliest to latest in the export).
const SAMPLES: { startedAt: string; matchId: string }[] = [
  { startedAt: '2021-05-08', matchId: '0a41cdf0-ee02-42c9-bcf4-4530a88d9381' },
  { startedAt: '2022-03-15', matchId: 'a27bc4c6-28fd-498a-8ac0-ad10a0ae65f1' },
  { startedAt: '2022-09-16', matchId: 'c95cb563-fcd8-4e68-acd6-f649587d6d86' },
  { startedAt: '2023-05-17', matchId: '97390912-f3d1-4f73-9dc9-5053189f95a1' },
  { startedAt: '2025-04-19', matchId: 'af41796f-7bab-43e5-bd96-5ce64e6f9352' },
  { startedAt: '2026-06-21', matchId: '6862e0b8-ea45-4f13-b48e-5616f987a197' },
];

async function probe(matchId: string): Promise<string> {
  const res = await fetch(`https://${region}.api.riotgames.com/val/match/v1/matches/${matchId}`, {
    headers: { 'X-Riot-Token': apiKey! },
  });
  if (res.status === 200) {
    const body = (await res.json()) as { matchInfo?: { mapId?: string; gameLengthMillis?: number } };
    return `200 OK — mapId=${body.matchInfo?.mapId ?? '?'} lengthMs=${body.matchInfo?.gameLengthMillis ?? '?'}`;
  }
  const text = await res.text().catch(() => '');
  return `${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ''}`;
}

async function main() {
  for (const { startedAt, matchId } of SAMPLES) {
    const result = await probe(matchId);
    console.log(`${startedAt}  ${matchId}  ->  ${result}`);
    await new Promise((r) => setTimeout(r, 1300)); // stay well under the dev key's 20 req/1s cap
  }
}

await main();
