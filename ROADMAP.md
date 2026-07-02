# Feuille de route - Viral Shorts Factory

## Objectif

Construire un systeme qui transforme un lien YouTube en videos courtes originales, pretes a publier automatiquement sur YouTube Shorts et Instagram Reels.

Le lien YouTube sert a comprendre le sujet, les moments forts et les angles viraux. Les videos finales doivent etre originales : scripts, voix, visuels, montage, titres, descriptions et hashtags.

TikTok reste une extension future, car Upload-Post indique que la connexion TikTok n'est pas disponible sur le forfait gratuit.

## Etat actuel des acces

Les acces de base sont configures dans `.env` :

- IA scripts et voix :
  - `OPENAI_API_KEY`
  - `ELEVENLABS_API_KEY`
- Generation video IA :
  - Kling via `KLING_API_KEY_access_token`
  - Kling via `KLING_API_KEY_secret_key`
- Stockage :
  - Cloudflare R2 bucket `worldcup01`
  - URL publique R2 active via `CLOUDFLARE_R2_PUBLIC_URL`
- Publication automatique :
  - Upload-Post API configure
  - profil Upload-Post `worldcup01`
  - comptes connectes : Instagram et YouTube
- Orchestration :
  - n8n Hostinger configure
  - workflow actif `WorldCup - Publish to Upload-Post`
  - webhook production configure via `N8N_WEBHOOK_URL`

## 1. MVP contenu

- Coller un lien YouTube.
- Recuperer le titre, la description, les mots-cles et la transcription quand elle est disponible.
- Generer 4 idees de shorts viraux.
- Generer pour chaque short :
  - angle viral
  - hook
  - script
  - prompt video
  - titre
  - description
  - hashtags

Statut : implemente et verifie. `/api/analyze` et le pipeline CLI
recuperent le contexte YouTube, produisent exactement 4 shorts structures, et
basculent en generation mock en dry-run pour eviter les couts OpenAI.

## 2. Voix off

- Utiliser `OPENAI_API_KEY` ou `ELEVENLABS_API_KEY`.
- Generer une voix off pour chaque script.
- Exporter chaque voix en MP3.
- Stocker le chemin local ou l'URL de chaque fichier audio.

Statut : implemente et verifie en dry-run. Le module genere un MP3 local par
script, reutilise le fichier si le script a deja ete traite, utilise ElevenLabs
en priorite en mode reel puis OpenAI TTS en fallback. En dry-run, un MP3 mock
lisible est cree sans appel externe.

## 3. Visuels realistes

- Utiliser Kling comme fournisseur initial.
- Envoyer les prompts video generes.
- Recuperer les clips IA.
- Eviter de reprendre les images TV ou les extraits YouTube proteges.
- Stocker les metadonnees de generation :
  - prompt
  - provider
  - job id
  - status
  - URL ou chemin du clip

Statut : implemente avec client Kling et fallback mock. Le client signe les
requetes Kling avec JWT HS256 a partir des cles `.env`, cree une tache
text-to-video 9:16 et poll le resultat. En dry-run, un clip MP4 mock 9:16 est
cree localement et les metadonnees provider/job/status sont conservees.

## 4. Montage automatique

- Utiliser Remotion et FFmpeg.
- Assembler automatiquement :
  - clips IA
  - voix off
  - musique
  - sous-titres dynamiques
  - hook a l'ecran
  - titre final
- Exporter 4 videos MP4 verticales en format 9:16.
- Verifier la duree, le ratio, l'audio et le poids du fichier.

Statut : implemente et verifie en dry-run avec FFmpeg embarque via
`ffmpeg-static`. Le rendu final sort en MP4 1080x1920 avec audio et verification
locale. Limite actuelle : le binaire embarque ne contient pas `drawtext`, donc
les overlays texte/sous-titres visuels sont representes par un habillage
graphique mock; un ffmpeg avec `drawtext` ou une etape image texte est requis
pour les sous-titres dynamiques reels.

## 5. Stockage

- Utiliser Cloudflare R2.
- Uploader les MP4 generes dans le bucket `worldcup01`.
- Obtenir une URL publique pour chaque video via `CLOUDFLARE_R2_PUBLIC_URL`.
- Retourner une URL finale du type :

```text
<CLOUDFLARE_R2_PUBLIC_URL>/<object-key>.mp4
```

