/**
 * Kraken Tier 1 Providers - Primary English Sources
 * 
 * High-reliability, high-coverage providers
 */

import { JsonApiProvider, HtmlScraperProvider } from './base';
import { TorrentResult, SearchQuery } from '../types';
import { logger } from '../utils/logger';

// ============================================================================
// YTS - Movies Only, Optimized Sizes
// ============================================================================

interface YTSResponse {
  status: string;
  data: {
    movie_count: number;
    movies?: Array<{
      id: number;
      imdb_code: string;
      title: string;
      year: number;
      torrents: Array<{
        hash: string;
        quality: string;
        type: string;
        size: string;
        size_bytes: number;
        seeds: number;
        peers: number;
      }>;
    }>;
  };
}

export class YTSProvider extends JsonApiProvider {
  private mirrors = [
    'https://yts.mx/api/v2',
    'https://yts.rs/api/v2',
    'https://yts.lt/api/v2',
    'https://yts.torrentbay.to/api/v2',
  ];
  private currentMirrorIndex = 0;

  constructor() {
    super({
      id: 'yts',
      name: 'YTS',
      baseUrl: 'https://yts.mx/api/v2',
      rateLimit: 30,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    if (query.type === 'series') return []; // YTS is movies only

    const cacheKey = `yts:${query.imdbId || query.query}`;
    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      const params: Record<string, string> = {
        limit: '50',
      };

      if (query.imdbId) {
        params['query_term'] = query.imdbId;
      } else if (query.query) {
        params['query_term'] = query.query;
      }

      // Try each mirror until one works
      for (let i = 0; i < this.mirrors.length; i++) {
        const mirrorIndex = (this.currentMirrorIndex + i) % this.mirrors.length;
        const mirror = this.mirrors[mirrorIndex]!;

        try {
          this.client.defaults.baseURL = mirror;
          const response = await this.fetchJson<YTSResponse>('/list_movies.json', { params });

          if (response.status === 'ok' && response.data.movies) {
            this.currentMirrorIndex = mirrorIndex; // Remember working mirror
            for (const movie of response.data.movies) {
              if (query.imdbId && movie.imdb_code !== query.imdbId) {
                continue;
              }

              for (const torrent of movie.torrents) {
                results.push({
                  title: `${movie.title} (${movie.year}) [${torrent.quality}] [${torrent.type}] - YTS`,
                  infoHash: torrent.hash.toLowerCase(),
                  size: torrent.size_bytes,
                  seeders: torrent.seeds,
                  leechers: torrent.peers,
                  provider: this.id,
                  imdbId: movie.imdb_code,
                });
              }
            }
            return results;
          }
        } catch (error) {
          const status = (error as any)?.response?.status;
          const message = error instanceof Error ? error.message : String(error);
          console.log(`[YTS] mirror failed${status ? ` (HTTP ${status})` : ''}: ${mirror} - ${message}`);
          logger.debug(`YTS mirror ${mirror} failed, trying next...`);
        }
      }

      logger.error(`${this.name} all mirrors failed`);
      return results;
    });
  }
}

// ============================================================================
// EZTV - TV Shows
// ============================================================================

interface EZTVResponse {
  torrents_count: number;
  torrents: Array<{
    id: number;
    hash: string;
    filename: string;
    title: string;
    imdb_id: string;
    season: string;
    episode: string;
    size_bytes: string;
    seeds: number;
    peers: number;
    date_released_unix: number;
  }>;
}

