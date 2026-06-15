# n8n Cutover WorldCup

Date: 2026-06-14

Ce document resume ce qui a deja ete fait, ce qui reste a faire dans n8n,
et les tests a lancer apres correction. Ne pas ajouter de secrets dans ce
fichier: pas de token Telegram, pas de webhook prive n8n, pas de cle R2, pas
de credential Upload-Post.

## Etat actuel valide

- Le repo GitHub est a jour sur `main`.
- Le VPS Hostinger est a jour sur le commit `ec7c063`.
- L'application WorldCup tourne en Docker sur le VPS.
- Traefik route correctement vers le container `worldcup-api`.
- L'URL prod HTTPS est valide:

```text
https://worldcup.srv754021.hstgr.cloud
```

- `/api/health` repond en prod avec `HTTP 200`.
- Les checks prod Telegram sont passes:
  - `/api/telegram/clip` refuse les appels sans token.
  - `/api/telegram/clip` refuse les mauvais tokens.
  - `/api/telegram/clip/status` refuse les appels sans token.
  - `/api/telegram/publish` refuse les appels sans token.
  - `/api/telegram/publish` exige une confirmation humaine.
  - `/api/publish` refuse la publication reelle publique.
- `APP_URL_PROD` est maintenant injecte dans le container n8n:

```text
https://worldcup.srv754021.hstgr.cloud
```

- Le workflow n8n actif trouve est:

```text
WorldCup - Publish to Upload-Post
```

Ce workflow sert a publier vers Upload-Post. Il est la derniere etape de
publication. Il ne remplace pas le workflow Telegram conversationnel.

## Ce qui reste a faire dans n8n

### 1. Identifier ou creer le workflow Telegram WorldCup

Il faut un workflow n8n qui fait la conversation Telegram:

- recoit un message Telegram avec une URL YouTube ;
- valide que le chat Telegram est autorise ;
- appelle l'app WorldCup pour generer une preview ;
- attend que la preview R2 soit prete ;
- affiche la preview dans Telegram ;
- demande une confirmation humaine ;
- appelle la publication seulement apres confirmation.

Le workflow `WorldCup - Publish to Upload-Post` ne fait pas cela. Il publie
seulement vers Upload-Post quand l'app l'appelle.

Chercher dans n8n:

```text
telegram
Telegram
WorldCup Telegram
Agent Telegram
```

Si aucun workflow Telegram WorldCup n'existe, en creer un nouveau.

### 2. Configurer les variables n8n

Dans n8n, les nodes doivent utiliser les variables ou credentials, jamais des
secrets colles en clair dans les nodes.

Variables attendues:

```text
APP_URL_PROD
TELEGRAM_AGENT_SECRET
TELEGRAM_CHAT_ID
```

`APP_URL_PROD` est deja injecte dans le container n8n. Verifier dans le VPS:

```bash
docker exec root-n8n-1 printenv APP_URL_PROD
```

Resultat attendu:

```text
https://worldcup.srv754021.hstgr.cloud
```

### 3. Creer l'appel de generation de preview

Node HTTP Request: `create_clip_previews`

```http
POST {{$env.APP_URL_PROD}}/api/telegram/clip
Authorization: Bearer {{$env.TELEGRAM_AGENT_SECRET}}
Content-Type: application/json
```

Body JSON:

```json
{
  "url": "={{ $json.youtubeUrl }}",
  "limit": 1,
  "platforms": ["youtube", "instagram"],
  "async": true
}
```

Resultat attendu:

```json
{
  "status": "queued",
  "jobId": "..."
}
```

Ce node ne publie rien. Il lance uniquement la generation de preview.

### 4. Creer le polling de statut

Node HTTP Request: `get_clip_status`

```http
GET {{$env.APP_URL_PROD}}/api/telegram/clip/status?jobId={{$json.jobId}}
Authorization: Bearer {{$env.TELEGRAM_AGENT_SECRET}}
```

Boucler toutes les 20 a 30 secondes jusqu'a:

```text
ready
failed
```

Quand le statut est `ready`, envoyer les previews a Telegram. Les URLs doivent
etre les `previewUrl` retournees par l'app.

### 5. Creer la confirmation humaine

Apres affichage de la preview, le workflow doit attendre une action explicite:

```text
publie maintenant
```

