# Upload-Post

Vous venez de créer le profil nommé `worldcup01`.

Lors de l'utilisation de l'API, vous devez transmettre ce nom exactement, en respectant la casse, dans le paramètre `user`.

Ce profil vous permet de connecter vos comptes de réseaux sociaux et de choisir les plateformes sur lesquelles publier depuis le tableau de bord.

## Exemple cURL

```bash
curl \
  -H 'Authorization: Apikey YOUR_API_KEY' \
  -F 'user="worldcup01"' \
  -F 'title="Your Media Title"' \
  -F 'platform[]=instagram' \
  -F 'photos[]=@/path/to/your/image.jpg' \
  -X POST https://api.upload-post.com/api/upload_photos
```
