/**
 * Kraken Debrid Service Implementations
 * 
 * Multi-debrid support with unified interface, caching, and fallback
 */

import axios, { AxiosInstance } from 'axios';
import {
  DebridService,
  DebridProvider,
  DebridAvailability,
  ResolvedStream,
  DebridStatus,
  DebridFile,
} from '../types';
import { logger } from '../utils/logger';
import { cache } from '../cache/manager';

// ============================================================================
// BASE DEBRID CLASS
// ============================================================================

abstract class BaseDebridService implements DebridService {
  abstract name: string;
  abstract id: DebridProvider;
  protected apiKey: string;
  protected client: AxiosInstance;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      timeout: 10000,
      headers: {
        'User-Agent': 'Kraken-Addon/1.0',
      },
    });
  }

  abstract checkAvailability(infoHashes: string[]): Promise<DebridAvailability>;
  abstract resolve(infoHash: string, fileIdx?: number): Promise<ResolvedStream>;
  abstract addMagnet(magnetUri: string): Promise<string>;
  abstract getStatus(): Promise<DebridStatus>;

  protected magnetFromHash(infoHash: string): string {
    return `magnet:?xt=urn:btih:${infoHash}`;
  }
}

// ============================================================================
// REAL-DEBRID
// ============================================================================

export class RealDebridService extends BaseDebridService {
  name = 'Real-Debrid';
  id: DebridProvider = 'realdebrid';
  private baseUrl = 'https://api.real-debrid.com/rest/1.0';

  constructor(apiKey: string) {
    super(apiKey);
    this.client.defaults.headers['Authorization'] = `Bearer ${apiKey}`;
  }

  async checkAvailability(infoHashes: string[]): Promise<DebridAvailability> {
    const result: DebridAvailability = {};
    const uncached: string[] = [];

    for (const hash of infoHashes) {
      const normalizedHash = hash.toLowerCase();
      const cachedValue = await cache.get<DebridAvailability[string]>(`rd:avail:${normalizedHash}`);
      if (cachedValue !== undefined) {
        result[normalizedHash] = cachedValue;
      } else {
        uncached.push(hash);
      }
    }

    if (uncached.length === 0) {
      return result;
    }

    // Batch check - RD allows up to 200 hashes per request
    const batches: string[][] = [];
    for (let i = 0; i < uncached.length; i += 100) {
      batches.push(uncached.slice(i, i + 100));
    }

    for (const batch of batches) {
      try {
        const batchResult = await this.checkAvailabilityBatch(batch);
        for (const [hash, info] of Object.entries(batchResult)) {
          result[hash] = info;
          await cache.set(`rd:avail:${hash}`, info, 28800);
        }
      } catch (error) {
        logger.warn('RD availability check failed', { error });
        for (const hash of batch) {
          const normalizedHash = hash.toLowerCase();
          result[normalizedHash] = { cached: false };
          await cache.set(`rd:avail:${normalizedHash}`, result[normalizedHash], 1800);
        }
      }
    }

    return result;
  }

  private extractFiles(fileMap: Record<string, { filename: string; filesize: number }>): DebridFile[] {
    return Object.entries(fileMap).map(([id, file]) => ({
      id,
      name: file.filename,
      size: file.filesize,
    }));
  }

  private async checkAvailabilityBatch(infoHashes: string[]): Promise<DebridAvailability> {
    try {
      return await this.checkAvailabilityViaInstant(infoHashes);
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      logger.warn('RD instant availability endpoint failed, falling back', {
        status,
        hashes: infoHashes.length,
      });
      return this.checkAvailabilityViaMagnet(infoHashes);
    }
  }

