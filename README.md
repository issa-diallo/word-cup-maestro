# worldCup Viral Shorts Factory

Pipeline Next.js qui transforme un lien YouTube en short vertical 1080x1920,
puis le publie automatiquement sur YouTube Shorts et Instagram Reels via
n8n et Upload-Post.

Deux modes disponibles : **clipping** (decoupe la vraie video source) et
**generation** (cree une video IA originale avec Kling).

**Positionnement actuel :** le parcours recommande est le **clipping reel**. Le mode
**generation** reste disponible pour experimentation/legacy, mais les validations
production et le workflow Telegram/n8n doivent prioriser la generation de previews
clipping sans publication automatique.

## Mode clipping (principal)

Workflow valide en dry-run le 2026-06-13 :

1. telechargement de la video YouTube source avec yt-dlp ;
2. transcription avec timestamps mot par mot via OpenAI Whisper ;
3. identification des segments viraux avec GPT-4o ;
4. decoupe des segments avec FFmpeg ;
5. recadrage vertical 1080x1920 avec FFmpeg ;
6. sous-titres animes style TikTok (fenetre de 3 mots, mot actif en jaune) ;
7. upload du MP4 final sur Cloudflare R2 ;
8. envoi du payload a n8n ;
9. publication par Upload-Post sur YouTube et Instagram.

## Mode generation (legacy / secondaire)

Workflow prod valide le 2026-06-12 :

1. recuperation des metadonnees YouTube ;
2. generation du concept, script, titre, description et hashtags avec OpenAI ;
3. voix off avec ElevenLabs, avec fallback OpenAI TTS ;
4. clip video IA avec Kling ;
5. rendu MP4 vertical 1080x1920 avec FFmpeg ;
6. upload du MP4 final sur Cloudflare R2 ;
7. envoi du payload a n8n ;
8. publication par Upload-Post sur YouTube et Instagram.

Publication validee (2026-06-12) :

- n8n : execution reussie.
- Upload-Post : posts marques `Publiee`.
- YouTube : publication visible avec statistiques API.
- Instagram : publication visible sur le profil connecte.

## Outils utilises

- **Next.js** : application locale et routes API.
- **TypeScript** : typage du pipeline.
- **yt-dlp** : telechargement de la video source YouTube.
- **OpenAI Whisper** : transcription avec timestamps mot par mot.
- **OpenAI GPT-4o** : identification des segments viraux.
- **FFmpeg / ffmpeg-static** : decoupe, recadrage vertical, incrustation sous-titres.
- **OpenAI GPT-4o-mini** : generation de scripts (mode generation).
- **ElevenLabs** : voix off (mode generation).
- **Kling API** : generation video text-to-video (mode generation).
- **Cloudflare R2** : stockage public des MP4 finaux.
- **n8n Hostinger** : orchestration de publication.
- **Upload-Post** : publication vers les comptes sociaux connectes.

## Commandes locales

```bash
npm install
npm run dev
npm run build
npm run typecheck

# clipping
npm run verify:clipping
npm run verify:clipping:real

# generation (legacy)
npm run verify:pipeline
npm run verify:pipeline:4
```

`npm run verify:clipping` lance un dry-run complet sans yt-dlp ni API payante.
Une video mock de 5 secondes est generee localement, la transcription et les
segments sont simules. Les fichiers sont ecrits dans
`output/viral-shorts/<timestamp>/`.

`npm run verify:clipping:real` lance le pipeline reel sur 2 clips sans publier.
Necessite yt-dlp installe et les cles OPENAI, R2, N8N.

## Tester le clipping sans publier

```bash
npm run verify:clipping
```

Ou avec un lien YouTube precis :

```bash
npx tsx scripts/verify-clipping.ts \
  --url "https://youtu.be/..." \
  --mode dry-run \
  --limit 1 \
  --strict
```

## Tester le clipping en prod depuis le PC local

Test reel sans publication :

```bash
npx tsx scripts/verify-clipping.ts \
  --url "https://youtu.be/..." \
  --mode real \
  --limit 2 \
  --no-publish \
  --strict
```

Test reel complet avec publication :

```bash
npx tsx scripts/verify-clipping.ts \
  --url "https://youtu.be/..." \
  --mode real \
  --limit 2 \
  --strict
```

Attention : `mode real` consomme des credits OpenAI et Whisper, declenche
l'upload R2 puis la publication n8n/Upload-Post si `--no-publish` n'est pas
present.

## Tester le mode generation (legacy)

```bash
npx tsx scripts/verify-pipeline.ts \
  --url "https://youtu.be/..." \
  --mode real \
  --limit 1 \
  --strict
```

## API locale

### Clipping

