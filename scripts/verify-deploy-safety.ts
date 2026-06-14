import { readFileSync } from "node:fs";

const files = {
  deployApp: readFileSync("deploy/deploy-app.sh", "utf8"),
  configureNginx: readFileSync("deploy/configure-nginx.sh", "utf8"),
  setupVps: readFileSync("deploy/setup-hostinger-vps.sh", "utf8"),
  verifyVps: readFileSync("deploy/verify-vps-prereqs.sh", "utf8"),
  evidence: readFileSync("deploy/collect-cutover-evidence.sh", "utf8"),
  gitignore: readFileSync(".gitignore", "utf8"),
};

const failures: string[] = [];

requireSnippet("deploy app validates domain", files.deployApp, "validate_domain");
requireSnippet("deploy app validates APP_URL_PROD", files.deployApp, "validate_app_url_prod");
requireSnippet("deploy app requires HTTPS production URL", files.deployApp, "^https://");
requireSnippet("deploy app rejects example placeholder", files.deployApp, "example.com");
requireSnippet("deploy app supports live clip URL", files.deployApp, "YOUTUBE_TEST_URL");
requireSnippet(
  "deploy app can run live clip verifier",
  files.deployApp,
  "npm run verify:telegram:clip-live -- --url",
);

requireSnippet("nginx config validates domain", files.configureNginx, "validate_domain");
requireSnippet("setup script validates domain", files.setupVps, "validate_domain");

requireSnippet(
  "evidence collector requires APP_URL_PROD",
  files.evidence,
  "APP_URL_PROD is required",
);
requireSnippet("evidence collector runs vps verifier", files.evidence, "npm run verify:vps");
requireSnippet(
  "evidence collector runs public smoke verifier",
  files.evidence,
  "npm run verify:telegram:prod",
);
requireSnippet(
  "evidence collector can run live clip verifier",
  files.evidence,
  "npm run verify:telegram:clip-live",
);
requireSnippet(
  "evidence collector warns about secrets",
  files.evidence,
  "should not contain secrets",
);
requireSnippet("evidence reports ignored by git", files.gitignore, "deploy/evidence/");

requireSnippet("vps verifier reads env without printing values", files.verifyVps, "read_env_value");
requireSnippet(
  "vps verifier checks APP_URL_PROD HTTPS",
  files.verifyVps,
  'check_env_https_url "APP_URL_PROD"',
);
requireSnippet(
  "vps verifier checks R2 public URL HTTPS",
  files.verifyVps,
  'check_env_https_url "CLOUDFLARE_R2_PUBLIC_URL"',
);
requireSnippet(
  "vps verifier checks NODE_ENV production",
  files.verifyVps,
  'check_env_equals "NODE_ENV" "production"',
);
requireSnippet(
  "vps verifier checks clipping duration integer",
  files.verifyVps,
  'check_env_positive_integer "CLIPPING_MAX_SOURCE_SECONDS"',
);
requireSnippet(
  "vps verifier checks queue integer",
  files.verifyVps,
  'check_env_positive_integer "TELEGRAM_CLIP_MAX_QUEUED_JOBS"',
);

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

console.log("PASS deploy safety");

function requireSnippet(name: string, content: string, snippet: string) {
  if (!content.includes(snippet)) failures.push(`${name}: missing ${snippet}`);
}