Statut : implemente. En mode reel, l'upload utilise une requete PUT signee
AWS SigV4 vers Cloudflare R2 avec les variables `.env`, puis verifie l'URL
publique par HEAD. En dry-run, le pipeline calcule la cle objet stable et l'URL
publique sans uploader.

## 6. Publication automatique

- Utiliser n8n sur Hostinger comme orchestrateur.
- Webhook n8n actif :

```text
POST N8N_WEBHOOK_URL
```

- Envoyer depuis l'application vers n8n :
  - `video_url`
  - `title`
  - `description`
  - `hashtags`
  - `platforms`
- Publier via Upload-Post sur :
  - Instagram Reels
  - YouTube Shorts

Payload cible :

```json
{
  "video_url": "https://pub-b4be52e580824312bfbb6c6402abe2b4.r2.dev/video.mp4",
  "title": "Titre de la video",
  "description": "Description + hashtags",
  "platforms": ["instagram", "youtube"]
}
```

Statut : implemente. `/api/publish` et le pipeline envoient un POST JSON vers
`N8N_WEBHOOK_URL` en mode reel avec `video_url`, `title`, `description`,
`hashtags`, `platforms` et `request_id` comme cle d'idempotence. En dry-run, la
charge utile est stockee localement sans publication.

## 7. Analytics

- Recuperer les performances :
  - vues
  - likes
  - commentaires
  - partages
  - taux de retention si disponible
- Stocker les resultats.
- Identifier les meilleurs angles.
- Generer plus de videos a partir des formats gagnants.

Statut : socle dry-run/mock implemente. `npm run verify:analytics` genere un
rapport analytics local sous `output/analytics/` avec vues, likes, commentaires,
partages, retention, taux d'engagement et score par short/plateforme. La collecte
reelle Upload-Post/YouTube/Instagram reste a brancher quand les API et acces prod
sont disponibles.

## 8. Monetisation

- Publier 4 a 10 videos par jour.
- Tester plusieurs angles dans la niche foot.
- Ajouter des sources de revenus :
  - monetisation plateforme
  - affiliation
  - sponsors
  - placements logo
  - clipping autorise pour marques ou createurs

Statut : apres validation du pipeline complet.

## Etat pipeline actuel

Commande de verification dry-run :

```bash
npm run verify:pipeline
npm run verify:pipeline:4
```

Resultat verifie le 2026-06-12 :

- build Next.js : OK.
- typecheck TypeScript : OK.
- audit npm : 0 vulnerabilite connue.
- dry-run 1 short : OK.
- dry-run strict 4 shorts : OK.
- voix mock MP3 : OK.
- clip mock MP4 : OK.
- rendu final MP4 1080x1920 avec audio : OK.
- URL R2 calculee depuis `CLOUDFLARE_R2_PUBLIC_URL` : OK.
- payload n8n dry-run avec idempotency key : OK.
- API `/api/pipeline` en dry-run 1 short : OK.
- API `/api/publish` sans `video_url` : erreur 400 attendue.
- API `/api/analyze` et `/api/pipeline` avec lien invalide : erreur 400 attendue.

Les sorties sont ecrites dans `output/viral-shorts/<timestamp>/` avec un
`report.json` final et un `report.partial.json` pendant l'execution. La
verification stricte controle les fichiers non vides, les dimensions 1080x1920,
la presence audio, les URLs R2 derivees de `.env` et les payloads n8n.

## Priorite immediate

1. Tester `npm run verify:pipeline` avec un lien YouTube cible.
2. Lancer un test semi-reel sur 1 short avec voix reelle ou Kling reel si les
   credits API sont disponibles.
3. Lancer un upload R2 reel sur un MP4 de test.
4. Declencher le webhook n8n reel avec une URL R2 valide.
5. Ajouter une etape texte/sous-titres reels au rendu MP4.

## Cles et acces necessaires

Toutes les cles necessaires au pipeline initial sont presentes dans `.env`.

