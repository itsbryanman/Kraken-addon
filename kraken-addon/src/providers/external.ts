/**
 * Kraken External Indexer Integrations
 * 
 * Prowlarr and Jackett integration provides access to 500+ indexers
 * without maintaining individual scrapers
 */

import axios, { AxiosInstance } from 'axios';
import { TorrentResult, SearchQuery, Provider, ProviderStatus } from '../types';
import { logger } from '../utils/logger';
import { cache } from '../cache/manager';

// ============================================================================
// PROWLARR INTEGRATION
// ============================================================================

interface ProwlarrIndexer {
  id: number;
  name: string;
  protocol: string;
  privacy: string;
  capabilities: {
    categories: { id: number; name: string }[];
    searchParams: string[];
  };
}

interface ProwlarrResult {
  guid: string;
  title: string;
  size: number;
  publishDate: string;
  downloadUrl?: string;
  magnetUrl?: string;
  infoHash?: string;
  seeders?: number;
  leechers?: number;
  indexer: string;
  categories: { id: number; name: string }[];
  imdbId?: number;
}

export class ProwlarrProvider implements Provider {
  name = 'Prowlarr';
  id = 'prowlarr';
  enabled = true;
  categories: ('movies' | 'tv' | 'anime' | 'xxx' | 'other')[] = ['movies', 'tv', 'anime'];
  languages = ['en'];
  
  private client: AxiosInstance;
  private baseUrl: string;
  private apiKey: string;
  private indexers: ProwlarrIndexer[] = [];

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });
  }

  async initialize(): Promise<void> {
    try {
      const response = await this.client.get('/api/v1/indexer');
      this.indexers = response.data.filter((i: ProwlarrIndexer) => i.protocol === 'torrent');
      logger.info('Prowlarr initialized', { indexers: this.indexers.length });
    } catch (error) {
      logger.error('Failed to initialize Prowlarr', { error });
    }
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const results: TorrentResult[] = [];
    const cacheKey = `prowlarr:${JSON.stringify(query)}`;
    
    const cached = await cache.get<TorrentResult[]>(cacheKey);
    if (cached) return cached;

    try {
      // Determine categories based on content type
      const categories = this.getCategoryIds(query.type);
      
      // Build search params
      const params: Record<string, string | number> = {
        type: 'search',
        categories: categories.join(','),
        limit: 100,
      };

      if (query.imdbId) {
        // IMDB search - most accurate
        params.query = `{imdbid:${query.imdbId}}`;
      } else if (query.query) {
        params.query = query.query;
      }

      // Add season/episode for series
      if (query.type === 'series' && query.season !== undefined) {
        params.season = query.season;
        if (query.episode !== undefined) {
          params.episode = query.episode;
        }
      }

      const response = await this.client.get('/api/v1/search', { params });
      
      for (const item of response.data as ProwlarrResult[]) {
        // Extract info hash from magnet URL if not directly provided
        let infoHash = item.infoHash;
        if (!infoHash && item.magnetUrl) {
          const match = item.magnetUrl.match(/btih:([a-fA-F0-9]{40})/i);
          if (match) {
            infoHash = match[1];
          }
        }

        if (!infoHash) continue; // Skip if no hash available

        results.push({
          title: item.title,
          infoHash: infoHash.toLowerCase(),
          magnetUri: item.magnetUrl,
          size: item.size,
          seeders: item.seeders,
          leechers: item.leechers,
          provider: `Prowlarr/${item.indexer}`,
          uploadDate: new Date(item.publishDate),
          category: this.mapCategory(item.categories),
          imdbId: item.imdbId ? `tt${item.imdbId}` : undefined,
        });
      }

      await cache.set(cacheKey, results, 1800); // 30 min cache
    } catch (error) {
      logger.error('Prowlarr search failed', { error, query });
    }

    return results;
  }

  private getCategoryIds(type: 'movie' | 'series'): number[] {
    // Prowlarr/Newznab category IDs
    if (type === 'movie') {
      return [2000, 2010, 2020, 2030, 2040, 2045, 2050, 2060, 2070, 2080];
    }
    // TV
    return [5000, 5010, 5020, 5030, 5040, 5045, 5050, 5060, 5070, 5080];
  }

  private mapCategory(categories: { id: number; name: string }[]): string {
    const catId = categories[0]?.id || 0;
    if (catId >= 2000 && catId < 3000) return 'movies';
    if (catId >= 5000 && catId < 6000) return 'tv';
    return 'other';
  }

  async getStatus(): Promise<ProviderStatus> {
    try {
      const start = Date.now();
      await this.client.get('/api/v1/health');
      return {
        online: true,
        latency: Date.now() - start,
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        online: false,
        lastChecked: new Date(),
        error: String(error),
      };
    }
  }

  getIndexerCount(): number {
    return this.indexers.length;
  }
}

