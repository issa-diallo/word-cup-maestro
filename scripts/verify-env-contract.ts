import { readFileSync } from "node:fs";

const requiredAppEnvKeys = [
  "OPENAI_API_KEY",
  "CLOUDFLARE_R2_ACCOUNT_ID",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  "CLOUDFLARE_R2_BUCKET",
  "CLOUDFLARE_R2_PUBLIC_URL",
  "N8N_WEBHOOK_URL",
  "TELEGRAM_AGENT_SECRET",
  "APP_URL_PROD",
  "NODE_ENV",
  "CLIPPING_MAX_SOURCE_SECONDS",
  "TELEGRAM_CLIP_MAX_QUEUED_JOBS",
];

const failures: string[] = [];
const envExample = readFileSync(".env.example", "utf8");
const vpsVerifier = readFileSync("deploy/verify-vps-prereqs.sh", "utf8");
const automationPlan = readFileSync("AUTOMATION_PLAN.md", "utf8");
const readme = readFileSync("README.md", "utf8");

for (const key of requiredAppEnvKeys) {
  requireLine(".env.example", envExample, `${key}=`);
  requireSnippet("deploy/verify-vps-prereqs.sh", vpsVerifier, `check_env_key "${key}"`);
  requireSnippet("AUTOMATION_PLAN.md", automationPlan, key);
  requireSnippet("README.md", readme, key);
}

for (const [key, expected] of [
  ["NODE_ENV", "production"],
  ["CLIPPING_MAX_SOURCE_SECONDS", "900"],
  ["TELEGRAM_CLIP_MAX_QUEUED_JOBS", "10"],
] as const) {
  requireLine(".env.example", envExample, `${key}=${expected}`);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

console.log("PASS env contract");

function requireLine(fileName: string, content: string, linePrefix: string) {
  if (!content.split(/\r?\n/).some((line) => line.startsWith(linePrefix))) {
    failures.push(`${fileName}: missing line ${linePrefix}`);
  }
}

function requireSnippet(fileName: string, content: string, snippet: string) {
  if (!content.includes(snippet)) failures.push(`${fileName}: missing ${snippet}`);
}
