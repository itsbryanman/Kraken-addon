# 🦑 KRAKEN STREMIO ADDON - CODING AGENT PROMPT

## Project Context

You are continuing development on **Kraken**, a Stremio torrent aggregator addon designed to surpass Torrentio with more sources, better ranking, and multi-debrid support.

**Repository**: `git@github.com:itsbryanman/Kraken-addon.git`

**Current Status**: Core architecture implemented, needs provider implementations completed and testing.

---

## CRITICAL REQUIREMENTS

### 1. Stremio Protocol Compliance

The addon MUST implement these endpoints correctly:

```
GET /manifest.json                    → Addon capabilities
GET /:config/manifest.json            → Configured manifest
GET /stream/:type/:id.json            → Stream results
GET /:config/stream/:type/:id.json    → Configured stream results
```

**Stream Response Format:**
```typescript
{
  streams: [
    {
      name: "[RD+] 4K BluRay",           // Short identifier
      title: "📺 4K | BluRay | x265 | 🔊 Atmos | 💾 45.2 GB | 👥 150 | 🔗 YTS | ⚡ CACHED",
      infoHash?: "abc123...",            // For P2P
      url?: "https://...",               // For debrid direct links
      fileIdx?: 0,                       // For multi-file torrents
      behaviorHints?: {
        filename: "Movie.2024.2160p.BluRay.mkv",
        videoSize: 48500000000
      }
    }
  ]
}
```

**ID Format:**
- Movies: `tt1234567`
- Series: `tt1234567:1:5` (IMDB:season:episode)

### 2. Performance Requirements

- Response time: < 10 seconds (Stremio timeout is ~15s)
- Concurrent provider queries with PQueue
- Aggressive caching (30min-8hr depending on data type)
- Rate limiting per provider to avoid bans

### 3. Architecture Principles

```
Request Flow:
┌─────────────────────────────────────────────────────────────────┐
│ Stremio Client                                                   │
└───────────────────────────────┬─────────────────────────────────┘
                                │ GET /stream/movie/tt1234567.json
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ Kraken Server                                                    │
│  1. Parse config from URL path                                   │
│  2. Check stream cache                                           │
│  3. Query enabled providers in parallel (PQueue concurrency=5)   │
│  4. Check debrid availability for all hashes                     │
│  5. Rank results using weighted scoring algorithm                │
│  6. Convert to Stremio stream format                             │
│  7. Cache and return                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## IMMEDIATE TASKS (Priority Order)

### Task 1: Complete Provider Scrapers

The following providers need implementations in `src/providers/scrapers.ts`:

```typescript
// REQUIRED - High Priority (popular, reliable)
- RARBG (legacy data via DMM hash lists)
- KickassTorrents
- MagnetDL  
- LimeTorrents
- Solid Torrents (API available)
- BitSearch (API available)

// REQUIRED - Anime
- TokyoTosho (RSS)
- AniDex (API available)
- SubsPlease (RSS)
- AnimeTosho (API available)

// OPTIONAL - Regional (based on user demand)
- Rutor (Russian)
- MejorTorrent (Spanish)
- Torrent9 (French)
```

**Implementation Pattern:**
```typescript
export class NewProvider implements Provider {
  name = 'Provider Name';
  id = 'provider_id';
  enabled = true;
  categories: ('movies' | 'tv' | 'anime')[] = ['movies', 'tv'];
  languages = ['en'];
  rateLimit = 20;

  private client: AxiosInstance;
  private limiter = createLimiter(2, 1000); // 2 concurrent, 1s between

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    // 1. Check cache first
    const cacheKey = `${this.id}:${JSON.stringify(query)}`;
    const cached = await cache.get<TorrentResult[]>(cacheKey);
    if (cached) return cached;

    // 2. Execute search with rate limiting
    const results: TorrentResult[] = [];
    await this.limiter.schedule(async () => {
      // Scraping/API logic here
    });

