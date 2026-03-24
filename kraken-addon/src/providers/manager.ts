/**
 * Kraken Provider Manager
 * 
 * Central orchestration for all 50+ torrent providers
 * Handles parallel searching, deduplication, and aggregation
 */

import PQueue from 'p-queue';
import { TorrentResult, SearchQuery, KrakenConfig } from '../types';
import { logger, logPerformance } from '../utils/logger';
import { cache } from '../cache/manager';

// Import all provider modules
import { TIER1_PROVIDERS } from './tier1-primary';
import { ANIME_PROVIDERS } from './anime';
import { INTERNATIONAL_PROVIDERS } from './international';
import { REGIONAL_PROVIDERS, SPECIALTY_PROVIDERS } from './regional-specialty';
import { 
  createIntegrationProvider, 
  ProwlarrProvider, 
  JackettProvider,
  TorrentioUpstreamProvider 
} from './integrations';
import { BaseProvider } from './base';

// ============================================================================
// PROVIDER REGISTRY
// ============================================================================

export class ProviderManager {
  private providers: Map<string, BaseProvider> = new Map();
  private enabledByDefault: Set<string> = new Set();
  private searchQueue: PQueue;

  constructor() {
    this.searchQueue = new PQueue({ 
      concurrency: 10, // Max 10 concurrent provider searches
      timeout: 15000,  // 15 second timeout per provider
    });
    
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Register Tier 1 (Primary English) - Enabled by default
    for (const provider of TIER1_PROVIDERS) {
      this.register(provider, true);
    }

    // Register Anime providers - Some enabled by default
    const defaultAnime = ['nyaasi', 'animetosho', 'subsplease'];
    for (const provider of ANIME_PROVIDERS) {
      this.register(provider, defaultAnime.includes(provider.id));
    }

    // Register International providers - Disabled by default
    for (const provider of INTERNATIONAL_PROVIDERS) {
      this.register(provider, false);
    }

    // Register Regional providers - Disabled by default
    for (const provider of REGIONAL_PROVIDERS) {
      this.register(provider, false);
    }

    // Register Specialty/Meta-search - Some enabled by default
    const defaultSpecialty = ['solidtorrents', 'bitsearch'];
    for (const provider of SPECIALTY_PROVIDERS) {
      this.register(provider, defaultSpecialty.includes(provider.id));
    }

    // Register Torrentio upstream as a reliable fallback (always works)
    const torrentio = new TorrentioUpstreamProvider();
    this.register(torrentio, true);

    logger.info('Provider manager initialized', {
      total: this.providers.size,
      enabledByDefault: this.enabledByDefault.size,
    });
  }

  private register(provider: BaseProvider, enabledByDefault: boolean): void {
    this.providers.set(provider.id, provider);
    if (enabledByDefault) {
      this.enabledByDefault.add(provider.id);
    }
  }

  /**
   * Add external integration providers based on config
   */
  async addIntegrations(config: KrakenConfig): Promise<void> {
    // Prowlarr
    if (config.enableProwlarr && config.prowlarrUrl && config.prowlarrApiKey) {
      const prowlarr = createIntegrationProvider('prowlarr', {
        url: config.prowlarrUrl,
        apiKey: config.prowlarrApiKey,
      }) as ProwlarrProvider;

      if (prowlarr) {
        await prowlarr.initialize();
        this.providers.set('prowlarr', prowlarr);
        logger.info('Prowlarr integration added', { 
          indexers: prowlarr.getIndexerCount() 
        });
      }
    }

    // Jackett
    if (config.enableJackett && config.jackettUrl && config.jackettApiKey) {
      const jackett = createIntegrationProvider('jackett', {
        url: config.jackettUrl,
        apiKey: config.jackettApiKey,
      });

      if (jackett) {
        this.providers.set('jackett', jackett);
        logger.info('Jackett integration added');
      }
    }
  }

  /**
   * Get list of all available providers
   */
  getAllProviders(): Array<{ id: string; name: string; enabledByDefault: boolean }> {
    return Array.from(this.providers.entries()).map(([id, provider]) => ({
      id,
      name: provider.name,
      enabledByDefault: this.enabledByDefault.has(id),
    }));
  }

  /**
   * Get providers based on config
   */
  getEnabledProviders(config: KrakenConfig): BaseProvider[] {
    const enabled: BaseProvider[] = [];
    
    for (const providerId of config.providers) {
      const provider = this.providers.get(providerId);
      if (provider) {
        enabled.push(provider);
      }
    }

    // Add integration providers if configured
    if (config.enableProwlarr && this.providers.has('prowlarr')) {
      enabled.push(this.providers.get('prowlarr')!);
    }
    if (config.enableJackett && this.providers.has('jackett')) {
      enabled.push(this.providers.get('jackett')!);
    }

    return enabled;
  }