export class EZTVProvider extends JsonApiProvider {
  constructor() {
    super({
      id: 'eztv',
      name: 'EZTV',
      baseUrl: 'https://eztvx.to/api',
      rateLimit: 30,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    if (query.type === 'movie') return []; // EZTV is TV only

    const cacheKey = `eztv:${query.imdbId}:${query.season}:${query.episode}`;
    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        if (!query.imdbId) return results;

        const imdbNum = query.imdbId.replace('tt', '');
        const response = await this.fetchJson<EZTVResponse>('/get-torrents', {
          params: { imdb_id: imdbNum, limit: 100 },
        });

        if (response.torrents) {
          for (const torrent of response.torrents) {
            // Filter by season/episode if specified
            if (query.season !== undefined) {
              const torrentSeason = parseInt(torrent.season, 10);
              if (torrentSeason !== query.season) continue;
            }
            if (query.episode !== undefined) {
              const torrentEpisode = parseInt(torrent.episode, 10);
              if (torrentEpisode !== query.episode) continue;
            }

            results.push({
              title: torrent.title || torrent.filename,
              infoHash: torrent.hash.toLowerCase(),
              size: parseInt(torrent.size_bytes, 10) || undefined,
              seeders: torrent.seeds,
              leechers: torrent.peers,
              provider: this.id,
              imdbId: `tt${torrent.imdb_id}`,
              uploadDate: new Date(torrent.date_released_unix * 1000),
            });
          }
        }
      } catch (error) {
        const status = (error as any)?.response?.status;
        const message = error instanceof Error ? error.message : String(error);
        console.log(`[1337x] search failed${status ? ` (HTTP ${status})` : ''}: ${message}`);
        logger.error(`${this.name} search failed`, { error });
      }

      return results;
    });
  }
}

// ============================================================================
// 1337x - General Purpose
// ============================================================================

export class X1337Provider extends HtmlScraperProvider {
  protected override mirrors = [
    'https://1337x.to',
    'https://1337x.st',
    'https://www.1337xx.to',
    'https://1337x.gd',
    'https://1337x.ws',
  ];

  constructor() {
    super({
      id: '1337x',
      name: '1337x',
      baseUrl: 'https://1337x.to',
      rateLimit: 20,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    if (!query.query?.trim() && query.imdbId) {
      logger.warn('1337x: No search term available, skipping', { imdbId: query.imdbId });
      return [];
    }

    const searchTerm = this.buildSearchQuery(query);
    if (!searchTerm.trim()) {
      logger.warn('1337x: No search term available, skipping', { imdbId: query.imdbId });
      return [];
    }

    const cacheKey = `1337x:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];
      let detailPageFailures = 0;
      let magnetNotFound = 0;

      try {
        const category = query.type === 'movie' ? 'Movies' : 'TV';
        const searchUrl = `/category-search/${encodeURIComponent(searchTerm)}/${category}/1/`;
        const $ = await this.fetchWithMirrors(searchUrl);

        const torrentLinks: string[] = [];
        $('td.name a:nth-child(2)').each((_, el) => {
          const href = $(el).attr('href');
          if (href) torrentLinks.push(href);
        });

        // Fetch individual pages for magnet links (limit to 20)
        for (const link of torrentLinks.slice(0, 20)) {
          try {
            const torrentPage = await this.fetchWithMirrors(link);
            const magnet = torrentPage('a[href^="magnet:"]').first().attr('href');
            
            if (magnet) {
              const infoHash = this.extractInfoHash(magnet);
              if (!infoHash) continue;

              const title = torrentPage('h1').text().trim();
              const sizeText = torrentPage('.torrent-detail-page ul.list li:contains("Size") span').text();
              const seedersText = torrentPage('.torrent-detail-page ul.list li:contains("Seeders") span').text();
              const leechersText = torrentPage('.torrent-detail-page ul.list li:contains("Leechers") span').text();

              results.push({
                title,
                infoHash,
                magnetUri: magnet,
                size: this.parseSize(sizeText),
                seeders: this.parseCount(seedersText),
                leechers: this.parseCount(leechersText),
                provider: this.id,
              });
            } else {
              magnetNotFound++;
              if (magnetNotFound <= 3) {
                console.log(`[1337x] magnet not found (possible block/parsing): ${link}`);
              }
            }
          } catch (err) {
            // Skip failed individual pages
            detailPageFailures++;
            if (detailPageFailures <= 3) {
              const status = (err as any)?.response?.status;
              const message = err instanceof Error ? err.message : String(err);
              console.log(`[1337x] detail page failed${status ? ` (HTTP ${status})` : ''}: ${link} - ${message}`);
            }
          }
        }
      } catch (error) {
        logger.error(`${this.name} search failed`, { error });
      }

      return results;
    });
  }
}

// ============================================================================
// THE PIRATE BAY
// ============================================================================

interface TPBResult {
  id: string;
  name: string;
  info_hash: string;
  leechers: string;
  seeders: string;
  num_files: string;
  size: string;
  username: string;
  added: string;
  category: string;
  imdb: string;
}

export class ThePirateBayProvider extends JsonApiProvider {
  private mirrors = [
    'https://apibay.org',
    'https://piratebay.party/api',
    'https://tpb.party/api',
  ];

  constructor() {
    super({
      id: 'tpb',
      name: 'The Pirate Bay',
      baseUrl: 'https://apibay.org',
      rateLimit: 15,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    if (query.imdbId && query.type === 'movie') {
      return this.searchByImdb(query);
    }

    const searchTerm = this.buildSearchQuery(query);
    if (!searchTerm.trim()) {
      logger.warn('TPB: No search term available, skipping');
      return [];
    }

    const cacheKey = `tpb:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      for (const mirror of this.mirrors) {
        try {
          this.client.defaults.baseURL = mirror;
          const category = query.type === 'movie' ? '201,207' : '205,208'; // HD Movies/Shows
          
          const response = await this.fetchJson<TPBResult[]>('/q.php', {
            params: { q: searchTerm, cat: category },
          });

          if (Array.isArray(response) && response.length > 0 && response[0]?.id !== '0') {
            for (const item of response) {
              if (item.id === '0') continue; // No results marker

              results.push({
                title: item.name,
                infoHash: item.info_hash.toLowerCase(),
                size: parseInt(item.size, 10) || undefined,
                seeders: parseInt(item.seeders, 10) || 0,
                leechers: parseInt(item.leechers, 10) || 0,
                provider: this.id,
                imdbId: item.imdb ? `tt${item.imdb}` : undefined,
                uploadDate: new Date(parseInt(item.added, 10) * 1000),
              });
            }
            break; // Success, don't try other mirrors
          }
        } catch (error) {
          logger.warn(`TPB mirror ${mirror} failed`, { error });
        }
      }

      return results;
    });
  }