ou un bouton Telegram equivalent.

Recevoir une URL YouTube ne doit jamais etre considere comme une confirmation
de publication.

### 6. Creer l'appel de publication

Node HTTP Request: `publish_clips`

```http
POST {{$env.APP_URL_PROD}}/api/telegram/publish
Authorization: Bearer {{$env.TELEGRAM_AGENT_SECRET}}
Content-Type: application/json
```

Body JSON:

```json
{
  "confirmed": true,
  "clips": "={{ $json.readyClips }}",
  "platforms": ["youtube", "instagram"]
}
```

Important:

- `confirmed: true` doit etre ajoute seulement dans la branche de confirmation
  humaine.
- `clips` doit venir du dernier resultat `ready` de `get_clip_status`.
- Les videos publiees doivent etre les previews R2 retournees par l'app.
- Ne jamais appeler ce node directement apres reception d'une URL YouTube.

## Tests a faire apres correction

### Test 1: smoke prod local

Depuis le repo local:

```bash
APP_URL_PROD=https://worldcup.srv754021.hstgr.cloud \
npm run verify:telegram:prod -- https://worldcup.srv754021.hstgr.cloud
```

Resultat attendu: tout doit etre en `PASS`.

### Test 2: health prod VPS

Depuis le VPS:

```bash
curl -Ik https://worldcup.srv754021.hstgr.cloud/api/health
```

Resultat attendu:

```text
HTTP/2 200
```

### Test 3: test Telegram sans publication

Depuis Telegram:

1. Envoyer une URL YouTube de test au bot.
2. Verifier que le bot repond qu'il prepare les clips.
3. Attendre la preview.
4. Verifier que la preview est une URL HTTPS R2.
5. Ne pas confirmer la publication.

Resultat attendu:

- une preview est generee ;
- rien n'est publie sur YouTube ou Instagram ;
- aucune erreur brute ou stack trace n'est envoyee dans Telegram.

### Test 4: test preview R2 automatise

Apres confirmation que les credentials OpenAI/R2 sont corrects:

```bash
APP_URL_PROD=https://worldcup.srv754021.hstgr.cloud \
npm run verify:telegram:clip-live -- \
  --url https://worldcup.srv754021.hstgr.cloud \
  --youtube "https://www.youtube.com/watch?v=VIDEO_ID"
```

Resultat attendu:

- le job est accepte ;
- le statut finit en `ready` ;
- au moins une preview R2 HTTPS est retournee ;
- aucune publication n'est declenchee par ce test.

### Test 5: publication humaine controlee

Depuis Telegram:

1. Envoyer une URL YouTube de test.
2. Attendre la preview R2.
3. Confirmer explicitement la publication.
4. Verifier que n8n appelle `/api/telegram/publish`.
5. Verifier que le workflow `WorldCup - Publish to Upload-Post` recoit bien le
   payload.

Resultat attendu:

- publication declenchee uniquement apres confirmation ;
- Upload-Post retourne un succes ;
- YouTube et Instagram affichent le resultat attendu.

### Test 6: verification Upload-Post, YouTube, Instagram

Verifier manuellement:

- dans Upload-Post: execution recue et terminee ;
- dans YouTube: video ou Short cree selon le comportement attendu ;
- dans Instagram: publication ou reel cree selon le comportement attendu.

### Test 7: rapport de cutover

Si Node/npm sont disponibles dans l'environnement qui lance le rapport:

```bash
APP_URL_PROD=https://worldcup.srv754021.hstgr.cloud \
YOUTUBE_TEST_URL="https://www.youtube.com/watch?v=VIDEO_ID" \
npm run collect:cutover-evidence
```

Le rapport doit etre cree dans:

```text
deploy/evidence/
```

Ce dossier est ignore par Git. Relire le rapport avant tout partage pour
verifier qu'il ne contient aucun secret.

## Garde-fous a conserver

- `/api/telegram/clip` reste non-publiant.
- `/api/telegram/publish` reste la seule route Telegram qui peut publier.
- La publication reelle doit rester bloquee sans `confirmed: true`.
- Les URLs de publication doivent venir des previews R2, pas d'une URL externe
  arbitraire.
- Ne jamais afficher les tokens, secrets, webhooks prives ou credentials dans
  Telegram, n8n, les logs ou la documentation.