// ============================================================================
// JACKETT INTEGRATION
// ============================================================================

interface JackettIndexer {
  id: string;
  name: string;
  type: string;
  configured: boolean;
  site_link: string;
}

interface JackettResult {
  Title: string;
  Size: number;
  PublishDate: string;
  MagnetUri?: string;
  Link?: string;
  InfoHash?: string;
  Seeders?: number;
  Peers?: number;
  Tracker: string;
  CategoryDesc: string;
  Imdb?: number;
}

export class JackettProvider implements Provider {
  name = 'Jackett';
  id = 'jackett';
  enabled = true;
  categories: ('movies' | 'tv' | 'anime' | 'xxx' | 'other')[] = ['movies', 'tv', 'anime'];
  languages = ['en'];
  
  private client: AxiosInstance;
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const results: TorrentResult[] = [];
    const cacheKey = `jackett:${JSON.stringify(query)}`;
    
    const cached = await cache.get<TorrentResult[]>(cacheKey);
    if (cached) return cached;

    try {
      // Build search params for Jackett's Torznab API
      const params: Record<string, string | number> = {
        apikey: this.apiKey,
        t: 'search',
      };

      // Category mapping
      if (query.type === 'movie') {
        params.cat = '2000,2010,2020,2030,2040,2045,2050,2060,2070,2080';
      } else {
        params.cat = '5000,5010,5020,5030,5040,5045,5050,5060,5070,5080';
      }

      if (query.imdbId) {
        params.imdbid = query.imdbId;
      } else if (query.query) {
        params.q = query.query;
      }

      if (query.type === 'series' && query.season !== undefined) {
        params.season = query.season;
        if (query.episode !== undefined) {
          params.ep = query.episode;
        }
      }

      // Query all indexers
      const response = await this.client.get('/api/v2.0/indexers/all/results', { params });
      const items = response.data.Results || [];

      for (const item of items as JackettResult[]) {
        let infoHash = item.InfoHash;
        if (!infoHash && item.MagnetUri) {
          const match = item.MagnetUri.match(/btih:([a-fA-F0-9]{40})/i);
          if (match) {
            infoHash = match[1];
          }
        }

        if (!infoHash) continue;

        results.push({
          title: item.Title,
          infoHash: infoHash.toLowerCase(),
          magnetUri: item.MagnetUri,
          size: item.Size,
          seeders: item.Seeders,
          leechers: item.Peers ? item.Peers - (item.Seeders || 0) : undefined,
          provider: `Jackett/${item.Tracker}`,
          uploadDate: new Date(item.PublishDate),
          category: item.CategoryDesc,
          imdbId: item.Imdb ? `tt${item.Imdb}` : undefined,
        });
      }

      await cache.set(cacheKey, results, 1800);
    } catch (error) {
      logger.error('Jackett search failed', { error, query });
    }

    return results;
  }

  async getStatus(): Promise<ProviderStatus> {
    try {
      const start = Date.now();
      await this.client.get('/api/v2.0/server/config', {
        params: { apikey: this.apiKey },
      });
      return {
        online: true,
        latency: Date.now() - start,
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        online: false,
        lastChecked: new Date(),
        error: String(error),
      };
    }
  }

  async getIndexers(): Promise<JackettIndexer[]> {
    try {
      const response = await this.client.get('/api/v2.0/indexers', {
        params: { apikey: this.apiKey, configured: true },
      });
      return response.data;
    } catch {
      return [];
    }
  }
}

// ============================================================================
// ZILEAN INTEGRATION (DMM Database)
// ============================================================================

interface ZileanResult {
  info_hash: string;
  raw_title: string;
  size?: number;
  imdb_id?: string;
}

export class ZileanProvider implements Provider {
  name = 'Zilean';
  id = 'zilean';
  enabled = true;
  categories: ('movies' | 'tv' | 'anime' | 'xxx' | 'other')[] = ['movies', 'tv'];
  languages = ['en'];
  
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const results: TorrentResult[] = [];
    const cacheKey = `zilean:${JSON.stringify(query)}`;
    
    const cached = await cache.get<TorrentResult[]>(cacheKey);
    if (cached) return cached;