- `OPENAI_API_KEY` : present.
- `ELEVENLABS_API_KEY` : present.
- `KLING_API_KEY_access_token` : present.
- `KLING_API_KEY_secret_key` : present.
- `CLOUDFLARE_R2_ACCOUNT_ID` : present.
- `CLOUDFLARE_R2_ACCESS_KEY_ID` : present.
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY` : present.
- `CLOUDFLARE_R2_BUCKET` : present.
- `CLOUDFLARE_R2_PUBLIC_URL` : present.
- `UPLOAD_POST_API_KEY` : present.
- `UPLOAD_POST_USER` : present.
- `N8N_BASE_URL` : present.
- `N8N_API_KEY` : present.
- `N8N_WEBHOOK_URL` : present.

## Prompts d'implementation

Utiliser ces prompts un par un. Chaque sous-prompt doit etre considere comme termine uniquement quand l'implementation est faite, testee et fonctionnelle.

### Prompt 1 - MVP contenu YouTube vers scripts

```text
Tu es Codex dans le repo worldCup. Implemente ou finalise le module qui transforme un lien YouTube en 4 concepts de shorts viraux.

Objectif :
- Entrer un lien YouTube.
- Recuperer titre, description, metadonnees et transcription si disponible.
- Generer 4 idees de shorts.
- Pour chaque idee, produire : angle viral, hook, script court, prompt video, titre, description, hashtags.

Contraintes :
- Utiliser OPENAI_API_KEY depuis .env.
- Ne jamais exposer les cles dans les logs.
- Respecter l'architecture existante du projet.
- Ajouter des tests ou un script de verification adapte au code existant.

Definition of done :
- Une commande ou action locale permet de tester un lien YouTube.
- Le resultat contient exactement 4 shorts structures.
- Les erreurs de transcription ou de lien invalide sont gerees proprement.
- Les tests/verifications passent.
```

### Prompt 2 - Generation voix off

```text
Tu es Codex dans le repo worldCup. Implemente la generation de voix off pour chaque script de short.

Objectif :
- Prendre les 4 scripts generes.
- Generer une voix off MP3 pour chaque script.
- Utiliser ElevenLabs en priorite si ELEVENLABS_API_KEY est disponible, sinon OpenAI TTS avec OPENAI_API_KEY.
- Retourner les chemins locaux ou URLs des fichiers audio.

Contraintes :
- Ne jamais exposer les cles dans les logs.
- Prevoir une configuration simple pour choisir la voix.
- Eviter de regenerer un MP3 si le meme script a deja ete traite, si le projet a deja un systeme de cache.

Definition of done :
- 4 fichiers MP3 sont generes a partir de 4 scripts.
- Les fichiers sont lisibles et non vides.
- Les erreurs API sont affichees clairement sans casser tout le pipeline.
- Les tests/verifications passent.
```

### Prompt 3 - Generation video IA avec Kling

```text
Tu es Codex dans le repo worldCup. Implemente l'integration Kling pour generer les clips video IA a partir des prompts video.

Objectif :
- Prendre les prompts video generes pour chaque short.
- Appeler Kling avec KLING_API_KEY_access_token et KLING_API_KEY_secret_key depuis .env.
- Suivre le statut de generation.
- Recuperer les clips finaux ou leurs URLs.
- Stocker les metadonnees utiles : provider, prompt, job id, status, URL/chemin.

Contraintes :
- Ne jamais exposer les cles dans les logs.
- Respecter les limites et formats attendus par l'API Kling.
- Prevoir une strategie de polling robuste.
- Eviter tout contenu qui reprend directement des extraits TV/YouTube proteges.

Definition of done :
- Un prompt video de test genere un clip ou passe par un mock documente si l'API est indisponible.
- Le pipeline sait attendre et recuperer le resultat.
- Les erreurs de generation sont gerees proprement.
- Les tests/verifications passent.
```

### Prompt 4 - Montage MP4 vertical

```text
Tu es Codex dans le repo worldCup. Implemente le montage automatique des shorts en MP4 vertical 9:16.

Objectif :
- Assembler pour chaque short : clip IA, voix off, sous-titres, hook a l'ecran, titre final.
- Utiliser Remotion et/ou FFmpeg selon l'architecture existante.
- Exporter des MP4 verticaux 1080x1920.
- Produire 4 MP4 finaux.

Contraintes :
- Garder un rendu lisible sur mobile.
- Sous-titres dynamiques synchronises avec la voix quand possible.
- Audio normalise.
- Ne pas bloquer tout le pipeline si un short echoue.

Definition of done :
- 4 MP4 sont exportes.
- Chaque MP4 est en 9:16, lisible, avec audio.
- Une verification locale confirme duree, ratio et presence audio.
- Les tests/verifications passent.
```

### Prompt 5 - Upload Cloudflare R2

```text
Tu es Codex dans le repo worldCup. Implemente l'upload des MP4 finaux vers Cloudflare R2.

