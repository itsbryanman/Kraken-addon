/**
 * Kraken International Providers
 * 
 * Non-English language torrent sources
 */

import { HtmlScraperProvider, JsonApiProvider, RssProvider } from './base';
import { TorrentResult, SearchQuery } from '../types';
import { logger } from '../utils/logger';

// ============================================================================
// RUSSIAN PROVIDERS
// ============================================================================

export class RutorProvider extends HtmlScraperProvider {
  constructor() {
    super({
      id: 'rutor',
      name: 'Rutor',
      baseUrl: 'https://rutor.info',
      rateLimit: 15,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `rutor:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const category = query.type === 'movie' ? '1' : '4'; // 1=Movies, 4=TV
        const searchUrl = `/search/0/${category}/010/2/${encodeURIComponent(searchTerm)}`;
        const $ = await this.fetchPage(searchUrl);

        $('table tr:not(:first-child)').each((_, row) => {
          const $row = $(row);
          const title = $row.find('td:nth-child(2) a').last().text().trim();
          const magnet = $row.find('a[href^="magnet:"]').attr('href');

          if (!magnet) return;
          const infoHash = this.extractInfoHash(magnet);
          if (!infoHash) return;

          const sizeText = $row.find('td:nth-last-child(2)').text().trim();
          const seeders = $row.find('td:last-child span.green').text().trim();
          const leechers = $row.find('td:last-child span.red').text().trim();

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

export class RuTrackerProvider extends HtmlScraperProvider {
  constructor() {
    super({
      id: 'rutracker',
      name: 'RuTracker',
      baseUrl: 'https://rutracker.org',
      rateLimit: 10,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `rut:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        // RuTracker requires forum search
        const searchUrl = `/forum/tracker.php?nm=${encodeURIComponent(searchTerm)}`;
        const $ = await this.fetchPage(searchUrl);

        $('tr.tCenter').each((_, row) => {
          const $row = $(row);
          const title = $row.find('td.t-title a.tLink').text().trim();
          const topicId = $row.find('td.t-title a.tLink').attr('href')?.match(/t=(\d+)/)?.[1];
          
          if (!topicId) return;

          const sizeText = $row.find('td.tor-size a').text().trim();
          const seeders = $row.find('td.seedmed b').text().trim();
          const leechers = $row.find('td.leechmed b').text().trim();

          // RuTracker uses topic-based hashes
          const torrentLink = $row.find('td.tor-size a').attr('href');
          const hashMatch = torrentLink?.match(/dl\.php\?t=(\d+)/);
          
          // Would need to fetch individual page for magnet
          // Using topic ID as placeholder
          results.push({
            title,
            infoHash: '', // Needs individual fetch
            size: this.parseSize(sizeText),
            seeders: this.parseCount(seeders),
            leechers: this.parseCount(leechers),
            provider: this.id,
            category: topicId, // Store for later fetch
          });
        });

        // Fetch actual hashes for top results
        for (const result of results.slice(0, 10)) {
          if (result.category) {
            try {
              const topicPage = await this.fetchPage(`/forum/viewtopic.php?t=${result.category}`);
              const magnet = topicPage('a[href^="magnet:"]').first().attr('href');
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

export class NNMClubProvider extends HtmlScraperProvider {
  constructor() {
    super({
      id: 'nnmclub',
      name: 'NNM-Club',
      baseUrl: 'https://nnmclub.to',
      rateLimit: 15,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `nnm:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const searchUrl = `/forum/tracker.php?nm=${encodeURIComponent(searchTerm)}`;
        const $ = await this.fetchPage(searchUrl);

        $('tr.prow1, tr.prow2').each((_, row) => {
          const $row = $(row);
          const title = $row.find('td.pcatHead a.genmed b').text().trim();
          const magnet = $row.find('a[href^="magnet:"]').attr('href');

          if (!magnet) return;
          const infoHash = this.extractInfoHash(magnet);
          if (!infoHash) return;

          const sizeText = $row.find('td.gensmall:nth-child(6)').text().trim();
          const seeders = $row.find('td.seedmed b').text().trim();
          const leechers = $row.find('td.leechmed b').text().trim();

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
// SPANISH PROVIDERS
// ============================================================================

export class MejorTorrentProvider extends HtmlScraperProvider {
  constructor() {
    super({
      id: 'mejortorrent',
      name: 'MejorTorrent',
      baseUrl: 'https://mejortorrent.wtf',
      rateLimit: 15,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `mjt:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const searchUrl = `/busqueda?q=${encodeURIComponent(searchTerm)}`;
        const $ = await this.fetchPage(searchUrl);

        $('article.pelicula').each((_, article) => {
          const $article = $(article);
          const title = $article.find('h2 a').text().trim();
          const detailLink = $article.find('h2 a').attr('href');

          if (!detailLink) return;

          results.push({
            title,
            infoHash: '',
            provider: this.id,
            seeders: 0,
            leechers: 0,
            category: detailLink,
          });
        });

        // Fetch detail pages for magnets
        for (const result of results.slice(0, 15)) {
          if (result.category) {
            try {
              const detailPage = await this.fetchPage(result.category);
              const magnet = detailPage('a[href^="magnet:"]').first().attr('href');
              if (magnet) {
                result.infoHash = this.extractInfoHash(magnet);
                result.magnetUri = magnet;
              }
              const sizeText = detailPage('.size').text();
              result.size = this.parseSize(sizeText);
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

export class DonTorrentProvider extends HtmlScraperProvider {
  constructor() {
    super({
      id: 'dontorrent',
      name: 'DonTorrent',
      baseUrl: 'https://dontorrent.earth',
      rateLimit: 15,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `dont:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const searchUrl = `/buscar/${encodeURIComponent(searchTerm)}`;
        const $ = await this.fetchPage(searchUrl);

        $('div.card').each((_, card) => {
          const $card = $(card);
          const title = $card.find('.card-title a').text().trim();
          const detailLink = $card.find('.card-title a').attr('href');

          if (!detailLink) return;

          results.push({
            title,
            infoHash: '',
            provider: this.id,
            seeders: 0,
            leechers: 0,
            category: detailLink,
          });
        });

        // Fetch magnets from detail pages
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

export class EliteTorrentProvider extends HtmlScraperProvider {
  constructor() {
    super({
      id: 'elitetorrent',
      name: 'EliteTorrent',
      baseUrl: 'https://elitetorrent.do',
      rateLimit: 15,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `elite:${searchTerm}`;

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

export class DivxTotalProvider extends HtmlScraperProvider {
  constructor() {
    super({
      id: 'divxtotal',
      name: 'DivxTotal',
      baseUrl: 'https://divxtotal.dev',
      rateLimit: 15,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `divx:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const category = query.type === 'movie' ? 'peliculas' : 'series';
        const searchUrl = `/${category}/buscar/${encodeURIComponent(searchTerm)}`;
        const $ = await this.fetchPage(searchUrl);

        $('ul.list-group-flush li').each((_, item) => {
          const $item = $(item);
          const title = $item.find('a').first().text().trim();
          const link = $item.find('a').first().attr('href');

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
// FRENCH PROVIDERS
// ============================================================================

export class Torrent9Provider extends HtmlScraperProvider {
  constructor() {
    super({
      id: 'torrent9',
      name: 'Torrent9',
      baseUrl: 'https://www.torrent9.fm',
      rateLimit: 15,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `t9:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const searchUrl = `/recherche/${encodeURIComponent(searchTerm)}`;
        const $ = await this.fetchPage(searchUrl);

        $('table.table tbody tr').each((_, row) => {
          const $row = $(row);
          const title = $row.find('td:first-child a').text().trim();
          const link = $row.find('td:first-child a').attr('href');
          const sizeText = $row.find('td:nth-child(2)').text().trim();
          const seeders = $row.find('td:nth-child(3)').text().trim();
          const leechers = $row.find('td:nth-child(4)').text().trim();

          if (!link) return;

          results.push({
            title,
            infoHash: '',
            size: this.parseSize(sizeText),
            seeders: this.parseCount(seeders),
            leechers: this.parseCount(leechers),
            provider: this.id,
            category: link,
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

export class OxTorrentProvider extends HtmlScraperProvider {
  constructor() {
    super({
      id: 'oxtorrent',
      name: 'OxTorrent',
      baseUrl: 'https://oxtorrent.nz',
      rateLimit: 15,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `ox:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const searchUrl = `/recherche/${encodeURIComponent(searchTerm)}`;
        const $ = await this.fetchPage(searchUrl);

        $('table.table-striped tbody tr').each((_, row) => {
          const $row = $(row);
          const title = $row.find('td:first-child a.titre').text().trim();
          const link = $row.find('td:first-child a.titre').attr('href');
          const sizeText = $row.find('td:nth-child(2)').text().trim();
          const seeders = $row.find('td:nth-child(3)').text().trim();
          const leechers = $row.find('td:nth-child(4)').text().trim();

          if (!link) return;

          results.push({
            title,
            infoHash: '',
            size: this.parseSize(sizeText),
            seeders: this.parseCount(seeders),
            leechers: this.parseCount(leechers),
            provider: this.id,
            category: link,
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
// PORTUGUESE/BRAZILIAN PROVIDERS
// ============================================================================

export class ComandoProvider extends HtmlScraperProvider {
  constructor() {
    super({
      id: 'comando',
      name: 'Comando Torrents',
      baseUrl: 'https://comandotorrents.to',
      rateLimit: 15,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `cmd:${searchTerm}`;

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

export class BluDVProvider extends HtmlScraperProvider {
  constructor() {
    super({
      id: 'bludv',
      name: 'BluDV',
      baseUrl: 'https://bludv.xyz',
      rateLimit: 15,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `blu:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const searchUrl = `/?s=${encodeURIComponent(searchTerm)}`;
        const $ = await this.fetchPage(searchUrl);

        $('article').each((_, article) => {
          const $article = $(article);
          const title = $article.find('h2 a').text().trim();
          const link = $article.find('h2 a').attr('href');

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
// ITALIAN PROVIDERS
// ============================================================================

export class IlCorsaroNeroProvider extends HtmlScraperProvider {
  constructor() {
    super({
      id: 'ilcorsaronero',
      name: 'ilCorSaRoNeRo',
      baseUrl: 'https://ilcorsaronero.link',
      rateLimit: 15,
    });
  }

  async search(query: SearchQuery): Promise<TorrentResult[]> {
    const searchTerm = this.buildSearchQuery(query);
    const cacheKey = `icn:${searchTerm}`;

    return this.cachedSearch(cacheKey, async () => {
      const results: TorrentResult[] = [];

      try {
        const searchUrl = `/argh.php?search=${encodeURIComponent(searchTerm)}`;
        const $ = await this.fetchPage(searchUrl);

        $('table.lista tr:not(:first-child)').each((_, row) => {
          const $row = $(row);
          const title = $row.find('td:nth-child(2) a').text().trim();
          const magnet = $row.find('a[href^="magnet:"]').attr('href');

          if (!magnet) return;
          const infoHash = this.extractInfoHash(magnet);
          if (!infoHash) return;

          const sizeText = $row.find('td:nth-child(3)').text().trim();
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

// Export all international providers
export const INTERNATIONAL_PROVIDERS = [
  // Russian
  new RutorProvider(),
  new RuTrackerProvider(),
  new NNMClubProvider(),
  // Spanish
  new MejorTorrentProvider(),
  new DonTorrentProvider(),
  new EliteTorrentProvider(),
  new DivxTotalProvider(),
  // French
  new Torrent9Provider(),
  new OxTorrentProvider(),
  // Portuguese
  new ComandoProvider(),
  new BluDVProvider(),
  // Italian
  new IlCorsaroNeroProvider(),
];
