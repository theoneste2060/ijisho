# Ijisho API

Agronomist registry and escalation photos for [Ijisho](../README.md). Cloudflare Workers + D1, free tier.
In production the app reaches it through Vercel rewrites (`/api/*` and `/c/*` on ijisho-amber.vercel.app).

| Endpoint | What it does |
|---|---|
| `POST /api/agronomists` | Register (name, phone, role, organisation, districts, languages, note, consent). Starts as `pending`. 5 per hour per IP; hidden honeypot field for bots |
| `GET /api/agronomists` | All approved agronomists with their districts (the app lists and searches them). `?district=Kamonyi` filters to one district |
| `POST /api/cases` | Multipart: `photo` (JPEG up to 400 KB), `result`, `confidence`, `lang`, `district`. Returns `/c/<id>`. 30 per hour per IP, 2,000 per day overall |
| `GET /c/<id>` and `/c/<id>/photo` | Page and image for the agronomist. Expire after 30 days; a daily cron deletes them |
| `GET /api/admin/agronomists?status=pending` | Admin list (Bearer `ADMIN_TOKEN`) |
| `POST /api/admin/agronomists/<id>` | `{ "action": "approve" }`, `"reject"` or `"pending"` |
| `DELETE /api/admin/agronomists/<id>` | Remove completely |

## Run locally

```bash
npx wrangler d1 migrations apply ijisho --local
echo "ADMIN_TOKEN=$(openssl rand -base64 24)" > .dev.vars   # local test password, git-ignored
npx wrangler dev --port 8787 --test-scheduled
npm test        # 9 integration tests against the local API (start with --test-scheduled)
```

## Deploy

```bash
npx wrangler d1 migrations apply ijisho --remote
npx wrangler deploy
npx wrangler secret put ADMIN_TOKEN   # in a normal terminal (it asks for the value); 12+ characters; never commit it
```