  private async searchByImdb(query: SearchQuery): Promise<TorrentResult[]> {
    const imdbId = query.imdbId;
    if (!imdbId) {
      return [];
    }

    const cacheKey = `tpb:imdb:${imdbId}`;
    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];
      const imdbNum = imdbId.replace(/^tt/i, '');

      for (const mirror of this.mirrors) {
        try {
          this.client.defaults.baseURL = mirror;
          const response = await this.fetchJson<TPBResult[]>('/q.php', {
            params: { q: imdbId, cat: '201' },
          });

          if (!Array.isArray(response) || response.length === 0 || response[0]?.id === '0') {
            continue;
          }

          for (const item of response) {
            if (item.id === '0') continue;
            if (item.imdb && item.imdb !== imdbNum) continue;

            results.push({
              title: item.name,
              infoHash: item.info_hash.toLowerCase(),
              size: parseInt(item.size, 10) || undefined,
              seeders: parseInt(item.seeders, 10) || 0,
              leechers: parseInt(item.leechers, 10) || 0,
              provider: this.id,
              imdbId: item.imdb ? `tt${item.imdb}` : undefined,
              uploadDate: new Date(parseInt(item.added, 10) * 1000),
            });
          }

          if (results.length > 0) {
            break;
          }
        } catch (error) {
          logger.warn(`TPB IMDB mirror ${mirror} failed`, { error, imdbId });
        }
      }

      return results;
    });
  }
}

// ============================================================================
// TORRENT GALAXY
// ============================================================================

export class TorrentGalaxyProvider extends HtmlScraperProvider {
  protected override mirrors = [
    'https://torrentgalaxy.to',
    'https://tgx.rs',
    'https://torrentgalaxy.one',
    'https://tgx.sb',
  ];

