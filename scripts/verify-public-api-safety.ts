import { readFileSync } from "node:fs";

const files = {
  clipRoute: readFileSync("app/api/clip/route.ts", "utf8"),
  pipelineRoute: readFileSync("app/api/pipeline/route.ts", "utf8"),
  publishRoute: readFileSync("app/api/publish/route.ts", "utf8"),
};

const failures: string[] = [];

requireSnippet("public clip route never publishes", files.clipRoute, "publish: false");
forbidSnippet("public clip route cannot publish by default", files.clipRoute, "publish !== false");
forbidSnippet("public clip route cannot call n8n directly", files.clipRoute, "publishViaN8n");

requireSnippet(
  "public pipeline route disables real-mode publish",
  files.pipelineRoute,
  'publish: mode === "real" ? false : publish === true',
);
forbidSnippet(
  "public pipeline route cannot publish by default",
  files.pipelineRoute,
  "publish !== false",
);
forbidSnippet(
  "public pipeline route cannot call n8n directly",
  files.pipelineRoute,
  "publishViaN8n",
);

requireSnippet(
  "public publish route rejects real mode",
  files.publishRoute,
  'getPipelineMode(mode) === "real"',
);
requireSnippet(
  "public publish route explains Telegram publish path",
  files.publishRoute,
  "Publication reelle disponible uniquement via /api/telegram/publish.",
);
requireSnippet("public publish route only dry-runs", files.publishRoute, 'mode: "dry-run"');

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

console.log("PASS public API safety");

function requireSnippet(name: string, content: string, snippet: string) {
  if (!content.includes(snippet)) failures.push(`${name}: missing ${snippet}`);
}

function forbidSnippet(name: string, content: string, snippet: string) {
  if (content.includes(snippet)) failures.push(`${name}: forbidden ${snippet}`);
}
