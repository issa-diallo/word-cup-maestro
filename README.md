# worldCup Viral Shorts Factory

Pipeline Next.js qui transforme un lien YouTube en concepts de shorts, voix
off, clips video, MP4 verticaux, URL Cloudflare R2 et payload de publication
n8n/Upload-Post.

## Commandes

```bash
npm run dev
npm run build
npm run typecheck
npm run verify:pipeline
npm run verify:pipeline:4
```

`npm run verify:pipeline` lance un dry-run limite a 1 short. Il ne consomme pas
les APIs payantes et ne publie rien. Les rapports et medias generes sont ecrits
dans `output/viral-shorts/<timestamp>/`.

`npm run verify:pipeline:4` lance la verification stricte du prompt manager :
4 scripts, 4 MP3, 4 clips, 4 MP4 1080x1920 avec audio, 4 URLs R2 calculees et
4 payloads n8n dry-run.

## API

- `POST /api/analyze` avec `{ "url": "...", "mode": "dry-run" }`
- `POST /api/voice` avec `{ "script": "...", "mode": "dry-run" }`
- `POST /api/publish` avec `{ "video_url": "...", "title": "...", "mode": "dry-run" }`
- `POST /api/pipeline` avec `{ "url": "...", "mode": "dry-run", "limit": 1 }`

Utilise `mode: "real"` uniquement pour consommer les providers configures dans
`.env` : OpenAI/ElevenLabs, Kling, Cloudflare R2 et n8n.

## Limites actuelles

- Le dry-run produit des medias mock lisibles pour garder le pipeline testable.
- Le rendu MP4 utilise `ffmpeg-static`; le binaire embarque ne fournit pas
  `drawtext`, donc les sous-titres visuels reels demandent une etape
  supplementaire.
- Les secrets `.env` ne sont pas affiches par les scripts de verification.
