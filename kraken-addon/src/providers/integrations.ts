/**
 * Kraken External Integrations
 * 
 * Prowlarr, Jackett, Zilean, and Torrentio upstream support
 * These allow users to leverage their self-hosted indexer setups
 */

import { JsonApiProvider } from './base';
import { TorrentResult, SearchQuery, KrakenConfig } from '../types';
import { logger } from '../utils/logger';

// ============================================================================
// PROWLARR INTEGRATION
// ============================================================================

interface ProwlarrIndexer {
  id: number;
  name: string;
  enable: boolean;
  protocol: string;
}

interface ProwlarrResult {
  guid: string;
  title: string;
  infoHash?: string;
  magnetUrl?: string;
  downloadUrl?: string;
  size: number;
  seeders: number;
  leechers: number;
  publishDate: string;
  indexer: string;
  categories: Array<{ id: number; name: string }>;
}

export class ProwlarrProvider extends JsonApiProvider {
  private indexers: ProwlarrIndexer[] = [];
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    super({
      id: 'prowlarr',
      name: 'Prowlarr',
      baseUrl: baseUrl.replace(/\/$/, ''),
      rateLimit: 100,
    });
    this.apiKey = apiKey;
    this.client.defaults.headers['X-Api-Key'] = apiKey;
  }

  async initialize(): Promise<void> {
    try {
      this.indexers = await this.fetchJson<ProwlarrIndexer[]>('/api/v1/indexer');
      logger.info('Prowlarr initialized', { 
        indexers: this.indexers.filter(i => i.enable).length 
      });
    } catch (error) {
      logger.error('Prowlarr initialization failed', { error });
    }
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `prowlarr:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        // Prowlarr search categories
        // 2000 = Movies, 5000 = TV
        const categories = query.type === 'movie' ? [2000, 2010, 2020, 2030, 2040, 2045, 2050, 2060] 
                                                   : [5000, 5010, 5020, 5030, 5040, 5045, 5050, 5060];

        const searchParams: Record<string, string | number | string[]> = {
          query: searchTerm,
          type: 'search',
        };

        // Add IMDB if available
        if (query.imdbId) {
          searchParams['imdbId'] = query.imdbId;
        }

        const response = await this.fetchJson<ProwlarrResult[]>('/api/v1/search', {
          params: {
            ...searchParams,
            categories: categories.join(','),
          },
        });

        if (Array.isArray(response)) {
          for (const item of response) {
            let infoHash = item.infoHash;
            
            // Extract hash from magnet if not provided directly
            if (!infoHash && item.magnetUrl) {
              const match = item.magnetUrl.match(/btih:([a-f0-9]{40})/i);
              if (match) infoHash = match[1];
            }

            if (!infoHash) continue;

            results.push({
              title: item.title,
              infoHash: infoHash.toLowerCase(),
              magnetUri: item.magnetUrl,
              size: item.size,
              seeders: item.seeders,
              leechers: item.leechers,
              provider: `prowlarr:${item.indexer}`,
              uploadDate: new Date(item.publishDate),
            });
          }
        }
      } catch (error) {
        logger.error('Prowlarr search failed', { error });
      }

      return results;
    }, 900); // 15 min cache for Prowlarr
  }

  getIndexerCount(): number {
    return this.indexers.filter(i => i.enable).length;
  }
}

// ============================================================================
// JACKETT INTEGRATION
// ============================================================================

interface JackettResult {
  Title: string;
  Guid: string;
  Link?: string;
  MagnetUri?: string;
  InfoHash?: string;
  Size: number;
  Seeders: number;
  Peers: number;
  PublishDate: string;
  Tracker: string;
  CategoryDesc: string;
}

interface JackettResponse {
  Results: JackettResult[];
  Indexers: Array<{ ID: string; Name: string }>;
}

export class JackettProvider extends JsonApiProvider {
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    super({
      id: 'jackett',
      name: 'Jackett',
      baseUrl: baseUrl.replace(/\/$/, ''),
      rateLimit: 100,
    });
    this.apiKey = apiKey;
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `jackett:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        // Jackett categories
        // 2000 = Movies, 5000 = TV
        const categories = query.type === 'movie' 
          ? '2000,2010,2020,2030,2040,2045,2050,2060,2070'
          : '5000,5010,5020,5030,5040,5045,5050,5060,5070';

        const response = await this.fetchJson<JackettResponse>('/api/v2.0/indexers/all/results', {
          params: {
            apikey: this.apiKey,
            Query: searchTerm,
            Category: categories,
          },
        });

        if (response.Results) {
          for (const item of response.Results) {
            let infoHash = item.InfoHash;

            // Extract from magnet if not provided
            if (!infoHash && item.MagnetUri) {
              const match = item.MagnetUri.match(/btih:([a-f0-9]{40})/i);
              if (match) infoHash = match[1];
            }

            if (!infoHash) continue;

            results.push({
              title: item.Title,
              infoHash: infoHash.toLowerCase(),
              magnetUri: item.MagnetUri,
              size: item.Size,
              seeders: item.Seeders,
              leechers: item.Peers - item.Seeders,
              provider: `jackett:${item.Tracker}`,
              uploadDate: new Date(item.PublishDate),
            });
          }
        }
      } catch (error) {
        logger.error('Jackett search failed', { error });
      }

      return results;
    }, 900);
  }
}