    try {
      let endpoint = '/dmm/search';
      const params: Record<string, string | number> = {};

      if (query.imdbId) {
        endpoint = `/dmm/imdb/${query.imdbId}`;
        if (query.season !== undefined) {
          params.season = query.season;
        }
        if (query.episode !== undefined) {
          params.episode = query.episode;
        }
      } else if (query.query) {
        params.query = query.query;
      }

      const response = await this.client.get(endpoint, { params });
      
      for (const item of response.data as ZileanResult[]) {
        results.push({
          title: item.raw_title,
          infoHash: item.info_hash.toLowerCase(),
          size: item.size,
          provider: 'Zilean/DMM',
          imdbId: item.imdb_id,
        });
      }

      await cache.set(cacheKey, results, 3600); // 1 hour cache for DMM data
    } catch (error) {
      logger.error('Zilean search failed', { error, query });
    }

    return results;
  }

  async getStatus(): Promise<ProviderStatus> {
    try {
      const start = Date.now();
      await this.client.get('/healthchecks/ping');
      return {
        online: true,
        latency: Date.now() - start,
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        online: false,
        lastChecked: new Date(),
        error: String(error),
      };
    }
  }
}

// ============================================================================
// TORRENTIO UPSTREAM (Use Torrentio as a source)
// ============================================================================

interface TorrentioStream {
  name: string;
  title: string;
  infoHash?: string;
  url?: string;
}

export class TorrentioProvider implements Provider {
  name = 'Torrentio';
  id = 'torrentio';
  enabled = false; // Disabled by default
  categories: ('movies' | 'tv' | 'anime' | 'xxx' | 'other')[] = ['movies', 'tv', 'anime'];
  languages = ['en'];
  
  private client: AxiosInstance;
  private baseUrl = 'https://torrentio.strem.fun';
  private config: string;

  constructor(config?: string) {
    // Default Torrentio config - all providers, no debrid
    this.config = config || 'providers=yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,magnetdl,horriblesubs,nyaasi,tokyotosho,anidex';
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const results: TorrentResult[] = [];
    
    if (!query.imdbId) return results; // Torrentio requires IMDB ID

    const cacheKey = `torrentio:${query.imdbId}:${query.season}:${query.episode}`;
    const cached = await cache.get<TorrentResult[]>(cacheKey);
    if (cached) return cached;

    try {
      // Build Stremio stream endpoint
      let endpoint = `/${this.config}/stream/`;
      if (query.type === 'movie') {
        endpoint += `movie/${query.imdbId}.json`;
      } else {
        endpoint += `series/${query.imdbId}:${query.season}:${query.episode}.json`;
      }

      const response = await this.client.get(endpoint);
      const streams = response.data.streams || [];

      for (const stream of streams as TorrentioStream[]) {
        if (!stream.infoHash) continue;

        // Parse Torrentio's title format
        const sizeMatch = stream.title?.match(/💾\s*([\d.]+)\s*(GB|MB)/i);
        const seedersMatch = stream.title?.match(/👥\s*(\d+)/);

        results.push({
          title: stream.name || stream.title || 'Unknown',
          infoHash: stream.infoHash.toLowerCase(),
          size: sizeMatch ? this.parseSize(sizeMatch[1]!, sizeMatch[2]!) : undefined,
          seeders: seedersMatch ? parseInt(seedersMatch[1]!, 10) : undefined,
          provider: 'Torrentio',
        });
      }

      await cache.set(cacheKey, results, 1800);
    } catch (error) {
      logger.error('Torrentio search failed', { error, query });
    }

    return results;
  }

  private parseSize(value: string, unit: string): number {
    const num = parseFloat(value);
    if (unit.toUpperCase() === 'GB') return num * 1024 * 1024 * 1024;
    if (unit.toUpperCase() === 'MB') return num * 1024 * 1024;
    return num;
  }

  async getStatus(): Promise<ProviderStatus> {
    try {
      const start = Date.now();
      await this.client.get('/manifest.json');
      return {
        online: true,
        latency: Date.now() - start,
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        online: false,
        lastChecked: new Date(),
        error: String(error),
      };
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createExternalProvider(
  type: 'prowlarr' | 'jackett' | 'zilean' | 'torrentio',
  config: { url?: string; apiKey?: string }
): Provider | null {
  switch (type) {
    case 'prowlarr':
      if (config.url && config.apiKey) {
        return new ProwlarrProvider(config.url, config.apiKey);
      }
      break;
    case 'jackett':
      if (config.url && config.apiKey) {
        return new JackettProvider(config.url, config.apiKey);
      }
      break;
    case 'zilean':
      if (config.url) {
        return new ZileanProvider(config.url);
      }
      break;
    case 'torrentio':
      return new TorrentioProvider();
  }
  return null;
}
