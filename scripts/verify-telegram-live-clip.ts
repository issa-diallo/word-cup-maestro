type ClipStatus = "queued" | "processing" | "ready" | "failed";

export {};

type ClipResponse = {
  status?: ClipStatus;
  jobId?: string;
  error?: string;
};

type ClipStatusResponse = {
  status?: ClipStatus;
  jobId?: string;
  queuePosition?: number;
  clips?: Array<{
    id?: string;
    previewUrl?: string;
  }>;
  error?: string;
};

const args = parseArgs(process.argv.slice(2));

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Live clipping verification failed.");
  process.exit(1);
});

async function main() {
  const baseUrl = normalizeBaseUrl(stringArg("url") ?? process.env.APP_URL_PROD);
  const youtubeUrl = stringArg("youtube") ?? stringArg("youtube-url");
  const telegramSecret = process.env.TELEGRAM_AGENT_SECRET?.trim();
  const r2PublicBase = process.env.CLOUDFLARE_R2_PUBLIC_URL?.trim().replace(/\/+$/, "");
  const timeoutMs = numberArg("timeout-ms", 15 * 60 * 1000);
  const intervalMs = numberArg("interval-ms", 20 * 1000);

  if (!baseUrl) {
    throw new Error(
      "Usage: npm run verify:telegram:clip-live -- --url https://api.example.com --youtube https://youtu.be/...",
    );
  }
  if (!baseUrl.startsWith("https://")) {
    throw new Error("Production base URL must use HTTPS.");
  }
  if (!telegramSecret) {
    throw new Error("TELEGRAM_AGENT_SECRET must be set locally to run the live clipping verifier.");
  }
  if (!r2PublicBase?.startsWith("https://")) {
    throw new Error("CLOUDFLARE_R2_PUBLIC_URL must be set to the public HTTPS R2 base.");
  }
  if (!youtubeUrl?.startsWith("https://")) {
    throw new Error("--youtube must be a HTTPS YouTube URL.");
  }

  const clipResponse = await postClip(baseUrl, telegramSecret, youtubeUrl);
  if (!clipResponse.jobId) {
    throw new Error(
      `Clip request did not return a jobId. Status: ${clipResponse.status ?? "unknown"}.`,
    );
  }

  console.log(
    `PASS live clip request accepted: ${clipResponse.status ?? "unknown"} job ${clipResponse.jobId}`,
  );

  const finalStatus = await pollClipStatus(baseUrl, telegramSecret, clipResponse.jobId, {
    timeoutMs,
    intervalMs,
  });

  if (finalStatus.status !== "ready") {
    throw new Error(
      `Live clip job failed: ${finalStatus.error ?? finalStatus.status ?? "unknown status"}.`,
    );
  }

  const clips = finalStatus.clips ?? [];
  if (!clips.length) {
    throw new Error("Live clip job returned ready without clips.");
  }

  for (const clip of clips) {
    if (!clip.id) throw new Error("Live clip result is missing clip id.");
    if (!clip.previewUrl?.startsWith("https://")) {
      throw new Error(`Clip ${clip.id} is missing a public HTTPS previewUrl.`);
    }
    if (!clip.previewUrl.startsWith(`${r2PublicBase}/`)) {
      throw new Error(`Clip ${clip.id} previewUrl does not start with CLOUDFLARE_R2_PUBLIC_URL.`);
    }
  }

  console.log(`PASS live clip ready: ${clips.length} R2 HTTPS preview(s)`);
  console.log("PASS no publish call was made by this verifier");
}

async function postClip(baseUrl: string, telegramSecret: string, youtubeUrl: string) {
  const response = await fetch(`${baseUrl}/api/telegram/clip`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${telegramSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: youtubeUrl,
      limit: 1,
      platforms: ["youtube", "instagram"],
      async: true,
    }),
  });
  const body = await readJsonObject<ClipResponse>(response);

  if (response.status !== 202) {
    throw new Error(
      `Clip request failed with HTTP ${response.status}: ${body.error ?? "unknown error"}.`,
    );
  }
  if (body.status !== "queued" && body.status !== "processing") {
    throw new Error(`Unexpected initial clip status: ${body.status ?? "missing"}.`);
  }

  return body;
}

async function pollClipStatus(
  baseUrl: string,
  telegramSecret: string,
  jobId: string,
  options: { timeoutMs: number; intervalMs: number },
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < options.timeoutMs) {
    const response = await fetch(
      `${baseUrl}/api/telegram/clip/status?jobId=${encodeURIComponent(jobId)}`,
      {
        headers: {
          Authorization: `Bearer ${telegramSecret}`,
        },
      },
    );
    const body = await readJsonObject<ClipStatusResponse>(response);

    if (!response.ok) {
      throw new Error(
        `Status request failed with HTTP ${response.status}: ${body.error ?? "unknown error"}.`,
      );
    }

    if (body.status === "ready" || body.status === "failed") return body;

    console.log(
      `WAIT live clip status: ${body.status ?? "unknown"}${body.queuePosition ? ` queue=${body.queuePosition}` : ""}`,
    );
    await sleep(options.intervalMs);
  }

  throw new Error(
    `Timed out waiting for live clip job after ${Math.round(options.timeoutMs / 1000)}s.`,
  );
}

async function readJsonObject<T extends Record<string, unknown>>(response: Response): Promise<T> {
  try {
    const body: unknown = await response.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

function parseArgs(values: string[]) {
  const parsed = new Map<string, string | boolean>();

  for (let index = 0; index < values.length; index += 1) {
    const arg = values[index];
    if (!arg.startsWith("--")) continue;

    const key = arg.slice(2);
    const next = values[index + 1];
    if (next && !next.startsWith("--")) {
      parsed.set(key, next);
      index += 1;
    } else {
      parsed.set(key, true);
    }
  }

  return parsed;
}

function stringArg(name: string) {
  const value = args.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberArg(name: string, fallback: number) {
  const value = Number(stringArg(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeBaseUrl(value: string | undefined) {
  if (!value?.trim()) return undefined;
  return value.trim().replace(/\/+$/, "");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