- `POST /api/clip` avec `{ "url": "...", "mode": "dry-run", "limit": 1 }`
- `POST /api/pipeline` avec `{ "url": "...", "type": "clipping", "mode": "dry-run", "limit": 1 }`

Exemple sans publication :

```bash
curl -X POST http://localhost:3000/api/clip \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://youtu.be/...",
    "mode": "real",
    "limit": 2,
    "publish": false,
    "platforms": ["instagram", "youtube"]
  }'
```

Les routes publiques/locales `/api/clip` et `/api/pipeline` ne publient pas en
`mode: "real"`. La publication reelle en production passe par
`/api/telegram/publish`, avec authentification et confirmation humaine
explicite.

### Generation (legacy)

- `POST /api/analyze` avec `{ "url": "...", "mode": "dry-run" }`
- `POST /api/voice` avec `{ "script": "...", "mode": "dry-run" }`
- `POST /api/publish` avec `{ "video_url": "...", "title": "...", "mode": "dry-run" }`
- `POST /api/pipeline` avec `{ "url": "...", "type": "generation", "mode": "dry-run", "limit": 1 }`

`/api/publish` est limite au dry-run. Une requete `mode: "real"` retourne
`403`; utiliser `/api/telegram/publish` apres validation humaine pour publier
reellement.

## Variables d'environnement

Les secrets restent dans `.env` et ne doivent pas etre commites.

Variables clipping :

```env
OPENAI_API_KEY=

CLOUDFLARE_R2_ACCOUNT_ID=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET=
CLOUDFLARE_R2_PUBLIC_URL=

N8N_WEBHOOK_URL=
UPLOAD_POST_API_KEY=
UPLOAD_POST_USER=
```

Variables generation (legacy) :

```env
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
OPENAI_TTS_MODEL=
OPENAI_TTS_VOICE=

KLING_API_KEY_access_token=
KLING_API_KEY_secret_key=
KLING_MODEL_NAME=
```

Notes importantes :

- `CLOUDFLARE_R2_ACCOUNT_ID` doit etre uniquement l'ID du compte Cloudflare,
  pas l'URL complete.
- `CLOUDFLARE_R2_BUCKET` vaut actuellement `worldcup01`.
- `CLOUDFLARE_R2_PUBLIC_URL` doit pointer vers l'URL publique R2 active.
- yt-dlp doit etre installe sur la machine (`pip install yt-dlp`) ou place
  dans `bin/yt-dlp`. Pas necessaire en dry-run.
- Kling demande un pack API video actif, pas seulement un pack image.

## Processus detaille — clipping

1. `downloadYoutubeVideo` telecharge la video source via yt-dlp au format
   MP4 H264. En dry-run, genere un MP4 mock de 5 secondes sans appel reseau.
2. `transcribeVideo` envoie la video a OpenAI Whisper avec
   `timestamp_granularities: ["word"]`. La langue est auto-detectee.
   En dry-run, retourne une transcription simulee.
3. `identifyViralSegments` envoie la transcription horodatee a GPT-4o qui
   identifie 3 a 6 segments de 30 a 90 secondes. Valide que les bornes
   `start`/`end` sont dans la duree totale.
4. `cutSegment` decoupe chaque segment avec FFmpeg. Utilise le stream copy
   si la source est H264, sinon reencode en libx264.
5. `cropToVertical` recadre en 1080x1920 avec le filtre
   `crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920`.
6. `generateAssSubtitles` genere un fichier `.ass` avec une fenetre glissante
   de 3 mots : mot actif en jaune, voisins en blanc.
7. `burnSubtitles` incrustre les sous-titres via le filtre FFmpeg `ass=`.
8. `uploadRenderToR2` envoie le MP4 final sur Cloudflare R2.
9. `publishViaN8n` envoie le payload a n8n qui transmet a Upload-Post.

## Processus detaille — generation (legacy)

1. `getYoutubeContext` recupere les metadonnees YouTube.
2. `generateShorts` genere 4 shorts structures avec GPT-4o-mini.
3. `generateVoiceover` tente ElevenLabs en priorite, fallback OpenAI TTS.
4. `generateVideoClip` cree un job Kling, poll le resultat, telecharge le MP4.
5. `renderShortMp4` combine clip et voix avec FFmpeg en MP4 1080x1920.
6. `uploadRenderToR2` envoie le MP4 final sur Cloudflare R2.
7. `publishViaN8n` envoie le payload a n8n.

## Sorties

Chaque run cree un dossier :

