/**
 * Kraken Regional & Specialty Providers
 * 
 * Indian, Korean, German sources + Meta-search engines
 */

import { HtmlScraperProvider, JsonApiProvider } from './base';
import { TorrentResult, SearchQuery } from '../types';
import { logger } from '../utils/logger';

// ============================================================================
// INDIAN PROVIDERS
// ============================================================================

export class TamilBlastersProvider extends HtmlScraperProvider {
  constructor() {
    super({
      id: 'tamilblasters',
      name: 'TamilBlasters',
      baseUrl: 'https://tamilblasters.bond',
      rateLimit: 15,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `tb:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const searchUrl = `/?s=${encodeURIComponent(searchTerm)}`;
        const $ = await this.fetchPage(searchUrl);

        $('article.post').each((_, article) => {
          const $article = $(article);
          const title = $article.find('h2.entry-title a').text().trim();
          const link = $article.find('h2.entry-title a').attr('href');

          if (!link) return;

          results.push({
            title,
            infoHash: '',
            provider: this.id,
            category: link,
            seeders: 0,
            leechers: 0,
          });
        });

        for (const result of results.slice(0, 15)) {
          if (result.category) {
            try {
              const page = await this.fetchPage(result.category);
              const magnet = page('a[href^="magnet:"]').first().attr('href');
              if (magnet) {
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

export class TamilMVProvider extends HtmlScraperProvider {
  constructor() {
    super({
      id: 'tamilmv',
      name: 'TamilMV',
      baseUrl: 'https://www.1tamilmv.tf',
      rateLimit: 15,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `tmv:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const searchUrl = `/index.php?/search/&q=${encodeURIComponent(searchTerm)}&type=forums_topic`;
        const $ = await this.fetchPage(searchUrl);

        $('ol.ipsStream li.ipsStreamItem').each((_, item) => {
          const $item = $(item);
          const title = $item.find('h2.ipsStreamItem_title a').text().trim();
          const link = $item.find('h2.ipsStreamItem_title a').attr('href');

          if (!link) return;

          results.push({
            title,
            infoHash: '',
            provider: this.id,
            category: link,
            seeders: 0,
            leechers: 0,
          });
        });

        for (const result of results.slice(0, 15)) {
          if (result.category) {
            try {
              const page = await this.fetchPage(result.category);
              const magnet = page('a[href^="magnet:"]').first().attr('href');
              if (magnet) {
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

export class Bolly4uProvider extends HtmlScraperProvider {
  constructor() {
    super({
      id: 'bolly4u',
      name: 'Bolly4u',
      baseUrl: 'https://bolly4u.surf',
      rateLimit: 15,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `b4u:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const searchUrl = `/?s=${encodeURIComponent(searchTerm)}`;
        const $ = await this.fetchPage(searchUrl);

        $('article.post-box').each((_, article) => {
          const $article = $(article);
          const title = $article.find('h2.post-title a').text().trim();
          const link = $article.find('h2.post-title a').attr('href');

          if (!link) return;

          results.push({
            title,
            infoHash: '',
            provider: this.id,
            category: link,
            seeders: 0,
            leechers: 0,
          });
        });

        for (const result of results.slice(0, 15)) {
          if (result.category) {
            try {
              const page = await this.fetchPage(result.category);
              const magnet = page('a[href^="magnet:"]').first().attr('href');
              if (magnet) {
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
// KOREAN PROVIDERS
// ============================================================================

export class TorrentQQProvider extends HtmlScraperProvider {
  constructor() {
    super({
      id: 'torrentqq',
      name: 'TorrentQQ',
      baseUrl: 'https://torrentqq.com',
      rateLimit: 15,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `tqq:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const searchUrl = `/search/${encodeURIComponent(searchTerm)}`;
        const $ = await this.fetchPage(searchUrl);

        $('div.list-item').each((_, item) => {
          const $item = $(item);
          const title = $item.find('a.title').text().trim();
          const link = $item.find('a.title').attr('href');

          if (!link) return;

          results.push({
            title,
            infoHash: '',
            provider: this.id,
            category: link,
            seeders: 0,
            leechers: 0,
          });
        });

        for (const result of results.slice(0, 15)) {
          if (result.category) {
            try {
              const page = await this.fetchPage(result.category);
              const magnet = page('a[href^="magnet:"]').first().attr('href');
              if (magnet) {
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
// GERMAN PROVIDERS
// ============================================================================

export class FilmPalastProvider extends HtmlScraperProvider {
  constructor() {
    super({
      id: 'filmpalast',
      name: 'FilmPalast',
      baseUrl: 'https://filmpalast.to',
      rateLimit: 15,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `fp:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const searchUrl = `/search/title/${encodeURIComponent(searchTerm)}`;
        const $ = await this.fetchPage(searchUrl);

        $('article.liste').each((_, article) => {
          const $article = $(article);
          const title = $article.find('h3 a').text().trim();
          const link = $article.find('h3 a').attr('href');

          if (!link) return;

          results.push({
            title,
            infoHash: '',
            provider: this.id,
            category: link,
            seeders: 0,
            leechers: 0,
          });
        });

        for (const result of results.slice(0, 15)) {
          if (result.category) {
            try {
              const page = await this.fetchPage(result.category);
              const magnet = page('a[href^="magnet:"]').first().attr('href');
              if (magnet) {
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
// SPECIALTY / META-SEARCH PROVIDERS
// ============================================================================

interface BTDiggResult {
  name: string;
  info_hash: string;
  size: number;
  files: number;
  added: string;
}

export class BTDiggProvider extends HtmlScraperProvider {
  constructor() {
    super({
      id: 'btdig',
      name: 'BTDigg',
      baseUrl: 'https://btdig.com',
      rateLimit: 10,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `btdig:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const searchUrl = `/search?q=${encodeURIComponent(searchTerm)}&order=0`;
        const $ = await this.fetchPage(searchUrl);

        $('div.one_result').each((_, result) => {
          const $result = $(result);
          const title = $result.find('div.torrent_name a').text().trim();
          const infoHash = $result.find('div.torrent_magnet a').attr('href')?.match(/btih:([a-f0-9]{40})/i)?.[1];
          
          if (!infoHash) return;

          const sizeText = $result.find('span.torrent_size').text().trim();

          results.push({
            title,
            infoHash: infoHash.toLowerCase(),
            size: this.parseSize(sizeText),
            provider: this.id,
            seeders: 0, // DHT search doesn't provide seeders
            leechers: 0,
          });
        });
      } catch (error) {
        logger.error(`${this.name} search failed`, { error });
      }

      return results;
    });
  }
}

interface SolidTorrentsResult {
  _id: string;
  title: string;
  infohash: string;
  size: number;
  seeders: number;
  leechers: number;
  uploaded: string;
  category: string;
}

interface SolidTorrentsResponse {
  results: SolidTorrentsResult[];
  total: number;
}

export class SolidTorrentsProvider extends JsonApiProvider {
  constructor() {
    super({
      id: 'solidtorrents',
      name: 'Solid Torrents',
      baseUrl: 'https://solidtorrents.to/api/v1',
      rateLimit: 20,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `solid:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const category = query.type === 'movie' ? 'Video' : 'Video';
        const response = await this.fetchJson<SolidTorrentsResponse>('/search', {
          params: {
            q: searchTerm,
            category,
            sort: 'seeders',
          },
        });

        if (response.results) {
          for (const item of response.results) {
            results.push({
              title: item.title,
              infoHash: item.infohash.toLowerCase(),
              size: item.size,
              seeders: item.seeders,
              leechers: item.leechers,
              provider: this.id,
              uploadDate: new Date(item.uploaded),
            });
          }
        }
      } catch (error) {
        logger.error(`${this.name} search failed`, { error });
      }

      return results;
    });
  }
}

interface BitSearchResult {
  name: string;
  info_hash: string;
  size: number;
  seeders: number;
  leechers: number;
  added: string;
  source: string;
}

export class BitSearchProvider extends JsonApiProvider {
  constructor() {
    super({
      id: 'bitsearch',
      name: 'BitSearch',
      baseUrl: 'https://bitsearch.to/api',
      rateLimit: 20,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `bits:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const response = await this.fetchJson<BitSearchResult[]>('/search', {
          params: {
            q: searchTerm,
            sort: 'seeders',
            order: 'desc',
          },
        });

        if (Array.isArray(response)) {
          for (const item of response) {
            results.push({
              title: item.name,
              infoHash: item.info_hash.toLowerCase(),
              size: item.size,
              seeders: item.seeders,
              leechers: item.leechers,
              provider: this.id,
              uploadDate: new Date(item.added),
            });
          }
        }
      } catch (error) {
        logger.error(`${this.name} search failed`, { error });
      }

      return results;
    });
  }
}

export class GLODLSProvider extends HtmlScraperProvider {
  constructor() {
    super({
      id: 'glodls',
      name: 'GLODLS',
      baseUrl: 'https://glodls.to',
      rateLimit: 15,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `glo:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const searchUrl = `/search_results.php?search=${encodeURIComponent(searchTerm)}&sort=seeders&order=desc`;
        const $ = await this.fetchPage(searchUrl);

        $('table.ttable_headinner tr:not(:first-child)').each((_, row) => {
          const $row = $(row);
          const title = $row.find('td:nth-child(2) a b').text().trim();
          const magnet = $row.find('a[href^="magnet:"]').attr('href');

          if (!magnet) return;
          const infoHash = this.extractInfoHash(magnet);
          if (!infoHash) return;

          const sizeText = $row.find('td:nth-child(5)').text().trim();
          const seeders = $row.find('td:nth-child(6) font[color="green"]').text().trim();
          const leechers = $row.find('td:nth-child(6) font[color="red"]').text().trim();

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

export class ZooqleProvider extends HtmlScraperProvider {
  constructor() {
    super({
      id: 'zooqle',
      name: 'Zooqle',
      baseUrl: 'https://zooqle.skin',
      rateLimit: 15,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `zoo:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const category = query.type === 'movie' ? 'Movies' : 'TV';
        const searchUrl = `/search?q=${encodeURIComponent(searchTerm)}+category%3A${category}`;
        const $ = await this.fetchPage(searchUrl);

        $('table.table-torrents tbody tr').each((_, row) => {
          const $row = $(row);
          const title = $row.find('td:nth-child(2) a').first().text().trim();
          const magnet = $row.find('a[href^="magnet:"]').attr('href');

          if (!magnet) return;
          const infoHash = this.extractInfoHash(magnet);
          if (!infoHash) return;

          const sizeText = $row.find('td:nth-child(4)').text().trim();
          const seedText = $row.find('td:nth-child(6) .progress').attr('title') || '';
          const seedMatch = seedText.match(/Seeders:\s*(\d+)/);
          const leechMatch = seedText.match(/Leechers:\s*(\d+)/);

          results.push({
            title,
            infoHash,
            magnetUri: magnet,
            size: this.parseSize(sizeText),
            seeders: seedMatch ? parseInt(seedMatch[1]!, 10) : 0,
            leechers: leechMatch ? parseInt(leechMatch[1]!, 10) : 0,
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

// Export regional and specialty providers
export const REGIONAL_PROVIDERS = [
  // Indian
  new TamilBlastersProvider(),
  new TamilMVProvider(),
  new Bolly4uProvider(),
  // Korean
  new TorrentQQProvider(),
  // German
  new FilmPalastProvider(),
];

export const SPECIALTY_PROVIDERS = [
  new BTDiggProvider(),
  new SolidTorrentsProvider(),
  new BitSearchProvider(),
  new GLODLSProvider(),
  new ZooqleProvider(),
];
