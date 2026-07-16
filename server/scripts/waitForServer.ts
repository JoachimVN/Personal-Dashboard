export {};

const port = Number(process.env.PORT ?? 4821);
const url = `http://127.0.0.1:${port}/api/health`;
const timeoutMs = 30_000;
const retryMs = 200;
const deadline = Date.now() + timeoutMs;

async function isReady(): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
    return response.ok;
  } catch {
    return false;
  }
}

while (Date.now() < deadline) {
  if (await isReady()) {
    console.log(`Dashboard API ready at ${url}`);
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, retryMs));
}

console.error(`Dashboard API did not become ready within ${timeoutMs / 1_000}s: ${url}`);
process.exit(1);
