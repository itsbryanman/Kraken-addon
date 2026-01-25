# 🦑 Kraken - Deployment Guide

## Quick Start

### Option 1: One-Click Deploy (Recommended)

#### Railway ($5/month hobby tier)
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/itsbryanman/Kraken-addon)

1. Click the button above
2. Sign in with GitHub
3. Railway will automatically deploy
4. Copy your URL: `https://your-app.railway.app`
5. Go to the [Configure Page](https://itsbryanman.github.io/Kraken-addon/) and enter your URL

#### Render (Free tier available)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/itsbryanman/Kraken-addon)

1. Click the button above
2. Sign in with GitHub
3. Wait for deployment (~5 minutes)
4. Copy your URL: `https://your-app.onrender.com`

⚠️ **Note**: Render free tier sleeps after 15 minutes of inactivity. First request may take 30-60 seconds.

---

### Option 2: Docker (Self-Hosted)

#### Quick Start
```bash
docker run -d \
  --name kraken \
  -p 7000:7000 \
  -e BASE_URL=https://your-domain.com \
  ghcr.io/itsbryanman/kraken-addon:latest
```

#### With Redis (Recommended for Production)
```bash
# docker-compose.yml
version: '3.8'
services:
  kraken:
    image: ghcr.io/itsbryanman/kraken-addon:latest
    ports:
      - "7000:7000"
    environment:
      - NODE_ENV=production
      - BASE_URL=https://your-domain.com
      - REDIS_URL=redis://redis:6379
    restart: unless-stopped
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

```bash
docker-compose up -d
```

#### With Caddy (Automatic HTTPS)
```bash
# docker-compose.yml with Caddy reverse proxy
version: '3.8'
services:
  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data
    restart: unless-stopped

  kraken:
    image: ghcr.io/itsbryanman/kraken-addon:latest
    environment:
      - NODE_ENV=production
      - BASE_URL=https://kraken.your-domain.com
      - REDIS_URL=redis://redis:6379
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  caddy-data:
  redis-data:
```

```
# Caddyfile
kraken.your-domain.com {
    reverse_proxy kraken:7000
}
```

---

### Option 3: Manual Install

```bash
# Clone repository
git clone https://github.com/itsbryanman/Kraken-addon.git
cd Kraken-addon

# Install dependencies
npm install

# Build TypeScript
npm run build

# Start server
npm start
```

#### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `7000` |
| `HOST` | Server host | `0.0.0.0` |
| `BASE_URL` | Public URL for manifest | Auto-detect |
| `REDIS_URL` | Redis connection string | Memory cache |
| `LOG_LEVEL` | Logging level | `info` |
| `NODE_ENV` | Environment | `development` |

---

## Configuration

### Static Configuration Page

The configuration page is hosted on GitHub Pages:
**https://itsbryanman.github.io/Kraken-addon/**

Users can:
1. Enter their Kraken server URL
2. Configure debrid API keys
3. Select providers
4. Generate install link

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /manifest.json` | Default manifest |
| `GET /:config/manifest.json` | Configured manifest |
| `GET /stream/:type/:id.json` | Default streams |
| `GET /:config/stream/:type/:id.json` | Configured streams |
| `GET /health` | Health check |
| `GET /configure` | Local config page |
| `GET /api/providers` | Provider list |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    GitHub Pages                          │
│              (Static Configuration UI)                   │
│         https://itsbryanman.github.io/Kraken-addon/     │
└────────────────────────┬────────────────────────────────┘
                         │ Generates stremio:// URL
                         ▼
┌─────────────────────────────────────────────────────────┐
│                   Stremio Client                         │
│            (Desktop, Mobile, TV, Web)                    │
└────────────────────────┬────────────────────────────────┘
                         │ GET /:config/stream/:type/:id.json
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Kraken Backend Server                       │
│          (Railway / Render / Docker / VPS)               │
│  ┌─────────────┬─────────────┬─────────────────────┐    │
│  │ 50+ Scrapers│ Debrid APIs │ Intelligent Ranking │    │
│  └─────────────┴─────────────┴─────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### "No streams found"
- Check if providers are online
- Verify IMDB ID is correct
- Check server logs: `docker logs kraken`

### Cold start issues (Render)
- Free tier sleeps after 15min
- Consider upgrading to $7/mo paid tier
- Or use Railway instead

### CORS errors
- Ensure `BASE_URL` is set correctly
- Check reverse proxy headers

### Rate limiting
- Reduce concurrent provider count
- Enable Redis for better caching
- Spread requests across time

---

## Security Notes

1. **API Keys are stored in the URL** - They're never saved on the server
2. **Use HTTPS** - Always deploy behind SSL
3. **Don't share your configured URL** - It contains your debrid API key
4. **Prowlarr/Jackett** - Only expose to your Kraken server, not public internet

---

## Support

- **Issues**: https://github.com/itsbryanman/Kraken-addon/issues
- **Discussions**: https://github.com/itsbryanman/Kraken-addon/discussions