```text
output/viral-shorts/<timestamp>/
  report.partial.json       — rapport en cours d'execution
  report.json               — rapport final
  transcript.json           — transcription avec timestamps
  segments.json             — segments viraux identifies
  clips/source/*.mp4        — video source telechargee
  clips/raw/*.mp4           — segments decoupes bruts
  clips/vertical/*.mp4      — segments recadres 1080x1920
  clips/subtitles/*.ass     — fichiers sous-titres
  clips/final/*.mp4         — clips finaux avec sous-titres
  publishing/*.json         — payload n8n (dry-run) ou reponse n8n
```

## Points d'attention

- Les routes API locales acceptent `mode: "real"` pour analyser, clipper,
  rendre et uploader, mais ne publient pas reellement.
- La publication reelle sur YouTube et Instagram passe par
  `/api/telegram/publish`, protegee par `TELEGRAM_AGENT_SECRET` et
  `confirmed: true`.
- Whisper auto-detecte la langue. Pour forcer une langue, passer `language`
  dans les options de `transcribeVideo`.
- Avant l'appel Whisper, la video est convertie en MP3 mono 16 kHz / 24 kbps
  via FFmpeg. Une garde a 24 MiB bloque les videos trop longues avec un
  message explicite plutot qu'un 413.
- La decoupe FFmpeg avec stream copy peut introduire un decalage d'une
  seconde aux bornes du segment. Acceptable pour du clipping court.
- Upload-Post peut publier immediatement ou planifier selon ses slots de queue.
- Kling peut prendre plus de 2 minutes (mode generation uniquement).

## Historique des validations

- **2026-06-13** : pipeline clipping valide en real sans publication
  (video `YQoCE9_WgAs` 187s, Whisper 456 mots / 23 segments, 2 clips
  1080x1920 avec sous-titres, upload R2 OK, strict pass).
- **2026-06-13** : pipeline clipping valide en dry-run (mock source 5s,
  transcription simulee, clip 1080x1920, sous-titres ASS, report.json).
- **2026-06-12** : pipeline generation valide en prod (OpenAI, ElevenLabs,
  Kling, FFmpeg, R2, n8n, Upload-Post, YouTube, Instagram).

## Workflow Telegram / n8n

Le workflow conversationnel passe par n8n et Telegram. L'app Next expose deux
routes dediees. En local, n8n peut utiliser `APP_URL_LOCAL`, par exemple une
URL Cloudflare Tunnel vers `localhost:3000`. En production, n8n doit utiliser
`APP_URL_PROD`, l'URL HTTPS stable du VPS Hostinger.

Processus attendu :

1. Telegram recoit un lien YouTube depuis le chat autorise.
2. n8n valide `TELEGRAM_CHAT_ID`.
3. L'agent IA appelle `POST /api/telegram/clip`.
4. L'app lance le clipping reel avec `publish: false`, upload les MP4 sur R2
   et retourne des previews compactes.
5. L'utilisateur confirme explicitement la publication ou demande une
   planification.
6. n8n appelle `POST /api/telegram/publish` uniquement apres cette validation.

Routes :

- `POST /api/telegram/clip`
  - Authentification : `Authorization: Bearer <TELEGRAM_AGENT_SECRET>`
  - Body : `{ "url": "https://www.youtube.com/watch?v=...", "limit": 3,
"platforms": ["youtube", "instagram"] }`
  - Body asynchrone recommande pour Telegram : `{ "url": "...", "limit": 3,
"platforms": ["youtube", "instagram"], "async": true }`
  - Reponse asynchrone immediate : `{ "status": "queued", "jobId": "..." }`
  - Contraintes : URL YouTube requise, `limit` entre 1 et 6, plateformes
    autorisees `youtube`, `instagram`, `tiktok`.
  - Effet : met le job dans une file en memoire, puis genere et upload les
    previews sans publication. Un seul job Telegram tourne a la fois par
    processus Node.

- `GET /api/telegram/clip/status?jobId=...`
  - Authentification : `Authorization: Bearer <TELEGRAM_AGENT_SECRET>`
  - Reponse pendant le traitement : `{ "status": "queued" | "processing",
"jobId": "...", "queuePosition": 1, "clips": [] }`
  - Reponse finale : `{ "status": "ready", "clips": [...] }` ou une erreur.
  - Usage n8n : envoyer d'abord un message Telegram "Je prepare les clips",
    puis verifier ce statut jusqu'a `ready` ou `failed`.

