# worldCup Viral Shorts Factory

Pipeline Next.js qui transforme un lien YouTube en short vertical original,
puis le publie automatiquement sur YouTube Shorts et Instagram Reels via
n8n et Upload-Post.

## Etat actuel

Workflow prod valide le 2026-06-12 depuis le PC local :

1. lien YouTube source ;
2. generation du concept, script, titre, description et hashtags avec OpenAI ;
3. voix off avec ElevenLabs, avec fallback OpenAI TTS ;
4. clip video IA avec Kling ;
5. rendu MP4 vertical 1080x1920 avec FFmpeg ;
6. upload du MP4 final sur Cloudflare R2 ;
7. envoi du payload a n8n ;
8. publication par Upload-Post sur YouTube et Instagram.

Publication validee :

- n8n : execution reussie.
- Upload-Post : posts marques `Publiee`.
- YouTube : publication visible avec statistiques API.
- Instagram : publication visible sur le profil connecte.

## Outils utilises

- **Next.js** : application locale et routes API.
- **TypeScript** : typage du pipeline.
- **OpenAI** : generation des scripts et fallback voix.
- **ElevenLabs** : voix off principale.
- **Kling API** : generation video text-to-video.
- **FFmpeg / ffmpeg-static** : assemblage clip + voix en MP4 vertical.
- **Cloudflare R2** : stockage public des MP4 finaux.
- **n8n Hostinger** : orchestration de publication.
- **Upload-Post** : publication vers les comptes sociaux connectes.

## Commandes locales

```bash
npm install
npm run dev
npm run build
npm run typecheck
npm run verify:pipeline
npm run verify:pipeline:4
```

`npm run verify:pipeline` lance un dry-run limite a 1 short. Il ne consomme pas
les APIs payantes et ne publie rien. Les rapports et medias generes sont ecrits
dans `output/viral-shorts/<timestamp>/`.

`npm run verify:pipeline:4` lance la verification stricte sur 4 shorts :
scripts, MP3, clips, MP4 1080x1920 avec audio, URLs R2 calculees et payloads
n8n dry-run.

## Tester sans publier

```bash
npm run verify:pipeline
```

Ou avec un lien YouTube precis :

```bash
npx tsx scripts/verify-pipeline.ts \
  --url "https://youtu.be/..." \
  --mode dry-run \
  --limit 1 \
  --strict
```

## Tester en prod depuis le PC local

Test reel sans publication :

```bash
npx tsx scripts/verify-pipeline.ts \
  --url "https://youtu.be/..." \
  --mode real \
  --limit 1 \
  --no-publish \
  --strict
```

Test reel complet avec publication :

```bash
npx tsx scripts/verify-pipeline.ts \
  --url "https://youtu.be/..." \
  --mode real \
  --limit 1 \
  --strict
```

Attention : `mode real` consomme des credits OpenAI, ElevenLabs, Kling et
declenche l'upload R2 puis la publication n8n/Upload-Post si `--no-publish`
n'est pas present.

## API locale

- `POST /api/analyze` avec `{ "url": "...", "mode": "dry-run" }`
- `POST /api/voice` avec `{ "script": "...", "mode": "dry-run" }`
- `POST /api/publish` avec `{ "video_url": "...", "title": "...", "mode": "dry-run" }`
- `POST /api/pipeline` avec `{ "url": "...", "mode": "dry-run", "limit": 1 }`

Exemple :

```bash
curl -X POST http://localhost:3000/api/pipeline \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://youtu.be/...",
    "mode": "real",
    "limit": 1,
    "publish": true,
    "platforms": ["instagram", "youtube"]
  }'
```

## Variables d'environnement

Les secrets restent dans `.env` et ne doivent pas etre commites.

Variables principales :

```env
OPENAI_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
OPENAI_TTS_MODEL=
OPENAI_TTS_VOICE=

KLING_API_KEY_access_token=
KLING_API_KEY_secret_key=
KLING_MODEL_NAME=

CLOUDFLARE_R2_ACCOUNT_ID=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET=
CLOUDFLARE_R2_PUBLIC_URL=

N8N_WEBHOOK_URL=
UPLOAD_POST_API_KEY=
UPLOAD_POST_USER=
```

Notes importantes :

- `CLOUDFLARE_R2_ACCOUNT_ID` doit etre uniquement l'ID du compte Cloudflare,
  pas l'URL complete.
- `CLOUDFLARE_R2_BUCKET` vaut actuellement `worldcup01`.
- `CLOUDFLARE_R2_PUBLIC_URL` doit pointer vers l'URL publique R2 active.
- Kling demande un pack API video actif, pas seulement un pack image.

## Processus detaille

1. `getYoutubeContext` recupere les metadonnees YouTube.
2. `generateShorts` genere 4 shorts structures. Le code normalise les champs
   OpenAI, notamment les hashtags.
3. `generateVoiceover` tente ElevenLabs en priorite. Si ElevenLabs refuse et
   qu'OpenAI est disponible, OpenAI TTS sert de fallback.
4. `generateVideoClip` cree un job Kling, poll le resultat, puis telecharge le
   clip MP4 localement.
5. `renderShortMp4` combine le clip et la voix off avec FFmpeg en MP4
   1080x1920.
6. `uploadRenderToR2` envoie le MP4 final sur Cloudflare R2 et verifie l'URL
   publique.
7. `publishViaN8n` envoie a n8n un payload avec `video_url`, `title`,
   `description`, `hashtags`, `platforms` et `request_id`.
8. n8n transmet a Upload-Post, qui publie sur les plateformes connectees au
   profil `worldcup01`.

## Sorties

Chaque run cree un dossier :

```text
output/viral-shorts/<timestamp>/
```

Contenu typique :

- `report.partial.json` pendant l'execution ;
- `report.json` a la fin ;
- `audio/*.mp3` ;
- `clips/*.mp4` ;
- `final/*.mp4` ;
- `publishing/*.json` en dry-run ou reponse n8n.

## Points d'attention

- Les routes API locales acceptent `mode: "real"`. Ne pas exposer l'app
  publiquement sans authentification, limitation de debit et controle d'acces.
- `mode: "real"` peut publier reellement sur YouTube et Instagram.
- Kling peut prendre plus de 2 minutes. Le pipeline poll plus longtemps, mais
  une reprise par job ID serait utile pour eviter de recreer une video.
- Upload-Post peut publier immediatement ou planifier selon ses slots de queue.
- Le rendu utilise `ffmpeg-static`; les overlays texte reels restent limites si
  le binaire ne fournit pas `drawtext`.

## Verification prod du 2026-06-12

Dernier workflow valide :

- script OpenAI : OK ;
- voix ElevenLabs : OK ;
- video Kling : OK ;
- rendu MP4 final : OK ;
- upload R2 : OK ;
- webhook n8n : OK ;
- Upload-Post : OK ;
- YouTube : OK ;
- Instagram : OK.

Problemes rencontres et corriges :

- hashtags OpenAI parfois renvoyes comme string au lieu de tableau ;
- fallback voix ElevenLabs vers OpenAI TTS ;
- telechargement local du clip Kling avant rendu ;
- `CLOUDFLARE_R2_ACCOUNT_ID` incorrect dans `.env`.
