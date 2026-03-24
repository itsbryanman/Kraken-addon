/**
 * Kraken Cache Manager
 * 
 * Multi-backend caching with LRU in-memory and optional Redis support
 */

import NodeCache from 'node-cache';
import { LRUCache } from 'lru-cache';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

// ============================================================================
// CACHE INTERFACE
// ============================================================================

interface CacheBackend {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
}

// ============================================================================
// IN-MEMORY LRU CACHE
// ============================================================================

class MemoryCache implements CacheBackend {
  private cache: LRUCache<string, { value: unknown; expires: number }>;

  constructor(maxSize: number = 10000) {
    this.cache = new LRUCache({
      max: maxSize,
      ttl: 1000 * 60 * 60, // Default 1 hour
      updateAgeOnGet: true,
    });
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (entry.expires && Date.now() > entry.expires) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const expires = ttl ? Date.now() + (ttl * 1000) : 0;
    this.cache.set(key, { value, expires });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.cache.has(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      calculatedSize: this.cache.calculatedSize,
    };
  }
}

// ============================================================================
// REDIS CACHE
// ============================================================================

class RedisCache implements CacheBackend {
  private client: Redis;
  private prefix: string;

  constructor(url: string, prefix: string = 'kraken:') {
    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });
    this.prefix = prefix;

    this.client.on('error', (err) => {
      logger.error('Redis connection error', { error: err.message });
    });

    this.client.on('connect', () => {
      logger.info('Redis connected');
    });
  }

  private key(k: string): string {
    return `${this.prefix}${k}`;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const value = await this.client.get(this.key(key));
    if (!value) return undefined;
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttl) {
      await this.client.setex(this.key(key), ttl, serialized);
    } else {
      await this.client.set(this.key(key), serialized);
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.del(this.key(key));
  }

  async has(key: string): Promise<boolean> {
    return (await this.client.exists(this.key(key))) === 1;
  }

  async clear(): Promise<void> {
    const keys = await this.client.keys(`${this.prefix}*`);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}

// ============================================================================
// TIERED CACHE (Memory + Redis)
// ============================================================================

class TieredCache implements CacheBackend {
  private l1: MemoryCache;
  private l2?: RedisCache;

  constructor(memorySize: number = 5000, redisUrl?: string) {
    this.l1 = new MemoryCache(memorySize);
    if (redisUrl) {
      this.l2 = new RedisCache(redisUrl);
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    // Try L1 first
    let value = await this.l1.get<T>(key);
    if (value !== undefined) {
      return value;
    }

    // Try L2 if available
    if (this.l2) {
      value = await this.l2.get<T>(key);
      if (value !== undefined) {
        // Promote to L1
        await this.l1.set(key, value, 300); // 5 min L1 TTL
        return value;
      }
    }

    return undefined;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    // Write to both levels
    await this.l1.set(key, value, ttl ? Math.min(ttl, 300) : 300);
    if (this.l2) {
      await this.l2.set(key, value, ttl);
    }
  }

  async delete(key: string): Promise<void> {
    await this.l1.delete(key);
    if (this.l2) {
      await this.l2.delete(key);
    }
  }

  async has(key: string): Promise<boolean> {
    if (await this.l1.has(key)) return true;
    if (this.l2 && await this.l2.has(key)) return true;
    return false;
  }

  async clear(): Promise<void> {
    await this.l1.clear();
    if (this.l2) {
      await this.l2.clear();
    }
  }
}

// ============================================================================
// CACHE MANAGER SINGLETON
// ============================================================================

class CacheManager {
  private backend: CacheBackend;
  private static instance: CacheManager;

  private constructor() {
    const redisUrl = process.env['REDIS_URL'];
    if (redisUrl) {
      this.backend = new TieredCache(5000, redisUrl);
      logger.info('Cache initialized with Redis + Memory');
    } else {
      this.backend = new MemoryCache(10000);
      logger.info('Cache initialized with Memory only');
    }
  }

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.backend.get<T>(key);
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    return this.backend.set(key, value, ttlSeconds);
  }

  async delete(key: string): Promise<void> {
    return this.backend.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.backend.has(key);
  }

  async clear(): Promise<void> {
    return this.backend.clear();
  }

  /**
   * Get or compute pattern - returns cached value or computes and caches
   */
  async getOrSet<T>(
    key: string,
    compute: () => Promise<T>,
    ttlSeconds: number = 3600
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await compute();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Batch get - retrieve multiple keys at once
   */
  async mget<T>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    
    // For now, sequential gets (could optimize with Redis MGET)
    for (const key of keys) {
      const value = await this.get<T>(key);
      if (value !== undefined) {
        result.set(key, value);
      }
    }

    return result;
  }
}

// Export singleton instance
export const cache = CacheManager.getInstance();

// ============================================================================
// SPECIALIZED CACHES
// ============================================================================

/**
 * Debrid availability cache with 8-hour TTL (matching Torrentio)
 */
export const debridCache = {
  async getAvailability(infoHash: string): Promise<boolean | undefined> {
    return cache.get<boolean>(`debrid:avail:${infoHash.toLowerCase()}`);
  },

  async setAvailability(
    infoHash: string,
    provider: string,
    available: boolean
  ): Promise<void> {
    await cache.set(
      `debrid:avail:${provider}:${infoHash.toLowerCase()}`,
      available,
      28800 // 8 hours
    );
  },

  async getBulkAvailability(
    infoHashes: string[],
    provider: string
  ): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();
    for (const hash of infoHashes) {
      const cached = await cache.get<boolean>(
        `debrid:avail:${provider}:${hash.toLowerCase()}`
      );
      if (cached !== undefined) {
        result.set(hash.toLowerCase(), cached);
      }
    }
    return result;
  },
};

/**
 * Stream response cache - caches full stream results by IMDB ID
 */
export const streamCache = {
  async get(
    imdbId: string,
    configHash: string
  ): Promise<unknown[] | undefined> {
    return cache.get<unknown[]>(`stream:${imdbId}:${configHash}`);
  },

  async set(
    imdbId: string,
    configHash: string,
    streams: unknown[],
    ttlSeconds: number = 3600
  ): Promise<void> {
    await cache.set(`stream:${imdbId}:${configHash}`, streams, ttlSeconds);
  },
};

/**
 * Provider response cache - caches search results per provider
 */
export const providerCache = {
  async get(
    provider: string,
    queryHash: string
  ): Promise<unknown[] | undefined> {
    return cache.get<unknown[]>(`provider:${provider}:${queryHash}`);
  },

  async set(
    provider: string,
    queryHash: string,
    results: unknown[],
    ttlSeconds: number = 1800 // 30 minutes
  ): Promise<void> {
    await cache.set(`provider:${provider}:${queryHash}`, results, ttlSeconds);
  },
};