  private async checkAvailabilityViaInstant(infoHashes: string[]): Promise<DebridAvailability> {
    const result: DebridAvailability = {};
    const hashList = infoHashes.join('/');
    const response = await this.client.get(
      `${this.baseUrl}/torrents/instantAvailability/${hashList}`
    );

    for (const hash of infoHashes) {
      const hashLower = hash.toLowerCase();
      const data = response.data?.[hash] ?? response.data?.[hashLower];
      if (data && typeof data === 'object' && 'rd' in data) {
        const rdData = (data as { rd?: Array<Record<string, { filename: string; filesize: number }>> }).rd;
        if (rdData && rdData.length > 0) {
          result[hashLower] = {
            cached: true,
            files: this.extractFiles(rdData[0] ?? {}),
          };
          continue;
        }
      }

      result[hashLower] = { cached: false };
    }

    return result;
  }

  private async checkAvailabilityViaMagnet(infoHashes: string[]): Promise<DebridAvailability> {
    const result: DebridAvailability = {};

    for (const hash of infoHashes) {
      const hashLower = hash.toLowerCase();
      let torrentId: string | undefined;

      try {
        const addResponse = await this.client.post(
          `${this.baseUrl}/torrents/addMagnet`,
          new URLSearchParams({ magnet: this.magnetFromHash(hash) })
        );

        torrentId = addResponse.data.id;
        if (!torrentId) {
          result[hashLower] = { cached: false };
          continue;
        }

        const infoResponse = await this.client.get(
          `${this.baseUrl}/torrents/info/${torrentId}`
        );

        const status = infoResponse.data?.status;
        const files = Array.isArray(infoResponse.data?.files)
          ? infoResponse.data.files
              .filter((file: { path?: string }) => typeof file.path === 'string')
              .map((file: { id: string | number; path: string; bytes: number }) => ({
                id: file.id,
                name: file.path,
                size: file.bytes,
              }))
          : undefined;

        result[hashLower] = {
          cached: status === 'downloaded' || status === 'waiting_files_selection',
          files,
        };
      } catch (error) {
        logger.debug('RD magnet availability fallback failed', { error, hash: hashLower });
        result[hashLower] = { cached: false };
      } finally {
        if (torrentId) {
          try {
            await this.client.delete(`${this.baseUrl}/torrents/delete/${torrentId}`);
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    }

    return result;
  }

  async resolve(infoHash: string, fileIdx?: number): Promise<ResolvedStream> {
    // Step 1: Add magnet
    const addResponse = await this.client.post(
      `${this.baseUrl}/torrents/addMagnet`,
      new URLSearchParams({ magnet: this.magnetFromHash(infoHash) })
    );
    
    const torrentId = addResponse.data.id;

    // Step 2: Get torrent info
    const infoResponse = await this.client.get(
      `${this.baseUrl}/torrents/info/${torrentId}`
    );

    const files = infoResponse.data.files;
    const videoFiles = files.filter((f: { path: string }) => 
      /\.(mkv|mp4|avi|m4v|mov|wmv|webm)$/i.test(f.path)
    );

    // Select file
    const selectedIdx = fileIdx !== undefined ? fileIdx : 0;
    const selectedFile = videoFiles[selectedIdx] || videoFiles[0];

    if (!selectedFile) {
      throw new Error('No video files found in torrent');
    }

    // Step 3: Select files
    await this.client.post(
      `${this.baseUrl}/torrents/selectFiles/${torrentId}`,
      new URLSearchParams({ files: String(selectedFile.id) })
    );

    // Step 4: Wait for links and unrestrict
    await this.waitForDownload(torrentId);
    
    const finalInfo = await this.client.get(
      `${this.baseUrl}/torrents/info/${torrentId}`
    );

    const link = finalInfo.data.links[0];
    if (!link) {
      throw new Error('No download links available');
    }

    // Step 5: Unrestrict the link
    const unrestrictResponse = await this.client.post(
      `${this.baseUrl}/unrestrict/link`,
      new URLSearchParams({ link })
    );

    // Cleanup - delete torrent
    try {
      await this.client.delete(`${this.baseUrl}/torrents/delete/${torrentId}`);
    } catch {
      // Ignore cleanup errors
    }

    return {
      url: unrestrictResponse.data.download,
      filename: unrestrictResponse.data.filename,
      size: unrestrictResponse.data.filesize,
      mimeType: unrestrictResponse.data.mimeType,
    };
  }

  private async waitForDownload(torrentId: string, maxWait = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      const info = await this.client.get(
        `${this.baseUrl}/torrents/info/${torrentId}`
      );

      const status = info.data.status;
      if (status === 'downloaded' || status === 'seeding') {
        return;
      }
      if (status === 'error' || status === 'magnet_error' || status === 'dead') {
        throw new Error(`Torrent error: ${status}`);
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    throw new Error('Timeout waiting for torrent');
  }

  async addMagnet(magnetUri: string): Promise<string> {
    const response = await this.client.post(
      `${this.baseUrl}/torrents/addMagnet`,
      new URLSearchParams({ magnet: magnetUri })
    );
    return response.data.id;
  }

  async getStatus(): Promise<DebridStatus> {
    const response = await this.client.get(`${this.baseUrl}/user`);
    
    return {
      authenticated: true,
      premium: response.data.type === 'premium',
      premiumUntil: new Date(response.data.expiration),
      pointsUsed: response.data.points,
    };
  }
}

// ============================================================================
// ALL-DEBRID
// ============================================================================

export class AllDebridService extends BaseDebridService {
  name = 'AllDebrid';
  id: DebridProvider = 'alldebrid';
  private baseUrl = 'https://api.alldebrid.com/v4';

  async checkAvailability(infoHashes: string[]): Promise<DebridAvailability> {
    const result: DebridAvailability = {};

    try {
      const magnets = infoHashes.map(h => this.magnetFromHash(h));
      const response = await this.client.get(`${this.baseUrl}/magnet/instant`, {
        params: {
          agent: 'Kraken',
          apikey: this.apiKey,
          magnets: magnets.join(','),
        },
      });

      if (response.data.status === 'success') {
        const data = response.data.data?.magnets || [];
        for (let i = 0; i < data.length; i++) {
          const hash = infoHashes[i]?.toLowerCase();
          if (hash) {
            result[hash] = {
              cached: data[i]?.instant === true,
              files: data[i]?.files?.map((f: { n: string; s: number }, idx: number) => ({
                id: idx,
                name: f.n,
                size: f.s,
              })),
            };
          }
        }
      }
    } catch (error) {
      logger.warn('AD availability check failed', { error });
    }

    return result;
  }

  async resolve(infoHash: string, fileIdx?: number): Promise<ResolvedStream> {
    // Upload magnet
    const uploadResponse = await this.client.get(`${this.baseUrl}/magnet/upload`, {
      params: {
        agent: 'Kraken',
        apikey: this.apiKey,
        magnets: [this.magnetFromHash(infoHash)],
      },
    });

    const magnetId = uploadResponse.data.data?.magnets?.[0]?.id;
    if (!magnetId) {
      throw new Error('Failed to add magnet');
    }

    // Wait for ready
    await this.waitForReady(magnetId);

    // Get status to find links
    const statusResponse = await this.client.get(`${this.baseUrl}/magnet/status`, {
      params: {
        agent: 'Kraken',
        apikey: this.apiKey,
        id: magnetId,
      },
    });

    const links = statusResponse.data.data?.magnets?.links || [];
    const videoLinks = links.filter((l: { filename: string }) => 
      /\.(mkv|mp4|avi|m4v|mov|wmv|webm)$/i.test(l.filename)
    );

    const selected = videoLinks[fileIdx || 0] || videoLinks[0];
    if (!selected) {
      throw new Error('No video files found');
    }

    // Unlock link
    const unlockResponse = await this.client.get(`${this.baseUrl}/link/unlock`, {
      params: {
        agent: 'Kraken',
        apikey: this.apiKey,
        link: selected.link,
      },
    });

    return {
      url: unlockResponse.data.data?.link,
      filename: unlockResponse.data.data?.filename,
      size: unlockResponse.data.data?.filesize,
    };
  }

  private async waitForReady(magnetId: string, maxWait = 30000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const response = await this.client.get(`${this.baseUrl}/magnet/status`, {
        params: {
          agent: 'Kraken',
          apikey: this.apiKey,
          id: magnetId,
        },
      });

      const status = response.data.data?.magnets?.status;
      if (status === 'Ready') return;
      if (status === 'Error') throw new Error('Magnet error');

      await new Promise(r => setTimeout(r, 1000));
    }

    throw new Error('Timeout waiting for magnet');
  }

  async addMagnet(magnetUri: string): Promise<string> {
    const response = await this.client.get(`${this.baseUrl}/magnet/upload`, {
      params: {
        agent: 'Kraken',
        apikey: this.apiKey,
        magnets: [magnetUri],
      },
    });
    return response.data.data?.magnets?.[0]?.id;
  }

  async getStatus(): Promise<DebridStatus> {
    const response = await this.client.get(`${this.baseUrl}/user`, {
      params: {
        agent: 'Kraken',
        apikey: this.apiKey,
      },
    });

    const user = response.data.data?.user;
    return {
      authenticated: true,
      premium: user?.isPremium === true,
      premiumUntil: user?.premiumUntil ? new Date(user.premiumUntil * 1000) : undefined,
    };
  }
}

// ============================================================================
// PREMIUMIZE
// ============================================================================

export class PremiumizeService extends BaseDebridService {
  name = 'Premiumize';
  id: DebridProvider = 'premiumize';
  private baseUrl = 'https://www.premiumize.me/api';

  async checkAvailability(infoHashes: string[]): Promise<DebridAvailability> {
    const result: DebridAvailability = {};

    try {
      const response = await this.client.post(
        `${this.baseUrl}/cache/check`,
        new URLSearchParams({
          apikey: this.apiKey,
          items: infoHashes.map(h => this.magnetFromHash(h)).join(','),
        })
      );

      const statuses = response.data.response || [];
      for (let i = 0; i < infoHashes.length; i++) {
        const hash = infoHashes[i]?.toLowerCase();
        if (hash) {
          result[hash] = { cached: statuses[i] === true };
        }
      }
    } catch (error) {
      logger.warn('PM availability check failed', { error });
    }

    return result;
  }

  async resolve(infoHash: string, fileIdx?: number): Promise<ResolvedStream> {
    // Create transfer
    const createResponse = await this.client.post(
      `${this.baseUrl}/transfer/create`,
      new URLSearchParams({
        apikey: this.apiKey,
        src: this.magnetFromHash(infoHash),
      })
    );

    if (createResponse.data.status !== 'success') {
      throw new Error('Failed to create transfer');
    }

    const transferId = createResponse.data.id;

    // For cached content, it should be instant
    // Get direct download link
    const ddlResponse = await this.client.post(
      `${this.baseUrl}/transfer/directdl`,
      new URLSearchParams({
        apikey: this.apiKey,
        src: this.magnetFromHash(infoHash),
      })
    );

    const files = ddlResponse.data.content || [];
    const videoFiles = files.filter((f: { path: string }) =>
      /\.(mkv|mp4|avi|m4v|mov|wmv|webm)$/i.test(f.path)
    );

    const selected = videoFiles[fileIdx || 0] || videoFiles[0];
    if (!selected) {
      throw new Error('No video files found');
    }

    return {
      url: selected.link,
      filename: selected.path,
      size: selected.size,
    };
  }

  async addMagnet(magnetUri: string): Promise<string> {
    const response = await this.client.post(
      `${this.baseUrl}/transfer/create`,
      new URLSearchParams({
        apikey: this.apiKey,
        src: magnetUri,
      })
    );
    return response.data.id;
  }

  async getStatus(): Promise<DebridStatus> {
    const response = await this.client.get(`${this.baseUrl}/account/info`, {
      params: { apikey: this.apiKey },
    });

    return {
      authenticated: true,
      premium: response.data.status === 'success',
      premiumUntil: new Date(response.data.premium_until * 1000),
      pointsUsed: response.data.space_used,
    };
  }
}

// ============================================================================
// DEBRID-LINK
// ============================================================================

export class DebridLinkService extends BaseDebridService {
  name = 'Debrid-Link';
  id: DebridProvider = 'debridlink';
  private baseUrl = 'https://debrid-link.com/api/v2';

  constructor(apiKey: string) {
    super(apiKey);
    this.client.defaults.headers['Authorization'] = `Bearer ${apiKey}`;
  }

  async checkAvailability(infoHashes: string[]): Promise<DebridAvailability> {
    const result: DebridAvailability = {};

    try {
      const response = await this.client.get(`${this.baseUrl}/seedbox/cached`, {
        params: { url: infoHashes.map(h => this.magnetFromHash(h)).join(',') },
      });

      const data = response.data.value || {};
      for (const hash of infoHashes) {
        const hashLower = hash.toLowerCase();
        result[hashLower] = { cached: !!data[hashLower] };
      }
    } catch (error) {
      logger.warn('DL availability check failed', { error });
    }

    return result;
  }

  async resolve(infoHash: string, fileIdx?: number): Promise<ResolvedStream> {
    const response = await this.client.post(`${this.baseUrl}/seedbox/add`, {
      url: this.magnetFromHash(infoHash),
      async: false,
    });

    const torrent = response.data.value;
    const files = torrent.files || [];
    const videoFiles = files.filter((f: { name: string }) =>
      /\.(mkv|mp4|avi|m4v|mov|wmv|webm)$/i.test(f.name)
    );

    const selected = videoFiles[fileIdx || 0] || videoFiles[0];
    if (!selected) {
      throw new Error('No video files found');
    }

    return {
      url: selected.downloadUrl,
      filename: selected.name,
      size: selected.size,
    };
  }

  async addMagnet(magnetUri: string): Promise<string> {
    const response = await this.client.post(`${this.baseUrl}/seedbox/add`, {
      url: magnetUri,
    });
    return response.data.value?.id;
  }

  async getStatus(): Promise<DebridStatus> {
    const response = await this.client.get(`${this.baseUrl}/account/infos`);

    return {
      authenticated: true,
      premium: response.data.value?.premium === true,
      premiumUntil: new Date(response.data.value?.premiumLeft * 1000 + Date.now()),
    };
  }
}

// ============================================================================
// TORBOX
// ============================================================================

export class TorBoxService extends BaseDebridService {
  name = 'TorBox';
  id: DebridProvider = 'torbox';
  private baseUrl = 'https://api.torbox.app/v1/api';

  constructor(apiKey: string) {
    super(apiKey);
    this.client.defaults.headers['Authorization'] = `Bearer ${apiKey}`;
  }

  async checkAvailability(infoHashes: string[]): Promise<DebridAvailability> {
    const result: DebridAvailability = {};

    try {
      const response = await this.client.get(`${this.baseUrl}/torrents/checkcached`, {
        params: { hash: infoHashes.join(','), list_files: true },
      });

      const data = response.data.data || {};
      for (const hash of infoHashes) {
        const hashLower = hash.toLowerCase();
        const info = data[hashLower];
        result[hashLower] = {
          cached: info?.cached === true,
          files: info?.files?.map((f: { name: string; size: number }, idx: number) => ({
            id: idx,
            name: f.name,
            size: f.size,
          })),
        };
      }
    } catch (error) {
      logger.warn('TorBox availability check failed', { error });
    }

    return result;
  }

  async resolve(infoHash: string, fileIdx?: number): Promise<ResolvedStream> {
    // Create torrent
    const createResponse = await this.client.post(`${this.baseUrl}/torrents/createtorrent`, {
      magnet: this.magnetFromHash(infoHash),
    });

    const torrentId = createResponse.data.data?.torrent_id;
    if (!torrentId) {
      throw new Error('Failed to create torrent');
    }

    // Get torrent info
    const infoResponse = await this.client.get(`${this.baseUrl}/torrents/mylist`, {
      params: { id: torrentId },
    });

    const files = infoResponse.data.data?.files || [];
    const videoFiles = files.filter((f: { name: string }) =>
      /\.(mkv|mp4|avi|m4v|mov|wmv|webm)$/i.test(f.name)
    );

    const selected = videoFiles[fileIdx || 0] || videoFiles[0];
    if (!selected) {
      throw new Error('No video files found');
    }

    // Request download link
    const linkResponse = await this.client.get(`${this.baseUrl}/torrents/requestdl`, {
      params: {
        token: this.apiKey,
        torrent_id: torrentId,
        file_id: selected.id,
      },
    });

    return {
      url: linkResponse.data.data,
      filename: selected.name,
      size: selected.size,
    };
  }

  async addMagnet(magnetUri: string): Promise<string> {
    const response = await this.client.post(`${this.baseUrl}/torrents/createtorrent`, {
      magnet: magnetUri,
    });
    return response.data.data?.torrent_id;
  }

  async getStatus(): Promise<DebridStatus> {
    const response = await this.client.get(`${this.baseUrl}/user/me`);

    return {
      authenticated: true,
      premium: response.data.data?.plan > 0,
      premiumUntil: new Date(response.data.data?.premium_expires_at),
    };
  }
}

// ============================================================================
// DEBRID FACTORY
// ============================================================================

export function createDebridService(
  provider: DebridProvider,
  apiKey: string
): DebridService {
  switch (provider) {
    case 'realdebrid':
      return new RealDebridService(apiKey);
    case 'alldebrid':
      return new AllDebridService(apiKey);
    case 'premiumize':
      return new PremiumizeService(apiKey);
    case 'debridlink':
      return new DebridLinkService(apiKey);
    case 'torbox':
      return new TorBoxService(apiKey);
    // Add more providers as needed
    default:
      throw new Error(`Unsupported debrid provider: ${provider}`);
  }
}

// ============================================================================
// MULTI-DEBRID MANAGER
// ============================================================================

export class MultiDebridManager {
  private services: Map<DebridProvider, DebridService> = new Map();

  addService(provider: DebridProvider, apiKey: string): void {
    const service = createDebridService(provider, apiKey);
    this.services.set(provider, service);
  }

  async checkAllAvailability(infoHashes: string[]): Promise<Map<string, DebridProvider[]>> {
    const result = new Map<string, DebridProvider[]>();

    // Initialize map
    for (const hash of infoHashes) {
      result.set(hash.toLowerCase(), []);
    }

    // Check all services in parallel
    const checks = Array.from(this.services.entries()).map(async ([provider, service]) => {
      try {
        const availability = await service.checkAvailability(infoHashes);
        for (const [hash, info] of Object.entries(availability)) {
          if (info.cached) {
            const existing = result.get(hash) || [];
            existing.push(provider);
            result.set(hash, existing);
          }
        }
      } catch (error) {
        logger.error(`Debrid check failed for ${provider}`, { error });
      }
    });

    await Promise.all(checks);
    return result;
  }

  async resolveWithBest(
    infoHash: string,
    fileIdx?: number,
    preferredProvider?: DebridProvider
  ): Promise<{ stream: ResolvedStream; provider: DebridProvider }> {
    // Try preferred provider first
    if (preferredProvider && this.services.has(preferredProvider)) {
      try {
        const service = this.services.get(preferredProvider)!;
        const stream = await service.resolve(infoHash, fileIdx);
        return { stream, provider: preferredProvider };
      } catch (error) {
        logger.warn(`Preferred provider ${preferredProvider} failed`, { error });
      }
    }

    // Try all others
    for (const [provider, service] of this.services) {
      if (provider === preferredProvider) continue;
      try {
        const stream = await service.resolve(infoHash, fileIdx);
        return { stream, provider };
      } catch (error) {
        logger.warn(`Provider ${provider} failed`, { error });
      }
    }

    throw new Error('All debrid providers failed to resolve');
  }

  getProviders(): DebridProvider[] {
    return Array.from(this.services.keys());
  }
}
