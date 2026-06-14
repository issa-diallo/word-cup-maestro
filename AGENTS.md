# Agent Instructions

## Commits

- Follow [COMMITS.md](COMMITS.md) for commit message style and workflow.
- Before committing, review the staged diff and keep each commit focused.

## Skills

- Use `$secure-web-dev` for secure web development, vulnerability assessment, and performance optimization in this project.
- Trigger it before changing or reviewing API routes, auth, authorization, environment variables, secrets, external API calls, webhooks, file uploads, caching, headers, request validation, logging, dependency updates, or production readiness work.
- When using it, prefer narrow fixes, project-native commands, and a final report that includes validation performed plus any remaining security or performance risks.

## Telegram automation

- The n8n/Telegram workflow uses the local Next app through `APP_URL_LOCAL`,
  usually a Cloudflare Tunnel URL pointing to `localhost:3000`.
- `APP_URL_LOCAL` is valid only while both `npm run dev` and the
  `cloudflared tunnel --url http://localhost:3000` process are running.
- `POST /api/telegram/clip` must stay authenticated with
  `Authorization: Bearer <TELEGRAM_AGENT_SECRET>` and must generate previews
  with `publish: false`; receiving a YouTube URL must never publish.
- `POST /api/telegram/publish` is the only Telegram-agent route that can call
  n8n/Upload-Post, and it should be used only after explicit human
  confirmation from Telegram.
- Do not log, print, commit, or include `TELEGRAM_AGENT_SECRET`, n8n webhook
  URLs, R2 keys, Supabase service role keys, or Upload-Post credentials in
  documentation or test output.