  constructor() {
    super({
      id: 'torrentgalaxy',
      name: 'TorrentGalaxy',
      baseUrl: 'https://torrentgalaxy.to',
      rateLimit: 20,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    if (!query.query?.trim() && query.imdbId) {
      logger.warn('TorrentGalaxy: No search term available, skipping', {
        imdbId: query.imdbId,
      });
      return [];
    }

    const searchTerm = this.buildSearchQuery(query);
    if (!searchTerm.trim()) {
      logger.warn('TorrentGalaxy: No search term available, skipping', {
        imdbId: query.imdbId,
      });
      return [];
    }

    const cacheKey = `tgx:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const category = query.type === 'movie' ? 'c3=1&' : 'c41=1&'; // Movies or TV
        const searchUrl = `/torrents.php?${category}search=${encodeURIComponent(searchTerm)}`;
        const $ = await this.fetchWithMirrors(searchUrl);

        $('div.tgxtablerow').each((_, row) => {
          const $row = $(row);
          const title = $row.find('a.txlight').first().text().trim();
          const magnet = $row.find('a[href^="magnet:"]').attr('href');
          
          if (!magnet) return;
          const infoHash = this.extractInfoHash(magnet);
          if (!infoHash) return;

          const sizeText = $row.find('span.badge-secondary').first().text();
          const seeders = $row.find('span[title="Seeders/Leechers"] font:first-child').text();
          const leechers = $row.find('span[title="Seeders/Leechers"] font:last-child').text();

          results.push({
            title,
            infoHash,
            magnetUri: magnet,
            size: this.parseSize(sizeText),
            seeders: this.parseCount(seeders),
            leechers: this.parseCount(leechers),
            provider: this.id,
          });
        });
      } catch (error) {
        logger.error(`${this.name} search failed`, { error });
      }

      return results;
    });
  }
}

// ============================================================================
// KICKASS TORRENTS
// ============================================================================

export class KickassProvider extends HtmlScraperProvider {
  protected override mirrors = [
    'https://kickasstorrents.to',
    'https://katcr.to',
    'https://kat.am',
    'https://kickass.ws',
  ];

  constructor() {
    super({
      id: 'kickass',
      name: 'KickassTorrents',
      baseUrl: 'https://kickasstorrents.to',
      rateLimit: 15,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `kat:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const category = query.type === 'movie' ? 'movies' : 'tv';
        const searchUrl = `/usearch/${encodeURIComponent(searchTerm)}%20category:${category}/`;
        const $ = await this.fetchWithMirrors(searchUrl);

        $('tr.odd, tr.even').each((_, row) => {
          const $row = $(row);
          const title = $row.find('a.cellMainLink').text().trim();
          const magnet = $row.find('a[href^="magnet:"]').attr('href');

          if (!magnet) return;
          const infoHash = this.extractInfoHash(magnet);
          if (!infoHash) return;

          const sizeText = $row.find('td:nth-child(2)').text().trim();
          const seeders = $row.find('td:nth-child(5)').text().trim();
          const leechers = $row.find('td:nth-child(6)').text().trim();

          results.push({
            title,
            infoHash,
            magnetUri: magnet,
            size: this.parseSize(sizeText),
            seeders: this.parseCount(seeders),
            leechers: this.parseCount(leechers),
            provider: this.id,
          });
        });
      } catch (error) {
        logger.error(`${this.name} search failed`, { error });
      }

      return results;
    });
  }
}

// ============================================================================
// MAGNETDL
// ============================================================================

export class MagnetDLProvider extends HtmlScraperProvider {
  protected override mirrors = [
    'https://www.magnetdl.com',
    'https://magnetdl.hair',
    'https://magnetdl.org',
    'https://magnetdl.pages.dev',
  ];