// ============================================================================
// ZILEAN INTEGRATION (DMM Scraper)
// ============================================================================

interface ZileanResult {
  info_hash: string;
  raw_title: string;
  size: number;
  parsed_title?: {
    title: string;
    year?: number;
    resolution?: string;
    quality?: string;
  };
}

interface ZileanResponse {
  results: ZileanResult[];
  total: number;
}

export class ZileanProvider extends JsonApiProvider {
  constructor(baseUrl: string) {
    super({
      id: 'zilean',
      name: 'Zilean',
      baseUrl: baseUrl.replace(/\/$/, ''),
      rateLimit: 100,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const cacheKey = `zilean:${query.imdbId}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        if (!query.imdbId) {
          // Zilean works best with IMDB IDs
          return results;
        }

        // Search by IMDB ID
        const response = await this.fetchJson<ZileanResponse>('/dmm/search', {
          params: {
            imdb_id: query.imdbId,
          },
        });

        if (response.results) {
          for (const item of response.results) {
            // Filter by season/episode if series
            if (query.type === 'series' && query.season !== undefined) {
              const seasonMatch = item.raw_title.match(/s(\d{1,2})/i);
              if (seasonMatch && parseInt(seasonMatch[1]!, 10) !== query.season) {
                continue;
              }
              if (query.episode !== undefined) {
                const episodeMatch = item.raw_title.match(/e(\d{1,3})/i);
                if (episodeMatch && parseInt(episodeMatch[1]!, 10) !== query.episode) {
                  continue;
                }
              }
            }

            results.push({
              title: item.raw_title,
              infoHash: item.info_hash.toLowerCase(),
              size: item.size,
              provider: this.id,
              seeders: 100, // Zilean doesn't provide seeder counts, estimate high since DMM verified
              leechers: 10,
            });
          }
        }
      } catch (error) {
        logger.error('Zilean search failed', { error });
      }

      return results;
    }, 3600); // 1 hour cache - DMM data is stable
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
  behaviorHints?: {
    bingeGroup?: string;
    filename?: string;
  };
}

interface TorrentioResponse {
  streams: TorrentioStream[];
}

export class TorrentioUpstreamProvider extends JsonApiProvider {
  private config: string;

  constructor(config?: string) {
    super({
      id: 'torrentio',
      name: 'Torrentio (Upstream)',
      baseUrl: 'https://torrentio.strem.fun',
      rateLimit: 30,
    });
    // Default config: all providers, quality sort
    this.config = config || 'sort=qualitysize|qualityfilter=other';
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const cacheKey = `torrentio:${query.imdbId}:${query.season}:${query.episode}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        if (!query.imdbId) return results;

        let endpoint = `/${this.config}/stream`;
        
        if (query.type === 'movie') {
          endpoint += `/movie/${query.imdbId}.json`;
        } else {
          const id = query.season !== undefined && query.episode !== undefined
            ? `${query.imdbId}:${query.season}:${query.episode}`
            : query.imdbId;
          endpoint += `/series/${id}.json`;
        }

        const response = await this.fetchJson<TorrentioResponse>(endpoint);

        if (response.streams) {
          for (const stream of response.streams) {
            if (!stream.infoHash) continue;

            // Parse Torrentio's title format to extract metadata
            const sizeMatch = stream.title?.match(/💾\s*([\d.]+\s*[KMGT]B)/i);
            const seedersMatch = stream.title?.match(/👤\s*(\d+)/);

            results.push({
              title: stream.title || stream.name,
              infoHash: stream.infoHash.toLowerCase(),
              size: sizeMatch ? this.parseSize(sizeMatch[1]!) : undefined,
              seeders: seedersMatch ? parseInt(seedersMatch[1]!, 10) : 0,
              leechers: 0,
              provider: 'torrentio',
            });
          }
        }
      } catch (error) {
        logger.error('Torrentio upstream search failed', { error });
      }

      return results;
    }, 1800);
  }
}

