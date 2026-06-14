# Hostinger VPS deploy helpers

These files support `AUTOMATION_PLAN.md` without storing secrets in Git.

- `setup-hostinger-vps.sh`: installs Ubuntu packages, Node.js, yt-dlp, PM2,
  and firewall rules. If the app is already cloned, it also configures Nginx.
- `deploy-app.sh`: clones or updates the app, runs checks/build, starts or
  reloads PM2, and runs production verifiers. Pass `DOMAIN=...` to configure
  Nginx during deployment.
- `configure-nginx.sh`: writes the Nginx reverse proxy config and can run
  Certbot after DNS is ready.
- `cleanup-output.sh`: dry-runs or deletes old generated files under
  `output/viral-shorts` only.
- `collect-cutover-evidence.sh`: writes a local Markdown evidence report under
  ignored `deploy/evidence/` after the VPS checks pass.
- `verify-local-prod.sh`: runs local/static production checks, dependency
  audit, and the Next production build.
- `ecosystem.config.cjs`: PM2 process definition for the Next app.
  It intentionally runs one forked instance because the Telegram clipping queue
  is in memory per Node process.
- `nginx/worldcup.conf`: Nginx reverse proxy template. Replace
  `api.example.com` with the production subdomain before enabling it.
- `verify-vps-prereqs.sh`: run on the VPS after setup to confirm required
  commands, non-empty env keys, PM2 presence, local health, and Telegram auth
  guards.
- Deploy scripts reject invalid DNS hostnames, placeholder production URLs, and
  non-HTTPS `APP_URL_PROD` values before touching PM2.
- `verify-vps-prereqs.sh` validates non-secret env values such as
  `NODE_ENV`, `APP_URL_PROD`, `CLOUDFLARE_R2_PUBLIC_URL`, and numeric
  queue/duration limits without printing secret values.

Example on the VPS after the repo is cloned to `/var/www/worldcup`:

```bash
cd /var/www/worldcup
DOMAIN=api.your-domain.com bash deploy/setup-hostinger-vps.sh
npm run verify:prod:local
DOMAIN=api.your-domain.com APP_URL_PROD=https://api.your-domain.com bash deploy/deploy-app.sh
bash deploy/verify-vps-prereqs.sh
npm run verify:telegram:prod -- "$APP_URL_PROD"
npm run verify:telegram:clip-live -- --url "$APP_URL_PROD" --youtube "https://www.youtube.com/watch?v=VIDEO_ID"
```

The scripts report whether sensitive env keys are present, but they never print
secret values.

`verify:telegram:prod` is a cheap smoke check and does not clip or publish. If
`TELEGRAM_AGENT_SECRET` is set, it also verifies that a confirmed publish
request with a non-R2 video URL is rejected before n8n can be called.
`verify:telegram:clip-live` intentionally runs one real async clipping job,
waits for a ready status, and verifies public HTTPS preview URLs under
`CLOUDFLARE_R2_PUBLIC_URL` without calling the publish route.

To include that live clipping proof in `deploy-app.sh`, pass:

```bash
YOUTUBE_TEST_URL="https://www.youtube.com/watch?v=VIDEO_ID" \
DOMAIN=api.your-domain.com \
APP_URL_PROD=https://api.your-domain.com \
bash deploy/deploy-app.sh
```

After the production cutover, collect a local evidence report:

```bash
APP_URL_PROD=https://api.your-domain.com \
YOUTUBE_TEST_URL="https://www.youtube.com/watch?v=VIDEO_ID" \
npm run collect:cutover-evidence
```

Evidence reports are ignored by Git. Review them before sharing; they should
not contain secrets.

Output cleanup is dry-run by default:

```bash
npm run cleanup:output
DELETE=true MAX_AGE_DAYS=3 npm run cleanup:output
```

Example cron after a manual dry-run looks correct:

```cron
17 3 * * * cd /var/www/worldcup && DELETE=true MAX_AGE_DAYS=3 npm run cleanup:output >> /var/log/worldcup-cleanup.log 2>&1
```

For a first deploy where the repo is not cloned yet, run this from any checkout
that already contains the `deploy/` directory:

```bash
REPO_URL=https://github.com/owner/repo.git \
APP_URL_PROD=https://api.your-domain.com \
bash deploy/deploy-app.sh
```