    // 3. Cache results
    await cache.set(cacheKey, results, 1800);
    return results;
  }
}
```

### Task 2: Fix TypeScript Compilation

Run `npm run build` and fix all TypeScript errors. Common issues:
- Missing null checks on array access
- Async function return types
- Optional chaining needed

### Task 3: Implement IMDB → Title Resolution

Many providers don't support IMDB search. Need a title lookup service:

```typescript
// src/utils/metadata.ts
async function resolveIMDB(imdbId: string): Promise<{
  title: string;
  year: number;
  type: 'movie' | 'series';
}> {
  // Option 1: Use Cinemeta (Stremio's metadata addon)
  const response = await axios.get(
    `https://v3-cinemeta.strem.io/meta/movie/${imdbId}.json`
  );
  return {
    title: response.data.meta.name,
    year: response.data.meta.year,
    type: response.data.meta.type,
  };
  
  // Option 2: Use OMDB API (needs API key)
  // Option 3: Use TMDB API (needs API key)
}
```

### Task 4: Debrid Cache Check Optimization

Real-Debrid removed `/instantAvailability`. Current workaround uses 8-hour cache. Improve with:

```typescript
// Strategy 1: Batch checks with retries
async function checkRDAvailability(hashes: string[]): Promise<Map<string, boolean>> {
  // Split into batches of 100
  // Use exponential backoff on rate limits
  // Cache results for 8 hours
}

// Strategy 2: Background cache warming
// Periodically check popular content and pre-cache availability
```

### Task 5: Configuration Page Enhancement

The `/configure` page needs:
- Provider search/filter
- Live validation of API keys
- Preview of generated manifest URL
- Dark mode toggle
- Mobile responsive design

---

## PROVIDER IMPLEMENTATION GUIDE

### For API-based Providers

```typescript
// Example: Solid Torrents API
const response = await axios.get('https://solidtorrents.to/api/v1/search', {
  params: {
    q: query.imdbId || query.query,
    category: query.type === 'movie' ? 'Video' : 'TV',
    sort: 'seeders',
  },
});

for (const item of response.data.results) {
  results.push({
    title: item.title,
    infoHash: item.infohash,
    size: item.size,
    seeders: item.seeders,
    leechers: item.leechers,
    provider: 'SolidTorrents',
  });
}
```

### For HTML Scraping Providers

```typescript
// Example: Generic scraper pattern
const $ = cheerio.load(response.data);

$('table.torrents tr').each((_, row) => {
  const $row = $(row);
  
  // Extract magnet link
  const magnetLink = $row.find('a[href^="magnet:"]').attr('href');
  if (!magnetLink) return;
  
  // Extract info hash from magnet
  const hashMatch = magnetLink.match(/btih:([a-fA-F0-9]{40})/i);
  if (!hashMatch) return;
  
  // Extract metadata from table cells
  const title = $row.find('.name').text().trim();
  const sizeText = $row.find('.size').text();
  const seeders = parseInt($row.find('.seeders').text()) || 0;
  
  results.push({
    title,
    infoHash: hashMatch[1].toLowerCase(),
    magnetUri: magnetLink,
    size: parseSize(sizeText),
    seeders,
    provider: 'ProviderName',
  });
});
```

### For RSS-based Providers

```typescript
// Example: Nyaa RSS
import Parser from 'rss-parser';

const parser = new Parser();
const feed = await parser.parseURL(
  `https://nyaa.si/?page=rss&q=${encodeURIComponent(query.query)}&c=1_2`
);