// ============================================================================
// COMET UPSTREAM (Another Stremio addon as source)
// ============================================================================

export class CometUpstreamProvider extends JsonApiProvider {
  private config: string;

  constructor(baseUrl: string, config?: string) {
    super({
      id: 'comet',
      name: 'Comet (Upstream)',
      baseUrl: baseUrl.replace(/\/$/, ''),
      rateLimit: 30,
    });
    this.config = config || '';
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const cacheKey = `comet:${query.imdbId}:${query.season}:${query.episode}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        if (!query.imdbId) return results;

        let endpoint = this.config ? `/${this.config}/stream` : '/stream';
        
        if (query.type === 'movie') {
          endpoint += `/movie/${query.imdbId}.json`;
        } else {
          const id = query.season !== undefined && query.episode !== undefined
            ? `${query.imdbId}:${query.season}:${query.episode}`
            : query.imdbId;
          endpoint += `/series/${id}.json`;
        }

        const response = await this.fetchJson<TorrentioResponse>(endpoint);

        if (response.streams) {
          for (const stream of response.streams) {
            if (!stream.infoHash) continue;

            results.push({
              title: stream.title || stream.name,
              infoHash: stream.infoHash.toLowerCase(),
              provider: 'comet',
              seeders: 0,
              leechers: 0,
            });
          }
        }
      } catch (error) {
        logger.error('Comet upstream search failed', { error });
      }

      return results;
    }, 1800);
  }
}

// ============================================================================
// MEDIAFUSION UPSTREAM
// ============================================================================

export class MediaFusionUpstreamProvider extends JsonApiProvider {
  private config: string;

  constructor(baseUrl: string, config?: string) {
    super({
      id: 'mediafusion',
      name: 'MediaFusion (Upstream)',
      baseUrl: baseUrl.replace(/\/$/, ''),
      rateLimit: 30,
    });
    this.config = config || '';
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const cacheKey = `mf:${query.imdbId}:${query.season}:${query.episode}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        if (!query.imdbId) return results;

        let endpoint = this.config ? `/${this.config}/stream` : '/stream';
        
        if (query.type === 'movie') {
          endpoint += `/movie/${query.imdbId}.json`;
        } else {
          const id = query.season !== undefined && query.episode !== undefined
            ? `${query.imdbId}:${query.season}:${query.episode}`
            : query.imdbId;
          endpoint += `/series/${id}.json`;
        }

        const response = await this.fetchJson<TorrentioResponse>(endpoint);

        if (response.streams) {
          for (const stream of response.streams) {
            if (!stream.infoHash) continue;

            results.push({
              title: stream.title || stream.name,
              infoHash: stream.infoHash.toLowerCase(),
              provider: 'mediafusion',
              seeders: 0,
              leechers: 0,
            });
          }
        }
      } catch (error) {
        logger.error('MediaFusion upstream search failed', { error });
      }

      return results;
    }, 1800);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createIntegrationProvider(
  type: 'prowlarr' | 'jackett' | 'zilean' | 'torrentio' | 'comet' | 'mediafusion',
  config: { url?: string; apiKey?: string; config?: string }
): JsonApiProvider | null {
  switch (type) {
    case 'prowlarr':
      if (!config.url || !config.apiKey) return null;
      return new ProwlarrProvider(config.url, config.apiKey);
    
    case 'jackett':
      if (!config.url || !config.apiKey) return null;
      return new JackettProvider(config.url, config.apiKey);
    
    case 'zilean':
      if (!config.url) return null;
      return new ZileanProvider(config.url);
    
    case 'torrentio':
      return new TorrentioUpstreamProvider(config.config);
    
    case 'comet':
      if (!config.url) return null;
      return new CometUpstreamProvider(config.url, config.config);
    
    case 'mediafusion':
      if (!config.url) return null;
      return new MediaFusionUpstreamProvider(config.url, config.config);
    
    default:
      return null;
  }
}
