# n8n production tools

Use these definitions when switching the Telegram agent from the local
Cloudflare Tunnel to the Hostinger VPS.

## Required variables

Store these as n8n variables or credentials:

```env
APP_URL_PROD=https://api.example.com
TELEGRAM_AGENT_SECRET=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

If the workflow uses Supabase memory, also configure:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Do not send webhook URLs, tokens, R2 keys, Supabase service role keys, or stack
traces back to Telegram.

## create_clip_previews

HTTP request:

```http
POST {{$env.APP_URL_PROD}}/api/telegram/clip
Authorization: Bearer {{$env.TELEGRAM_AGENT_SECRET}}
Content-Type: application/json
```

Body:

```json
{
  "url": "={{ $json.youtubeUrl }}",
  "limit": 1,
  "platforms": ["youtube", "instagram"],
  "async": true
}
```

Expected immediate success:

```json
{
  "status": "queued",
  "jobId": "..."
}
```

Telegram response immediately after this call:

```text
Je prepare les clips. Je te reponds des que les previews sont pretes.
```

## get_clip_status

HTTP request:

```http
GET {{$env.APP_URL_PROD}}/api/telegram/clip/status?jobId={{$json.jobId}}
Authorization: Bearer {{$env.TELEGRAM_AGENT_SECRET}}
```

Poll every 20 to 30 seconds until `ready` or `failed`. A job can remain
`queued` while another clipping job is already running on the Node process. If
present, use `queuePosition` to tell the user the job is still waiting.

When `ready`, store the returned clips in the workflow memory and send the
preview URLs to Telegram with choices for publishing now, scheduling, or
canceling.

When `failed`, send only a short user-safe error message. Do not send raw
stacks or internal logs.

## publish_clips

HTTP request:

```http
POST {{$env.APP_URL_PROD}}/api/telegram/publish
Authorization: Bearer {{$env.TELEGRAM_AGENT_SECRET}}
Content-Type: application/json
```

Body:

```json
{
  "confirmed": true,
  "clips": "={{ $json.readyClips }}",
  "platforms": ["youtube", "instagram"]
}
```

Only call this tool after a clear human confirmation from Telegram, such as a
button click or a phrase like `publie maintenant`. Receiving a YouTube URL is
never a publish confirmation. The request must include `confirmed: true`, set
only on the explicit confirmation branch.

The `clips` array must come from the latest `ready` status response. Each
`videoUrl` must be the HTTPS `previewUrl` returned by the app, under the
configured `CLOUDFLARE_R2_PUBLIC_URL`; arbitrary external video URLs are
rejected by `/api/telegram/publish`.

## Validation checklist

- `validate_user` rejects any chat id different from `TELEGRAM_CHAT_ID`.
- All HTTP request nodes use `APP_URL_PROD`, not `APP_URL_LOCAL`.
- All three app routes include the bearer authorization header.
- The YouTube-link path calls `create_clip_previews` with `async: true`.
- The workflow polls `get_clip_status` before showing previews.
- The publish node is reachable only from the explicit confirmation branch.
- The publish request body includes `confirmed: true` only on that branch.
- The publish request body uses only `previewUrl` values returned by
  `get_clip_status`.
- Telegram messages never include secrets, private webhook URLs, or stack
  traces.
