#!/usr/bin/env bash
set -euo pipefail

printf '==> Checking deploy shell scripts\n'
bash -n deploy/configure-nginx.sh
bash -n deploy/setup-hostinger-vps.sh
bash -n deploy/deploy-app.sh
bash -n deploy/verify-vps-prereqs.sh
bash -n deploy/collect-cutover-evidence.sh
bash -n deploy/cleanup-output.sh

printf '==> Running TypeScript and lint checks\n'
npm run typecheck
npm run lint

printf '==> Running production contract verifiers\n'
npm run verify:clipping:guards
npm run verify:deploy
npm run verify:env
npm run verify:pm2
npm run verify:public-api
npm run verify:n8n:prod
npm run verify:telegram:auth
npm run verify:telegram:queue
npm run verify:telegram:contracts

printf '==> Auditing dependencies\n'
npm audit --audit-level=moderate

printf '==> Building production app\n'
npm run build

printf 'Local production verification passed.\n'
