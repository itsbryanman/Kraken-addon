# Kraken Deploy Notes

Kraken is publicly hosted at `https://kraken.backwoodsdevelopment.com`. This file is the maintainer and self-hosting reference.

## Official Hosted Instance

- Public configure page: `https://kraken.backwoodsdevelopment.com/configure`
- Public manifest: `https://kraken.backwoodsdevelopment.com/manifest.json`
- If you are just trying to install Kraken in Stremio, use the hosted page above and stop there.

## Docker Standalone

```bash
docker run -d \
  --name kraken \
  -p 7000:7000 \
  -e NODE_ENV=production \
  -e BASE_URL=https://your-domain.com \
  ghcr.io/itsbryanman/kraken-addon:latest
```

## Docker Compose With Redis

```yaml
services:
  kraken:
    image: ghcr.io/itsbryanman/kraken-addon:latest
    ports:
      - "7000:7000"
    environment:
      NODE_ENV: production
      BASE_URL: https://your-domain.com
      REDIS_URL: redis://redis:6379
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

```bash
docker compose up -d
```

## Docker Compose With Caddy

```yaml
services:
  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data
      - caddy-config:/config
    restart: unless-stopped

  kraken:
    image: ghcr.io/itsbryanman/kraken-addon:latest
    environment:
      NODE_ENV: production
      BASE_URL: https://kraken.your-domain.com
      REDIS_URL: redis://redis:6379
    restart: unless-stopped
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  caddy-data:
  caddy-config:
```

```caddyfile
kraken.your-domain.com {
    reverse_proxy kraken:7000
}
```

## Manual Install

```bash
git clone https://github.com/itsbryanman/Kraken-addon.git
cd Kraken-addon/kraken-addon
npm install
npm run build
npm start
```

Then open `http://localhost:7000/configure` if Stremio is on the same machine, or expose the service on your LAN/domain and use that URL instead.

## Environment Variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | Express listen port | `7000` |
| `HOST` | Bind address | `0.0.0.0` |
| `BASE_URL` | Public base URL used in manifest and redirects | Auto-detect local URL |
| `REDIS_URL` | Redis connection string for shared caching | In-memory cache |
| `LOG_LEVEL` | Logger verbosity | `info` |
| `NODE_ENV` | Runtime mode | `development` |

## API Endpoints

| Endpoint | Use |
| --- | --- |
| `GET /manifest.json` | Default manifest |
| `GET /:config/manifest.json` | Manifest for encoded config |
| `GET /stream/:type/:id.json` | Default stream response |
| `GET /:config/stream/:type/:id.json` | Stream response for encoded config |
| `GET /:config/resolve/:provider/:infoHash/:cachedFileIdx/:fileIdx/:filename?` | Debrid resolver redirect |
| `GET /health` | Health status |
| `GET /configure` | Backend-served config page |
| `GET /api/providers` | Provider metadata for UI/debugging |

## Architecture

```text
┌─────────────────────────────────────────────────────────┐
│             Hosted Kraken Frontend + Backend           │
│      https://kraken.backwoodsdevelopment.com/          │
└────────────────────────┬────────────────────────────────┘
                         │ Generates manifest/install URLs
                         ▼
┌─────────────────────────────────────────────────────────┐
│                   Stremio Client                        │
│            Desktop, Mobile, TV, and Web                │
└────────────────────────┬────────────────────────────────┘
                         │ GET /:config/stream/:type/:id.json
                         ▼
┌─────────────────────────────────────────────────────────┐
│                Kraken Backend Server                    │
│           Backwoods / Docker / VPS / self-host         │
│  ┌─────────────┬─────────────┬──────────────────────┐   │
│  │ 50+ Scrapers│ Debrid APIs │ Ranking + Filtering  │   │
│  └─────────────┴─────────────┴──────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Troubleshooting

- `No streams found`: verify metadata IDs, enabled providers, and debrid auth. Then check server logs.
- `Manifest installs but playback fails`: confirm `BASE_URL` matches the public URL Stremio can reach.
- `CORS or mixed-content weirdness`: use HTTPS end to end and make sure your reverse proxy forwards the original host.
- `Provider flakiness`: some indexers die, move, or rate-limit. That's normal. Keep the defaults healthy and prune dead weight.

## Security Notes

- Debrid API keys live in the manifest URL. Treat configured links like secrets.
- Use HTTPS for any public deployment.
- Do not share a configured install URL unless you mean to share that account access.
- Keep Prowlarr and Jackett private. Expose Kraken, not your whole indexer stack.
