# LibreTranslate Setup

EduIgnite uses self-hosted LibreTranslate for English and French translation.
No paid translation API or API key is required.

## Run LibreTranslate Locally

```bash
docker run -ti --rm -p 5000:5000 libretranslate/libretranslate
```

Production deploys can run the managed local container used by EduIgnite:

```bash
docker run -d --name eduignite-libretranslate --restart unless-stopped -p 127.0.0.1:5000:5000 libretranslate/libretranslate
```

## Backend Environment

Set this in `studio-main/backend/.env`:

```env
LIBRETRANSLATE_URL=http://localhost:5000
```

For production, point `LIBRETRANSLATE_URL` to the internal URL of the hosted
LibreTranslate container or service. If the variable is omitted, the backend
uses `http://127.0.0.1:5000`. The frontend must never call LibreTranslate
directly; it calls EduIgnite backend `/api/translate`.

If LibreTranslate is unavailable, `/api/translate` still returns `200` with
bundled EduIgnite system-term translations and `fallback: true`, so the UI does
not break during a container restart.

## EduIgnite API

```bash
curl -X POST http://localhost:8000/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text":"Welcome to your dashboard","targetLang":"fr","sourceLang":"en"}'
```

Expected response:

```json
{
  "translatedText": "Bienvenue dans votre tableau de bord",
  "sourceLang": "en",
  "targetLang": "fr",
  "provider": "LibreTranslate",
  "cached": false
}
```

## Tests

```bash
python manage.py test apps.config.tests
```