  /**
   * Search all enabled providers in parallel
   */
  async searchAll(
    query: SearchQuery,
    config: KrakenConfig
  ): Promise<TorrentResult[]> {
    const startTime = Date.now();
    const providers = this.getEnabledProviders(config);
    
    logger.debug('Starting provider search', {
      providers: providers.map(p => p.id),
      query,
    });

    // Create search tasks for queue
    const searchTasks = providers.map(provider => 
      this.searchQueue.add(
        async () => {
          if (!provider.canAttemptSearch()) {
            logger.debug(`Skipping ${provider.id} - circuit breaker open`);
            return [];
          }

          const providerStart = Date.now();
          try {
            const results = await provider.search(query);
            if (!results) {
              provider.recordFailure(new Error('Provider search timed out'));
              return [];
            }

            provider.recordSuccess();
            logPerformance(`Provider ${provider.id}`, providerStart, {
              results: results.length,
            });
            return results;
          } catch (error) {
            provider.recordFailure(error);
            logger.warn(`Provider ${provider.id} failed`, { error });
            return [];
          }
        },
        { throwOnTimeout: false }
      )
    );

    // Wait for all searches to complete
    const resultArrays = await Promise.all(searchTasks);
    
    // Flatten and deduplicate results
    const allResults: TorrentResult[] = [];
    const seenHashes = new Set<string>();

    for (const results of resultArrays) {
      if (!results) continue;
      for (const result of results) {
        const hash = result.infoHash.toLowerCase();
        if (hash && !seenHashes.has(hash)) {
          seenHashes.add(hash);
          allResults.push(result);
        }
      }
    }

    logPerformance('Total provider search', startTime, {
      providers: providers.length,
      totalResults: allResults.length,
      uniqueHashes: seenHashes.size,
    });

    return allResults;
  }

  /**
   * Search specific providers only
   */
  async searchProviders(
    providerIds: string[],
    query: SearchQuery
  ): Promise<TorrentResult[]> {
    const providers = providerIds
      .map(id => this.providers.get(id))
      .filter((p): p is BaseProvider => p !== undefined);

    if (providers.length === 0) {
      return [];
    }

    const searchTasks = providers.map(provider =>
      this.searchQueue.add(async () => {
        if (!provider.canAttemptSearch()) {
          logger.debug(`Skipping ${provider.id} - circuit breaker open`);
          return [];
        }

        try {
          const results = await provider.search(query);
          if (!results) {
            provider.recordFailure(new Error('Provider search timed out'));
            return [];
          }

          provider.recordSuccess();
          return results;
        } catch (error) {
          provider.recordFailure(error);
          return [];
        }
      })
    );

    const resultArrays = await Promise.all(searchTasks);
    const allResults: TorrentResult[] = [];
    const seenHashes = new Set<string>();

    for (const results of resultArrays) {
      if (!results) continue;
      for (const result of results) {
        const hash = result.infoHash.toLowerCase();
        if (hash && !seenHashes.has(hash)) {
          seenHashes.add(hash);
          allResults.push(result);
        }
      }
    }

    return allResults;
  }

  /**
   * Get provider statistics
   */
  async getStats(): Promise<{
    total: number;
    enabledByDefault: number;
    categories: Record<string, number>;
  }> {
    const categories: Record<string, number> = {
      'tier1': TIER1_PROVIDERS.length,
      'anime': ANIME_PROVIDERS.length,
      'international': INTERNATIONAL_PROVIDERS.length,
      'regional': REGIONAL_PROVIDERS.length,
      'specialty': SPECIALTY_PROVIDERS.length,
    };

    return {
      total: this.providers.size,
      enabledByDefault: this.enabledByDefault.size,
      categories,
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const providerManager = new ProviderManager();

// Export provider counts for display
export const TOTAL_PROVIDERS = 
  TIER1_PROVIDERS.length + 
  ANIME_PROVIDERS.length + 
  INTERNATIONAL_PROVIDERS.length + 
  REGIONAL_PROVIDERS.length + 
  SPECIALTY_PROVIDERS.length;

export const PROVIDER_BREAKDOWN = {
  tier1: TIER1_PROVIDERS.map(p => ({ id: p.id, name: p.name })),
  anime: ANIME_PROVIDERS.map(p => ({ id: p.id, name: p.name })),
  international: INTERNATIONAL_PROVIDERS.map(p => ({ id: p.id, name: p.name })),
  regional: REGIONAL_PROVIDERS.map(p => ({ id: p.id, name: p.name })),
  specialty: SPECIALTY_PROVIDERS.map(p => ({ id: p.id, name: p.name })),
};

console.log(`
╔══════════════════════════════════════════════════════════════╗
║              🦑 KRAKEN PROVIDER REGISTRY                      ║
╠══════════════════════════════════════════════════════════════╣
║  Tier 1 (Primary):        ${String(TIER1_PROVIDERS.length).padStart(2)} providers                      ║
║  Anime:                   ${String(ANIME_PROVIDERS.length).padStart(2)} providers                      ║
║  International:           ${String(INTERNATIONAL_PROVIDERS.length).padStart(2)} providers                      ║
║  Regional:                ${String(REGIONAL_PROVIDERS.length).padStart(2)} providers                      ║
║  Specialty/Meta:          ${String(SPECIALTY_PROVIDERS.length).padStart(2)} providers                      ║
╠══════════════════════════════════════════════════════════════╣
║  TOTAL:                   ${String(TOTAL_PROVIDERS).padStart(2)} PROVIDERS                      ║
║  + Prowlarr/Jackett:    100+ additional indexers              ║
╚══════════════════════════════════════════════════════════════╝
`);
