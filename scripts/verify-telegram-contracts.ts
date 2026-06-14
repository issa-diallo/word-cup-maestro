import { readFileSync } from "node:fs";

const files = {
  clipRoute: readFileSync("app/api/telegram/clip/route.ts", "utf8"),
  statusRoute: readFileSync("app/api/telegram/clip/status/route.ts", "utf8"),
  publishRoute: readFileSync("app/api/telegram/publish/route.ts", "utf8"),
  clipJobs: readFileSync("lib/telegram-clip-jobs.ts", "utf8"),
  telegramAgent: readFileSync("lib/telegram-agent.ts", "utf8"),
  prodVerifier: readFileSync("scripts/verify-telegram-prod.ts", "utf8"),
  liveClipVerifier: readFileSync("scripts/verify-telegram-live-clip.ts", "utf8"),
};

const failures: string[] = [];

requireSnippet("clip route auth", files.clipRoute, "assertTelegramAgentAuthorized(request)");
requireSnippet("status route auth", files.statusRoute, "assertTelegramAgentAuthorized(request)");
requireSnippet("publish route auth", files.publishRoute, "assertTelegramAgentAuthorized(request)");

requireSnippet(
  "clip route queues async jobs",
  files.clipRoute,
  "createTelegramClipJob({ url, limit, platforms })",
);
requireSnippet("clip route never publishes", files.clipRoute, "publish: false");
forbidSnippet("clip route cannot call n8n publish", files.clipRoute, "publishViaN8n");

requireSnippet("clip jobs never publish", files.clipJobs, "publish: false");
requireSnippet("clip jobs single worker", files.clipJobs, "const MAX_ACTIVE_JOBS = 1");
requireSnippet("clip jobs queue", files.clipJobs, "jobQueue.push(job.id)");
requireSnippet("clip jobs bounded queue", files.clipJobs, "TELEGRAM_CLIP_MAX_QUEUED_JOBS");
requireSnippet("clip jobs queue full response", files.clipJobs, "File de clipping pleine");
requireSnippet("clip jobs queue position", files.clipJobs, "getTelegramClipJobQueuePosition");
requireSnippet("status route returns queue position", files.statusRoute, "queuePosition");

requireSnippet(
  "publish route confirmation guard",
  files.publishRoute,
  "assertPublishConfirmed(body.confirmed)",
);
requireSnippet(
  "publish route confirmation error",
  files.publishRoute,
  "Confirmation humaine requise pour publier.",
);
requireSnippet("publish route R2 URL guard", files.publishRoute, "assertR2PublicVideoUrl");
requireSnippet("publish route only publish caller", files.publishRoute, "publishViaN8n");
requireSnippet(
  "telegram agent checks R2 public base",
  files.telegramAgent,
  "CLOUDFLARE_R2_PUBLIC_URL",
);
requireSnippet(
  "telegram agent rejects non-R2 publish URLs",
  files.telegramAgent,
  "doit venir des previews R2",
);

requireSnippet("prod verifier requires HTTPS", files.prodVerifier, "production URL uses HTTPS");
requireSnippet("prod verifier checks no-store health", files.prodVerifier, "cache-control");
requireSnippet(
  "prod verifier checks public publish safety",
  files.prodVerifier,
  "public publish rejects real mode",
);
requireSnippet(
  "prod verifier checks authenticated non-R2 publish rejection",
  files.prodVerifier,
  "publish rejects confirmed non-R2 URL",
);
requireSnippet(
  "prod verifier avoids real publishable URL",
  files.prodVerifier,
  "https://example.invalid/video.mp4",
);

requireSnippet("live clip verifier uses async clip route", files.liveClipVerifier, "async: true");
requireSnippet(
  "live clip verifier polls status",
  files.liveClipVerifier,
  "/api/telegram/clip/status",
);
requireSnippet(
  "live clip verifier checks HTTPS previews",
  files.liveClipVerifier,
  'previewUrl?.startsWith("https://")',
);
requireSnippet(
  "live clip verifier checks R2 base",
  files.liveClipVerifier,
  "CLOUDFLARE_R2_PUBLIC_URL",
);
requireSnippet(
  "live clip verifier checks preview starts with R2 base",
  files.liveClipVerifier,
  "previewUrl.startsWith(`${r2PublicBase}/`)",
);
forbidSnippet(
  "live clip verifier cannot call publish route",
  files.liveClipVerifier,
  "/api/telegram/publish",
);

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

console.log("PASS telegram route contracts");

function requireSnippet(name: string, content: string, snippet: string) {
  if (!content.includes(snippet)) failures.push(`${name}: missing ${snippet}`);
}

function forbidSnippet(name: string, content: string, snippet: string) {
  if (content.includes(snippet)) failures.push(`${name}: forbidden ${snippet}`);
}
