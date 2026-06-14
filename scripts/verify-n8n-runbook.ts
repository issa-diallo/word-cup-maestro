import { readFileSync } from "node:fs";

const runbookPath = "deploy/n8n-production-tools.md";
const content = readFileSync(runbookPath, "utf8");

const requiredSnippets = [
  "POST {{$env.APP_URL_PROD}}/api/telegram/clip",
  "GET {{$env.APP_URL_PROD}}/api/telegram/clip/status?jobId={{$json.jobId}}",
  "POST {{$env.APP_URL_PROD}}/api/telegram/publish",
  '"async": true',
  '"confirmed": true',
  "Receiving a YouTube URL is\nnever a publish confirmation",
  "videoUrl` must be the HTTPS `previewUrl` returned by the app",
  "uses only `previewUrl` values returned by\n  `get_clip_status`",
];

const forbiddenRequestSnippets = [
  "POST {{$env.APP_URL_LOCAL}}",
  "GET {{$env.APP_URL_LOCAL}}",
  "POST {{$json.APP_URL_LOCAL}}",
  "GET {{$json.APP_URL_LOCAL}}",
];

const failures: string[] = [];

for (const snippet of requiredSnippets) {
  if (!content.includes(snippet)) failures.push(`missing required snippet: ${snippet}`);
}

for (const snippet of forbiddenRequestSnippets) {
  if (content.includes(snippet)) failures.push(`forbidden local request snippet: ${snippet}`);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

console.log("PASS n8n production runbook");