Objectif :
- Lire les MP4 generes.
- Uploader chaque fichier vers le bucket CLOUDFLARE_R2_BUCKET.
- Utiliser les credentials R2 depuis .env.
- Retourner une URL publique pour chaque MP4 avec CLOUDFLARE_R2_PUBLIC_URL.

Contraintes :
- Ne jamais exposer les secrets R2 dans les logs.
- Utiliser une cle d'objet stable et lisible, par exemple videos/YYYY-MM-DD/slug.mp4.
- Verifier que l'URL publique retourne bien le fichier.

Definition of done :
- Un MP4 de test est uploade sur R2.
- L'URL publique fonctionne.
- Le pipeline retourne les URLs pour n8n.
- Les tests/verifications passent.
```

### Prompt 6 - Publication via n8n et Upload-Post

```text
Tu es Codex dans le repo worldCup. Implemente l'appel applicatif vers le webhook n8n pour publier les videos via Upload-Post.

Objectif :
- Envoyer a N8N_WEBHOOK_URL un POST JSON avec video_url, title, description et platforms.
- Publier par defaut sur Instagram et YouTube.
- Recuperer et stocker la reponse n8n/Upload-Post.

Contraintes :
- Ne jamais exposer N8N_API_KEY ni UPLOAD_POST_API_KEY dans les logs.
- Ne pas reposter deux fois le meme short : utiliser un request_id/idempotency key si disponible.
- Prevoir un mode dry-run pour tester sans publication reelle si possible.

Definition of done :
- Un appel de test sans video_url renvoie l'erreur attendue.
- Un appel avec une video_url R2 valide declenche Upload-Post.
- La reponse est stockee ou affichee proprement.
- Les tests/verifications passent.
```

### Prompt 7 - Pipeline bout en bout

```text
Tu es Codex dans le repo worldCup. Assemble le pipeline complet de bout en bout.

Objectif :
- A partir d'un lien YouTube, produire 4 shorts complets.
- Generer scripts, voix off, clips IA, montages MP4.
- Uploader les MP4 vers R2.
- Publier via n8n sur Instagram + YouTube.
- Produire un rapport final avec les URLs, statuts et erreurs eventuelles.

Contraintes :
- Ajouter une option dry-run.
- Ajouter une option pour limiter a 1 short pendant les tests.
- Ne jamais exposer les secrets.
- Le pipeline doit pouvoir reprendre apres un echec partiel si possible.

Definition of done :
- Le mode test sur 1 short fonctionne.
- Le mode 4 shorts fonctionne ou degrade proprement les echecs.
- Le rapport final est clair.
- Les tests/verifications passent.
```

## Prompt manager

```text
Tu es Codex dans le repo worldCup. Tu es le manager d'implementation du projet Viral Shorts Factory.

Mission :
Executer les sous-prompts ci-dessus dans l'ordre, un seul a la fois :
1. MVP contenu YouTube vers scripts
2. Generation voix off
3. Generation video IA avec Kling
4. Montage MP4 vertical
5. Upload Cloudflare R2
6. Publication via n8n et Upload-Post
7. Pipeline bout en bout

Regles de progression :
- Avant de commencer, lire ROADMAP.md, API_KEYS.md, .env et inspecter l'architecture du repo.
- Ne jamais afficher les secrets contenus dans .env.
- Pour chaque sous-prompt :
  - implementer la fonctionnalite
  - ajouter ou adapter les tests/verifications
  - executer les tests/verifications
  - corriger jusqu'a ce que ce soit fonctionnel
  - mettre a jour ROADMAP.md avec le statut reel
- Ne passer au sous-prompt suivant que si le precedent est implemente, teste et fonctionnel.
- Si une API externe est indisponible ou payante, creer un mode mock/dry-run propre, documenter la limite, et garder le pipeline testable.
- A la fin, fournir un resume court : ce qui marche, comment tester, et ce qui reste a faire.

Definition of done globale :
- Le pipeline complet peut etre lance en dry-run.
- Au moins un short peut etre traite de bout en bout en mode reel ou semi-reel selon les limites API.
- Les URLs R2 et le webhook n8n sont utilises depuis .env.
- Les secrets ne sont jamais imprimes.
- ROADMAP.md reflete l'etat final.
```