- `POST /api/telegram/publish`
  - Authentification : `Authorization: Bearer <TELEGRAM_AGENT_SECRET>`
  - Body : `{ "clips": [{ "id": "clip-1", "title": "...",
"description": "...", "hashtags": ["#football"],
  "videoUrl": "https://..." }], "platforms": ["youtube", "instagram"],
  "confirmed": true }`
  - Contraintes : 1 a 6 clips, `videoUrl` HTTPS publique, plateformes
    autorisees `youtube`, `instagram`, `tiktok`, `videoUrl` sous
    `CLOUDFLARE_R2_PUBLIC_URL`, confirmation humaine explicite via
    `confirmed: true`.
  - Effet : appelle `publishViaN8n`, donc peut publier reellement.

Variables requises cote app :

```env
TELEGRAM_AGENT_SECRET=
APP_URL_LOCAL=
APP_URL_PROD=https://api.example.com
NODE_ENV=production
OPENAI_API_KEY=
CLOUDFLARE_R2_ACCOUNT_ID=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET=
CLOUDFLARE_R2_PUBLIC_URL=
N8N_WEBHOOK_URL=
CLIPPING_MAX_SOURCE_SECONDS=900
TELEGRAM_CLIP_MAX_QUEUED_JOBS=10
```

Deploiement VPS :

- Exemple d'environnement sans secrets : `.env.example`
- Exemple PM2 : `deploy/ecosystem.config.cjs`
  - PM2 est volontairement configure en instance unique tant que la file
    Telegram reste en memoire.
- Exemple Nginx : `deploy/nginx/worldcup.conf`
- Runbook n8n prod : `deploy/n8n-production-tools.md`
- Verification VPS : `npm run verify:vps`
- Healthcheck : `GET /api/health`
- Les scripts de deploiement refusent les domaines invalides, les placeholders
  comme `api.example.com`, et un `APP_URL_PROD` qui n'est pas HTTPS.
- `npm run verify:vps` controle les valeurs non secretes importantes sans
  afficher les secrets : URLs publiques HTTPS, `NODE_ENV=production`, duree
  max et taille de file positives.
- `deploy/deploy-app.sh` peut aussi lancer le test live de clipping/R2 si
  `YOUTUBE_TEST_URL` est fourni.
- `npm run collect:cutover-evidence` genere un rapport local ignore par Git
  sous `deploy/evidence/` apres les verifications VPS/prod.

Test rapide du tunnel :

```bash
curl "$APP_URL_LOCAL"
```

Test rapide de production :

```bash
npm run verify:telegram:prod -- "$APP_URL_PROD"
```

Cette commande verifie que l'URL est bien HTTPS, teste `/api/health` sans
cache, le refus des appels Telegram sans token, le refus d'un mauvais token sur
les routes Telegram, et le blocage de `/api/publish` en `mode: "real"`. Si
`TELEGRAM_AGENT_SECRET` est present dans l'environnement local, elle teste
aussi une requete autorisee sans lancer de clipping et une publication
confirmee avec URL externe non-R2, qui doit etre refusee avant n8n.

Test live de generation de preview sur le VPS :

```bash
npm run verify:telegram:clip-live -- \
  --url "$APP_URL_PROD" \
  --youtube "https://www.youtube.com/watch?v=VIDEO_ID"
```

Cette commande lance volontairement un vrai clipping asynchrone, poll le statut
jusqu'a `ready` ou `failed`, puis verifie qu'au moins une preview publique
HTTPS sous `CLOUDFLARE_R2_PUBLIC_URL` est retournee. Elle ne publie rien.

Test de generation de previews sans publication :

```bash
curl -X POST "$APP_URL_LOCAL/api/telegram/clip" \
  -H "Authorization: Bearer $TELEGRAM_AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=...",
    "limit": 1,
    "platforms": ["youtube", "instagram"],
    "async": true
  }'

curl "$APP_URL_LOCAL/api/telegram/clip/status?jobId=<jobId>" \
  -H "Authorization: Bearer $TELEGRAM_AGENT_SECRET"
```

Notes de securite :

- Ne jamais exposer `TELEGRAM_AGENT_SECRET`, les webhooks n8n, les cles R2,
  les cles Supabase service role ou les identifiants Upload-Post.
- `APP_URL_LOCAL` change si le tunnel Cloudflare est relance.
- `APP_URL_PROD` doit etre utilise par n8n en production a la place de
  `APP_URL_LOCAL`.
- Une generation de previews consomme OpenAI/Whisper et upload R2, mais ne
  publie pas.
- `CLIPPING_MAX_SOURCE_SECONDS` limite la duree source acceptee par le clipping
  reel. La valeur par defaut est 900 secondes.
- `TELEGRAM_CLIP_MAX_QUEUED_JOBS` limite les jobs Telegram en attente. La
  valeur par defaut est 10.
- La route `/api/telegram/publish` peut publier reellement. Ne l'appeler que
  depuis n8n apres confirmation explicite dans Telegram, avec
  `confirmed: true`.
