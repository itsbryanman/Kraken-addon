/**
 * Kraken Provider Base Classes
 * 
 * Abstract base implementations for different provider types
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import * as cheerio from 'cheerio';
import Bottleneck from 'bottleneck';
import { TorrentResult, SearchQuery, ProviderStatus } from '../types';
import { logger } from '../utils/logger';
import { cache } from '../cache/manager';

// ============================================================================
// INTERFACES
// ============================================================================

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  rateLimit?: number; // requests per minute
  timeout?: number;
  headers?: Record<string, string>;
}

export interface SearchOptions {
  maxResults?: number;
  timeout?: number;
}

// ============================================================================
// BASE PROVIDER
// ============================================================================

export abstract class BaseProvider {
  private static readonly FAILURE_THRESHOLD = 3;
  private static readonly CIRCUIT_RESET_MS = 5 * 60 * 1000;

  readonly id: string;
  readonly name: string;
  protected baseUrl: string;
  protected client: AxiosInstance;
  protected limiter: Bottleneck;
  protected lastStatus: ProviderStatus;
  private failureCount = 0;
  private circuitOpenUntil = 0;

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl;
    
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        ...config.headers,
      },
    });

    this.limiter = new Bottleneck({
      minTime: Math.ceil(60000 / (config.rateLimit || 30)),
      maxConcurrent: 2,
    });

    this.lastStatus = {
      online: true,
      lastChecked: new Date(),
    };
  }

  abstract search(query: SearchQuery, options?: SearchOptions): Promise<TorrentResult[]>;

  async getStatus(): Promise<ProviderStatus> {
    return this.lastStatus;
  }

  canAttemptSearch(): boolean {
    if (Date.now() < this.circuitOpenUntil) {
      return false;
    }

    if (this.circuitOpenUntil > 0 && Date.now() >= this.circuitOpenUntil) {
      this.circuitOpenUntil = 0;
      this.failureCount = 0;
    }

    return true;
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.circuitOpenUntil = 0;
    this.lastStatus = {
      online: true,
      lastChecked: new Date(),
    };
  }

  recordFailure(error?: unknown): void {
    this.failureCount++;
    this.lastStatus = {
      online: false,
      lastChecked: new Date(),
      error: error instanceof Error ? error.message : error ? String(error) : undefined,
    };

    if (this.failureCount >= BaseProvider.FAILURE_THRESHOLD) {
      this.circuitOpenUntil = Date.now() + BaseProvider.CIRCUIT_RESET_MS;
      logger.warn(`Circuit breaker opened for ${this.id}`, {
        failures: this.failureCount,
        resetAt: new Date(this.circuitOpenUntil).toISOString(),
      });
    }
  }

  protected async cachedSearch(
    cacheKey: string,
    searchFn: () => Promise<TorrentResult[]>,
    ttl: number = 1800
  ): Promise<TorrentResult[]> {
    const cached = await cache.get<TorrentResult[]>(cacheKey);
    if (cached) return cached;

    const results = await searchFn();
    if (results.length > 0) {
      await cache.set(cacheKey, results, ttl);
    }
    return results;
  }

  protected parseSize(sizeStr: string): number | undefined {
    if (!sizeStr) return undefined;
    
    const match = sizeStr.match(/([\d.]+)\s*(GB|MB|KB|TB)/i);
    if (!match) return undefined;

    const value = parseFloat(match[1]!);
    const unit = match[2]!.toUpperCase();

    const multipliers: Record<string, number> = {
      'TB': 1024 * 1024 * 1024 * 1024,
      'GB': 1024 * 1024 * 1024,
      'MB': 1024 * 1024,
      'KB': 1024,
    };

    return Math.round(value * (multipliers[unit] || 1));
  }

  protected parseCount(countStr: string): number {
    if (!countStr) return 0;
    const cleaned = countStr.replace(/[,\s]/g, '');
    return parseInt(cleaned, 10) || 0;
  }

  protected extractInfoHash(magnetOrHash: string): string {
    if (magnetOrHash.length === 40 && /^[a-fA-F0-9]+$/.test(magnetOrHash)) {
      return magnetOrHash.toLowerCase();
    }
    const match = magnetOrHash.match(/btih:([a-fA-F0-9]{40})/i);
    return match ? match[1]!.toLowerCase() : '';
  }

  protected buildSearchQuery(query: SearchQuery): string {
    const searchTerm = query.query?.trim();
    if (!searchTerm) {
      logger.warn(`${this.id}: No search text available, skipping`, {
        imdbId: query.imdbId,
        kitsuId: query.kitsuId,
      });
      return '';
    }

    const parts: string[] = [searchTerm];

    if (query.type === 'series' && query.season !== undefined) {
      const seasonToken = `S${String(query.season).padStart(2, '0')}`;
      const episodeToken = query.episode !== undefined
        ? `E${String(query.episode).padStart(2, '0')}`
        : '';
      const seasonEpisodeToken = `${seasonToken}${episodeToken}`;

      if (!searchTerm || !new RegExp(`\\b${seasonEpisodeToken}\\b`, 'i').test(searchTerm)) {
        parts.push(seasonEpisodeToken);
      }
    } else if (query.type === 'series' && query.kitsuId && query.episode !== undefined) {
      const episodeToken = String(query.episode).padStart(2, '0');
      if (!new RegExp(`\\b${episodeToken}\\b`).test(searchTerm)) {
        parts.push(episodeToken);
      }
    }

    if (
      query.type === 'movie' &&
      query.year &&
      (!searchTerm || !new RegExp(`\\b${query.year}\\b`).test(searchTerm))
    ) {
      parts.push(String(query.year));
    }

    return parts.join(' ');
  }
}

// ============================================================================
// HTML SCRAPER PROVIDER
// ============================================================================

export abstract class HtmlScraperProvider extends BaseProvider {
  protected mirrors: string[] = []; // Subclasses can override this with their mirrors

  protected async fetchPage(url: string): Promise<cheerio.CheerioAPI> {
    const response = await this.limiter.schedule(() =>
      this.client.get(url)
    );
    return cheerio.load(response.data);
  }

  protected async fetchWithRetry(
    url: string,
    retries: number = 3
  ): Promise<cheerio.CheerioAPI> {
    for (let i = 0; i < retries; i++) {
      try {
        return await this.fetchPage(url);
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
    throw new Error('Max retries exceeded');
  }

  protected async fetchWithMirrors(path: string): Promise<cheerio.CheerioAPI> {
    const mirrorsToTry = this.mirrors.length > 0
      ? this.mirrors
      : [this.baseUrl];

    let lastError: Error | null = null;

    for (const mirror of mirrorsToTry) {
      try {
        const response = await this.limiter.schedule(() =>
          axios.get(`${mirror}${path}`, {
            timeout: 15000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
            },
          })
        );
        // Update baseUrl to working mirror for future requests
        this.baseUrl = mirror;
        this.client.defaults.baseURL = mirror;
        return cheerio.load(response.data);
      } catch (error: any) {
        logger.debug(`Mirror ${mirror} failed: ${error.message}`);
        lastError = error;
      }
    }

    throw lastError || new Error('All mirrors failed');
  }
}

// ============================================================================
// JSON API PROVIDER
// ============================================================================

export abstract class JsonApiProvider extends BaseProvider {
  protected async fetchJson<T>(
    url: string, 
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.limiter.schedule(() =>
      this.client.get<T>(url, config)
    );
    return response.data;
  }

  protected async postJson<T>(
    url: string,
    data: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.limiter.schedule(() =>
      this.client.post<T>(url, data, config)
    );
    return response.data;
  }
}

// ============================================================================
// RSS PROVIDER
// ============================================================================

export abstract class RssProvider extends BaseProvider {
  protected async fetchRss(url: string): Promise<cheerio.CheerioAPI> {
    const response = await this.limiter.schedule(() =>
      this.client.get(url, {
        headers: { 'Accept': 'application/rss+xml, application/xml, text/xml' },
      })
    );
    return cheerio.load(response.data, { xmlMode: true });
  }
}