for (const item of feed.items) {
  const magnetLink = item.link; // RSS items contain magnet links
  // Extract hash and metadata...
}
```

---

## RANKING ALGORITHM DETAILS

The scoring system in `src/ranking/scorer.ts` needs these weights tuned:

```typescript
const DEFAULT_WEIGHTS: RankingWeights = {
  resolution: 30,    // Most important - users want quality
  source: 25,        // BluRay > WEB-DL > HDTV
  codec: 10,         // x265 is more efficient
  audio: 10,         // Atmos/TrueHD for home theater
  hdr: 8,            // HDR significantly improves viewing
  seeders: 10,       // Ensures downloadability
  size: 3,           // Sanity check only
  provider: 2,       // Minor provider preference
  cached: 15,        // HUGE bonus for instant playback
  age: 2,            // Slight preference for newer
};
```

**Release Group Scoring** - Add more groups:
```typescript
const RELEASE_GROUP_SCORES: Record<string, number> = {
  // Scene groups (100 = best)
  'sparks': 100, 'flux': 100, 'epsilon': 100,
  'framestor': 95, 'tigole': 95, 'qxr': 95,
  // P2P groups
  'playbd': 95, 'criterion': 95, 'haiku': 90,
  // Anime groups
  'subsplease': 90, 'erai-raws': 85, 'judas': 85,
  // Known mediocre
  'yts': 80, 'yify': 75, // Good size, lower quality
  'mkvcage': 60, // Over-compressed
};
```

---

## TESTING REQUIREMENTS

### Unit Tests (`tests/`)

```typescript
// tests/ranking.test.ts
describe('Ranking Scorer', () => {
  test('4K BluRay should score higher than 1080p WEB-DL', () => {
    const bluray4k = createMockTorrent('4K', 'BluRay');
    const webdl1080 = createMockTorrent('1080p', 'WEB-DL');
    
    expect(calculateScore(bluray4k)).toBeGreaterThan(calculateScore(webdl1080));
  });
  
  test('Cached torrent should get significant bonus', () => {
    const torrent = createMockTorrent('1080p', 'BluRay');
    const uncached = calculateScore(torrent, false);
    const cached = calculateScore(torrent, true);
    
    expect(cached - uncached).toBeGreaterThan(10);
  });
});
```

### Integration Tests

```typescript
// tests/integration/stream.test.ts
describe('Stream Handler', () => {
  test('Returns valid streams for movie IMDB ID', async () => {
    const response = await request(app)
      .get('/stream/movie/tt0111161.json')
      .expect(200);
    
    expect(response.body.streams).toBeDefined();
    expect(response.body.streams.length).toBeGreaterThan(0);
    
    for (const stream of response.body.streams) {
      expect(stream.name).toBeDefined();
      expect(stream.infoHash || stream.url).toBeDefined();
    }
  });
});
```

---

## DEPLOYMENT CHECKLIST

### Before Release:

- [ ] All TypeScript errors fixed
- [ ] All 50+ providers have implementations (even if stub)
- [ ] Debrid services tested with real API keys
- [ ] Rate limiting working correctly
- [ ] Cache invalidation working
- [ ] Configuration page functional
- [ ] Docker build succeeds
- [ ] Health check endpoint working
- [ ] README complete with examples
- [ ] No sensitive data in code

### Infrastructure:

- [ ] Domain configured
- [ ] SSL certificate (Let's Encrypt via Caddy)
- [ ] Redis for production caching
- [ ] Monitoring (optional: Prometheus + Grafana)
- [ ] Backup strategy for Redis data

---

## COMMON ISSUES & SOLUTIONS

### Issue: "No streams found"

**Causes:**
1. All providers timing out
2. Cache returning stale empty results
3. IMDB ID not being resolved to search terms

**Debug:**
```typescript
logger.debug('Provider results', {
  provider: providerId,
  query,
  results: results.length,
  duration: Date.now() - startTime,
});
```

### Issue: Debrid shows [RD+] but link fails

**Cause:** Cache reports availability but torrent no longer cached

**Solution:** Implement fallback to P2P when debrid resolution fails:
```typescript
try {
  stream.url = await debridService.resolve(infoHash);
} catch {
  // Fallback to P2P
  stream.infoHash = infoHash;
  stream.name = stream.name.replace('[RD+]', '[P2P]');
}
```

### Issue: Rate limited by provider

**Solution:** Implement exponential backoff:
```typescript
const limiter = new Bottleneck({
  maxConcurrent: 2,
  minTime: 1000,
  reservoir: 30,
  reservoirRefreshAmount: 30,
  reservoirRefreshInterval: 60 * 1000, // Per minute
});
```

---

## FILES TO MODIFY/CREATE

Priority order for continued development:

1. `src/providers/scrapers.ts` - Add missing provider implementations
2. `src/utils/metadata.ts` - Create IMDB resolution service
3. `src/handlers/stream.ts` - Fix TypeScript issues, add error handling
4. `tests/` - Add comprehensive test suite
5. `src/index.ts` - Enhance configuration page
6. `docker-compose.yml` - Add production configurations

---

## RESOURCES

- [Stremio Addon SDK Docs](https://github.com/Stremio/stremio-addon-sdk)
- [Stremio Protocol Spec](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/protocol.md)
- [Torrentio Source](https://github.com/TheBeastLT/torrentio-scraper) - Reference implementation
- [Real-Debrid API](https://api.real-debrid.com/)
- [AllDebrid API](https://docs.alldebrid.com/)
- [Prowlarr API](https://prowlarr.com/docs/api)

---

## REMEMBER

1. **Always check cache first** - Provider scraping is expensive
2. **Rate limit everything** - Don't get IPs banned
3. **Handle errors gracefully** - One provider failing shouldn't crash everything
4. **Log extensively in debug mode** - Makes troubleshooting much easier
5. **Test with real content** - Use IMDB IDs from popular movies/shows

Good luck! 🦑