  constructor() {
    super({
      id: 'magnetdl',
      name: 'MagnetDL',
      baseUrl: 'https://www.magnetdl.com',
      rateLimit: 20,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query).replace(/\s+/g, '-').toLowerCase();
    const cacheKey = `magnetdl:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const firstLetter = searchTerm.charAt(0);
        const searchUrl = `/${firstLetter}/${searchTerm}/`;
        const $ = await this.fetchWithMirrors(searchUrl);

        $('tr:not(.header)').each((_, row) => {
          const $row = $(row);
          const magnet = $row.find('a[href^="magnet:"]').attr('href');
          
          if (!magnet) return;
          const infoHash = this.extractInfoHash(magnet);
          if (!infoHash) return;

          const title = $row.find('td.n a').attr('title') || $row.find('td.n a').text().trim();
          const sizeText = $row.find('td:nth-child(6)').text().trim();
          const seeders = $row.find('td.s').text().trim();
          const leechers = $row.find('td.l').text().trim();

          results.push({
            title,
            infoHash,
            magnetUri: magnet,
            size: this.parseSize(sizeText),
            seeders: this.parseCount(seeders),
            leechers: this.parseCount(leechers),
            provider: this.id,
          });
        });
      } catch (error) {
        logger.error(`${this.name} search failed`, { error });
      }

      return results;
    });
  }
}

// ============================================================================
// LIMETORRENTS
// ============================================================================

export class LimeTorrentsProvider extends HtmlScraperProvider {
  protected override mirrors = [
    'https://www.limetorrents.lol',
    'https://limetor.com',
    'https://limetorrents.co',
    'https://limetorrents.to',
  ];

  constructor() {
    super({
      id: 'limetorrents',
      name: 'LimeTorrents',
      baseUrl: 'https://www.limetorrents.lol',
      rateLimit: 20,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `lime:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const category = query.type === 'movie' ? 'movies' : 'tv';
        const searchUrl = `/search/${category}/${encodeURIComponent(searchTerm)}/`;
        const $ = await this.fetchWithMirrors(searchUrl);

        $('table.table2 tr:not(:first-child)').each((_, row) => {
          const $row = $(row);
          const title = $row.find('td:first-child a:last-child').text().trim();
          const torrentPage = $row.find('td:first-child a:last-child').attr('href');

          if (!torrentPage) return;

          const sizeText = $row.find('td:nth-child(3)').text().trim();
          const seeders = $row.find('td.tdseed').text().trim();
          const leechers = $row.find('td.tdleech').text().trim();

          // Need to fetch individual page for magnet
          // Store partial result, will fetch hash separately
          results.push({
            title,
            infoHash: '', // Will be filled by individual fetch
            provider: this.id,
            size: this.parseSize(sizeText),
            seeders: this.parseCount(seeders),
            leechers: this.parseCount(leechers),
            category: torrentPage, // Temporarily store URL
          });
        });

        // Fetch magnet links for top results
        for (const result of results.slice(0, 15)) {
          if (result.category) {
            try {
              const page = await this.fetchWithMirrors(result.category);
              const magnet = page('a.csprite_dltorrent').attr('href');
              if (magnet && magnet.startsWith('magnet:')) {
                result.infoHash = this.extractInfoHash(magnet);
                result.magnetUri = magnet;
              }
            } catch {}
            delete result.category;
          }
        }

        return results.filter(r => r.infoHash);
      } catch (error) {
        logger.error(`${this.name} search failed`, { error });
        return [];
      }
    });
  }
}

// ============================================================================
// RARBG (Archive via DMM hash lists)
// ============================================================================

export class RARBGProvider extends JsonApiProvider {
  private hashLists: Map<string, Set<string>> = new Map();
  private loaded = false;

  constructor() {
    super({
      id: 'rarbg',
      name: 'RARBG (Archive)',
      baseUrl: 'https://raw.githubusercontent.com/debridmediamanager/hashlists/main',
      rateLimit: 60,
    });
  }

  async loadHashLists(): Promise<void> {
    if (this.loaded) return;

    try {
      // Load movie hash list
      const movieList = await this.fetchJson<string>('/movie.txt');
      const movieHashes = new Set(movieList.split('\n').filter(h => h.length === 40));
      this.hashLists.set('movie', movieHashes);

      // Load TV hash list
      const tvList = await this.fetchJson<string>('/tv.txt');
      const tvHashes = new Set(tvList.split('\n').filter(h => h.length === 40));
      this.hashLists.set('tv', tvHashes);

      this.loaded = true;
      logger.info('RARBG hash lists loaded', { 
        movies: movieHashes.size, 
        tv: tvHashes.size 
      });
    } catch (error) {
      logger.error('Failed to load RARBG hash lists', { error });
    }
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    // RARBG is archive-only, return empty for now
    // Would need to maintain local database of hash->metadata mappings
    return [];
  }

  hasHash(hash: string, type: 'movie' | 'tv'): boolean {
    return this.hashLists.get(type)?.has(hash.toLowerCase()) || false;
  }
}

// Export all Tier 1 providers
export const TIER1_PROVIDERS = [
  new YTSProvider(),
  new EZTVProvider(),
  new X1337Provider(),
  new ThePirateBayProvider(),
  new TorrentGalaxyProvider(),
  new KickassProvider(),
  new MagnetDLProvider(),
  new LimeTorrentsProvider(),
  new RARBGProvider(),
];
