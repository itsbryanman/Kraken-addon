/**
 * Kraken Anime Providers
 * 
 * Comprehensive anime torrent sources
 */

import { HtmlScraperProvider, RssProvider, JsonApiProvider } from './base';
import { TorrentResult, SearchQuery } from '../types';
import { logger } from '../utils/logger';

// ============================================================================
// NYAA.SI - Primary Anime Source
// ============================================================================

export class NyaaProvider extends HtmlScraperProvider {
  constructor() {
    super({
      id: 'nyaasi',
      name: 'Nyaa.si',
      baseUrl: 'https://nyaa.si',
      rateLimit: 30,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    if (!query.query?.trim() && query.imdbId) {
      logger.warn('Nyaa: No search term available, skipping', { imdbId: query.imdbId });
      return [];
    }

    const searchTerm = this.buildSearchQuery(query);
    if (!searchTerm.trim()) {
      logger.warn('Nyaa: No search term available, skipping', { imdbId: query.imdbId });
      return [];
    }

    const cacheKey = `nyaa:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        // Category 1_2 = Anime - English-translated
        const searchUrl = `/?f=0&c=1_2&q=${encodeURIComponent(searchTerm)}&s=seeders&o=desc`;
        const $ = await this.fetchPage(searchUrl);

        $('table.torrent-list tbody tr').each((_, row) => {
          const $row = $(row);
          const title = $row.find('td:nth-child(2) a:not(.comments)').last().text().trim();
          const magnet = $row.find('a[href^="magnet:"]').attr('href');

          if (!magnet) return;
          const infoHash = this.extractInfoHash(magnet);
          if (!infoHash) return;

          const sizeText = $row.find('td:nth-child(4)').text().trim();
          const seeders = $row.find('td:nth-child(6)').text().trim();
          const leechers = $row.find('td:nth-child(7)').text().trim();
          const dateText = $row.find('td:nth-child(5)').attr('data-timestamp');

          results.push({
            title,
            infoHash,
            magnetUri: magnet,
            size: this.parseSize(sizeText),
            seeders: this.parseCount(seeders),
            leechers: this.parseCount(leechers),
            provider: this.id,
            uploadDate: dateText ? new Date(parseInt(dateText, 10) * 1000) : undefined,
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
// NYAA PANTSU - Alternative Nyaa
// ============================================================================

interface NyaaPantsuResult {
  id: number;
  name: string;
  hash: string;
  filesize: number;
  seeders: number;
  leechers: number;
  date: string;
}

interface NyaaPantsuResponse {
  torrents: NyaaPantsuResult[];
  total: number;
}

export class NyaaPantsuProvider extends JsonApiProvider {
  constructor() {
    super({
      id: 'nyaapantsu',
      name: 'Nyaa Pantsu',
      baseUrl: 'https://nyaa.net/api',
      rateLimit: 30,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `pantsu:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const response = await this.fetchJson<NyaaPantsuResponse>('/search', {
          params: {
            q: searchTerm,
            c: '3_5', // Anime - English-translated
            s: 'seeders',
            order: 'desc',
            limit: 75,
          },
        });

        if (response.torrents) {
          for (const torrent of response.torrents) {
            results.push({
              title: torrent.name,
              infoHash: torrent.hash.toLowerCase(),
              size: torrent.filesize,
              seeders: torrent.seeders,
              leechers: torrent.leechers,
              provider: this.id,
              uploadDate: new Date(torrent.date),
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

// ============================================================================
// TOKYO TOSHO - Anime Aggregator
// ============================================================================

export class TokyoToshoProvider extends RssProvider {
  constructor() {
    super({
      id: 'tokyotosho',
      name: 'TokyoTosho',
      baseUrl: 'https://www.tokyotosho.info',
      rateLimit: 20,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `tt:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        // Type 1 = Anime
        const searchUrl = `/rss.php?terms=${encodeURIComponent(searchTerm)}&type=1`;
        const $ = await this.fetchRss(searchUrl);

        $('item').each((_, item) => {
          const $item = $(item);
          const title = $item.find('title').text().trim();
          const link = $item.find('link').text().trim();
          
          // TokyoTosho links directly to magnets
          if (!link.startsWith('magnet:')) return;
          
          const infoHash = this.extractInfoHash(link);
          if (!infoHash) return;

          const description = $item.find('description').text();
          const sizeMatch = description.match(/Size:\s*([\d.]+\s*[KMGT]?B)/i);
          const dateText = $item.find('pubDate').text();

          results.push({
            title,
            infoHash,
            magnetUri: link,
            size: sizeMatch ? this.parseSize(sizeMatch[1]!) : undefined,
            provider: this.id,
            uploadDate: dateText ? new Date(dateText) : undefined,
            seeders: 0, // RSS doesn't provide seeders
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

// ============================================================================
// ANIDEX - Multi-language Anime
// ============================================================================

export class AniDexProvider extends HtmlScraperProvider {
  constructor() {
    super({
      id: 'anidex',
      name: 'AniDex',
      baseUrl: 'https://anidex.info',
      rateLimit: 30,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `anidex:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        // Category 1 = Anime, Language 1 = English
        const searchUrl = `/?q=${encodeURIComponent(searchTerm)}&id=1&lang_id=1&s=seeders&o=desc`;
        const $ = await this.fetchPage(searchUrl);

        $('div#content table tbody tr').each((_, row) => {
          const $row = $(row);
          const title = $row.find('td.text-left a span').text().trim() || 
                        $row.find('td.text-left a').first().text().trim();
          const magnet = $row.find('a[href^="magnet:"]').attr('href');

          if (!magnet) return;
          const infoHash = this.extractInfoHash(magnet);
          if (!infoHash) return;

          const sizeText = $row.find('td:nth-child(7)').text().trim();
          const seeders = $row.find('td:nth-child(8)').text().trim();
          const leechers = $row.find('td:nth-child(9)').text().trim();

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
// SUBSPLEASE - Fast Anime Releases
// ============================================================================

export class SubsPleaseProvider extends RssProvider {
  constructor() {
    super({
      id: 'subsplease',
      name: 'SubsPlease',
      baseUrl: 'https://subsplease.org',
      rateLimit: 60,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `sp:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        // SubsPlease has limited search, primarily browse by show
        const searchUrl = `/rss/?r=1080&t=${encodeURIComponent(searchTerm)}`;
        const $ = await this.fetchRss(searchUrl);

        $('item').each((_, item) => {
          const $item = $(item);
          const title = $item.find('title').text().trim();
          const link = $item.find('link').text().trim();

          // Extract hash from torrent URL
          const hashMatch = link.match(/([a-f0-9]{40})/i);
          if (!hashMatch) return;

          const infoHash = hashMatch[1]!.toLowerCase();
          const dateText = $item.find('pubDate').text();

          results.push({
            title: `[SubsPlease] ${title}`,
            infoHash,
            provider: this.id,
            uploadDate: dateText ? new Date(dateText) : undefined,
            seeders: 100, // SubsPlease typically well-seeded
            leechers: 10,
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
// ANIME TOSHO - Metadata Aggregator
// ============================================================================

interface AnimeToshoResult {
  id: number;
  title: string;
  link: string;
  magnet_uri: string;
  info_hash: string;
  total_size: number;
  seeders: number;
  leechers: number;
  timestamp: number;
  anidb_aid?: number;
  anidb_eid?: number;
  anidb_fid?: number;
}

export class AnimeToshoProvider extends JsonApiProvider {
  constructor() {
    super({
      id: 'animetosho',
      name: 'AnimeTosho',
      baseUrl: 'https://feed.animetosho.org',
      rateLimit: 30,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `at:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const response = await this.fetchJson<AnimeToshoResult[]>('/json', {
          params: {
            q: searchTerm,
            qx: 1, // Extended search
            order: 'size-d', // Order by size descending (usually better quality)
          },
        });

        if (Array.isArray(response)) {
          for (const item of response) {
            if (!item.info_hash) continue;

            results.push({
              title: item.title,
              infoHash: item.info_hash.toLowerCase(),
              magnetUri: item.magnet_uri,
              size: item.total_size,
              seeders: item.seeders || 0,
              leechers: item.leechers || 0,
              provider: this.id,
              uploadDate: new Date(item.timestamp * 1000),
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

// ============================================================================
// ACGNX - Chinese/Japanese Anime
// ============================================================================

export class ACGNXProvider extends RssProvider {
  constructor() {
    super({
      id: 'acgnx',
      name: 'ACGNX',
      baseUrl: 'https://share.acgnx.se',
      rateLimit: 20,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `acgnx:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const searchUrl = `/rss.xml?keyword=${encodeURIComponent(searchTerm)}`;
        const $ = await this.fetchRss(searchUrl);

        $('item').each((_, item) => {
          const $item = $(item);
          const title = $item.find('title').text().trim();
          const enclosure = $item.find('enclosure');
          const magnetLink = enclosure.attr('url') || '';

          if (!magnetLink.startsWith('magnet:')) return;
          const infoHash = this.extractInfoHash(magnetLink);
          if (!infoHash) return;

          const sizeBytes = parseInt(enclosure.attr('length') || '0', 10);
          const dateText = $item.find('pubDate').text();

          results.push({
            title,
            infoHash,
            magnetUri: magnetLink,
            size: sizeBytes || undefined,
            provider: this.id,
            uploadDate: dateText ? new Date(dateText) : undefined,
            seeders: 0,
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

// ============================================================================
// BANGUMI MOE - Chinese Anime Tracker
// ============================================================================

interface BangumiResult {
  _id: string;
  title: string;
  infoHash: string;
  size: string;
  magnet: string;
  publishDate: string;
}

interface BangumiResponse {
  torrents: BangumiResult[];
  count: number;
}

export class BangumiMoeProvider extends JsonApiProvider {
  constructor() {
    super({
      id: 'bangumi',
      name: 'Bangumi Moe',
      baseUrl: 'https://bangumi.moe/api',
      rateLimit: 20,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `bgm:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const response = await this.postJson<BangumiResponse>('/torrent/search', {
          query: searchTerm,
        });

        if (response.torrents) {
          for (const torrent of response.torrents) {
            results.push({
              title: torrent.title,
              infoHash: torrent.infoHash.toLowerCase(),
              magnetUri: torrent.magnet,
              size: this.parseSize(torrent.size),
              provider: this.id,
              uploadDate: new Date(torrent.publishDate),
              seeders: 0,
              leechers: 0,
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

// ============================================================================
// ERAI-RAWS - Raw/Subbed Anime
// ============================================================================

export class EraiRawsProvider extends RssProvider {
  constructor() {
    super({
      id: 'erairaws',
      name: 'Erai-raws',
      baseUrl: 'https://www.erai-raws.info',
      rateLimit: 30,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `erai:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        // Erai-raws uses RSS feeds per show
        const searchUrl = `/rss-all-magnet?search=${encodeURIComponent(searchTerm)}`;
        const $ = await this.fetchRss(searchUrl);

        $('item').each((_, item) => {
          const $item = $(item);
          const title = $item.find('title').text().trim();
          const link = $item.find('link').text().trim();

          if (!link.startsWith('magnet:')) return;
          const infoHash = this.extractInfoHash(link);
          if (!infoHash) return;

          const dateText = $item.find('pubDate').text();

          results.push({
            title: `[Erai-raws] ${title}`,
            infoHash,
            magnetUri: link,
            provider: this.id,
            uploadDate: dateText ? new Date(dateText) : undefined,
            seeders: 50, // Typically well-seeded
            leechers: 5,
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
// SHANA PROJECT - Anime Tracker
// ============================================================================

export class ShanaProjectProvider extends RssProvider {
  constructor() {
    super({
      id: 'shana',
      name: 'Shana Project',
      baseUrl: 'https://www.shanaproject.com',
      rateLimit: 20,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `shana:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const searchUrl = `/feeds/magnet/?filter=${encodeURIComponent(searchTerm)}&sort=date`;
        const $ = await this.fetchRss(searchUrl);

        $('item').each((_, item) => {
          const $item = $(item);
          const title = $item.find('title').text().trim();
          const link = $item.find('link').text().trim();

          if (!link.startsWith('magnet:')) return;
          const infoHash = this.extractInfoHash(link);
          if (!infoHash) return;

          const dateText = $item.find('pubDate').text();

          results.push({
            title,
            infoHash,
            magnetUri: link,
            provider: this.id,
            uploadDate: dateText ? new Date(dateText) : undefined,
            seeders: 0,
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

// Export all anime providers
export const ANIME_PROVIDERS = [
  new NyaaProvider(),
  new NyaaPantsuProvider(),
  new TokyoToshoProvider(),
  new AniDexProvider(),
  new SubsPleaseProvider(),
  new AnimeToshoProvider(),
  new ACGNXProvider(),
  new BangumiMoeProvider(),
  new EraiRawsProvider(),
  new ShanaProjectProvider(),
];
