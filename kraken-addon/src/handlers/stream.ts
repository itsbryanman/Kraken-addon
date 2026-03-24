/**
 * Kraken Stream Handler
 * 
 * Main orchestration layer that:
 * 1. Parses requests
 * 2. Queries providers in parallel
 * 3. Checks debrid availability
 * 4. Ranks and filters results
 * 5. Returns Stremio-compatible streams
 */

import {
  StreamResponse,
  Stream,
  KrakenConfig,
  SearchQuery,
  ContentType,
  DebridProvider,
} from '../types';
import { parseConfigFromPath, parseStremioId, hashConfig } from '../config/parser';
import { rankTorrents, formatStreamTitle, formatStreamName, RankedTorrent } from '../ranking/scorer';
import { createDebridService, MultiDebridManager } from '../debrid/services';
import { streamCache, cache } from '../cache/manager';
import { logger, logPerformance } from '../utils/logger';
import { providerManager } from '../providers/manager';
import { resolveMetadata, resolveFromKitsu, buildSearchQuery, cleanTitleForSearch } from '../utils/metadata';
import { validateResults } from '../utils/validation';
import { createHash } from 'crypto';

const BASE_URL = process.env['BASE_URL'] || 'http://localhost:7000';
const STALE_REVALIDATE = 4 * 60 * 60;
const STALE_ERROR = 7 * 24 * 60 * 60;
const DEFAULT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://explodie.org:6969/announce',
  'udp://exodus.desync.com:6969/announce',
];

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handleStreamRequest(
  type: ContentType,
  id: string,
  configPath: string
): Promise<StreamResponse> {
  const startTime = Date.now();
  
  // Parse config
  const config = parseConfigFromPath(configPath);
  const { imdbId, kitsuId, season, episode } = parseStremioId(id);
  
  logger.info('Stream request', {
    type,
    id,
    imdbId,
    kitsuId,
    season,
    episode,
    config: hashConfig(config),
  });

  // Check cache
  if (config.enableCache) {
    const cached = await streamCache.get(id, hashConfig(config));
    if (cached) {
      logger.debug('Cache hit', { id });
      return {
        streams: cached as Stream[],
        cacheMaxAge: config.cacheExpiry,
        staleRevalidate: STALE_REVALIDATE,
        staleError: STALE_ERROR,
      };
    }
  }

  if (!imdbId && !kitsuId) {
    logger.warn('Unsupported Stremio ID', { id });
    return {
      streams: [],
      cacheMaxAge: 60,
      staleRevalidate: 60,
      staleError: 300,
    };
  }

  const metadata = imdbId
    ? await resolveMetadata(imdbId, type === 'series' ? 'series' : 'movie')
    : await resolveFromKitsu(kitsuId!);
  if (!metadata) {
    logger.warn('Could not resolve metadata', { imdbId, kitsuId, type });
    return {
      streams: [],
      cacheMaxAge: 60,
      staleRevalidate: 60,
      staleError: 300,
    };
  }

  // Build search query from resolved metadata so text-only providers get a real title.
  const searchQuery: SearchQuery = {
    imdbId,
    kitsuId,
    query: cleanTitleForSearch(buildSearchQuery(metadata, season, episode)),
    type: type === 'series' ? 'series' : 'movie',
    season,
    episode,
    year: metadata.year,
  };
  if (!searchQuery.query) {
    logger.warn('No search query could be built from metadata', { imdbId, kitsuId, type });
    return {
      streams: [],
      cacheMaxAge: 60,
      staleRevalidate: 60,
      staleError: 300,
    };
  }

  logger.info('Resolved search query', {
    imdbId,
    kitsuId,
    query: searchQuery.query,
    year: metadata.year,
  });

  // Initialize external integrations if configured
  await providerManager.addIntegrations(config);

  // Query all enabled providers in parallel using the provider manager
  const allResults = await providerManager.searchAll(searchQuery, config);

  logger.debug('Provider search complete', { totalResults: allResults.length });

  const validatedResults = validateResults(allResults, searchQuery, metadata);
  logger.debug('Validation complete', {
    before: allResults.length,
    after: validatedResults.length,
    rejected: allResults.length - validatedResults.length,
  });

  // Check debrid availability if configured
  const errorStreams: Stream[] = [];
  let cachedHashes = new Set<string>();
  let cachedProvidersByHash = new Map<string, DebridProvider[]>();

  if (config.debridService && config.debridApiKey) {
    const debridManager = new MultiDebridManager();

    try {
      const status = await getCachedDebridStatus(config.debridService, config.debridApiKey);
      if (!status.authenticated || !status.premium) {
        errorStreams.push(
          buildErrorStream(
            `${config.debridService} error`,
            `Invalid or expired ${config.debridService} credentials. Check your configuration.`
          )
        );
      }
    } catch (error) {
      errorStreams.push(
        buildErrorStream(
          `${config.debridService} error`,
          `${config.debridService} connection failed: ${formatErrorMessage(error)}`
        )
      );
    }

    debridManager.addService(config.debridService, config.debridApiKey);

    // Add multi-debrid services if configured
    if (config.multiDebrid) {
      for (const [provider, apiKey] of Object.entries(config.multiDebrid)) {
        if (apiKey && provider !== config.debridService) {
          debridManager.addService(provider as any, apiKey);
        }
      }
    }

    // Check availability
    const infoHashes = validatedResults.map(r => r.infoHash);
    if (infoHashes.length > 0) {
      cachedProvidersByHash = await debridManager.checkAllAvailability(infoHashes);
      for (const [hash, providers] of cachedProvidersByHash) {
        if (providers.length > 0) {
          cachedHashes.add(hash.toLowerCase());
        }
      }
    }

    logger.debug('Debrid check complete', { cached: cachedHashes.size });
  }

  // Rank and filter torrents
  const ranked = rankTorrents(validatedResults, config, cachedHashes);
  logger.debug('Ranking complete', { ranked: ranked.length });

  // Convert to Stremio streams
  const streams = await convertToStreams(ranked, config, type, configPath, cachedProvidersByHash);
  const finalStreams = errorStreams.length > 0 ? [...errorStreams, ...streams] : streams;

  // Cache results
  if (config.enableCache && errorStreams.length === 0 && streams.length > 0) {
    await streamCache.set(id, hashConfig(config), streams, config.cacheExpiry);
  }

  logPerformance('Stream request', startTime, { 
    id, 
    providers: config.providers.length,
    results: validatedResults.length,
    scrapedResults: allResults.length,
    streams: finalStreams.length,
  });

  return {
    streams: finalStreams,
    cacheMaxAge: errorStreams.length > 0 ? 0 : config.cacheExpiry,
    staleRevalidate: errorStreams.length > 0 ? 0 : STALE_REVALIDATE,
    staleError: errorStreams.length > 0 ? 0 : STALE_ERROR,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function convertToStreams(
  torrents: RankedTorrent[],
  config: KrakenConfig,
  type: ContentType,
  configPath: string,
  cachedProvidersByHash: Map<string, DebridProvider[]>
): Promise<Stream[]> {
  const streams: Stream[] = [];

  for (const torrent of torrents) {
    const preferredFile = getPreferredVideoFile(torrent);
    const displayFilename = preferredFile?.name || torrent.title;
    const videoSize = preferredFile?.size;
    const cachedProviders = cachedProvidersByHash.get(torrent.infoHash.toLowerCase()) || [];
    const resolveProvider = chooseDebridProvider(config.debridService, cachedProviders);

    const stream: Stream = {
      name: formatStreamName(torrent, resolveProvider),
      title: formatTitleWithFilename(formatStreamTitle(torrent), displayFilename),
      _kraken: {
        provider: torrent.provider,
        quality: torrent.quality,
        score: torrent.score,
        cached: torrent.cached,
        debridProvider: resolveProvider,
        seeders: torrent.seeders,
        size: torrent.size,
        uploadDate: torrent.uploadDate?.toISOString(),
      },
      behaviorHints: {
        filename: displayFilename,
        videoSize,
        bingeGroup: type === 'series' ? buildBingeGroup(torrent) : undefined,
      },
    };

    if (torrent.cached && resolveProvider) {
      stream.url = buildResolveUrl(
        configPath,
        resolveProvider,
        torrent.infoHash,
        preferredFile?.index ?? 0,
        torrent.title
      );
    } else {
      stream.infoHash = torrent.infoHash;
      stream.sources = buildTorrentSources(torrent.infoHash, torrent.magnetUri);
      if (preferredFile?.index !== undefined) {
        stream.fileIdx = preferredFile.index;
      }
    }

    streams.push(stream);
  }

  return streams;
}

function formatTitleWithFilename(streamTitle: string, filename: string): string {
  const basename = filename.replace(/\\/g, '/').split('/').pop() || filename;
  const truncated = basename.length > 140 ? `${basename.slice(0, 139)}…` : basename;
  return `📄 ${truncated}\n${streamTitle}`;
}

function chooseDebridProvider(
  preferredProvider: DebridProvider | undefined,
  availableProviders: DebridProvider[]
): DebridProvider | undefined {
  if (preferredProvider && availableProviders.includes(preferredProvider)) {
    return preferredProvider;
  }

  return availableProviders[0];
}

function buildResolveUrl(
  configPath: string,
  provider: DebridProvider,
  infoHash: string,
  fileIdx: number,
  filename: string
): string {
  const encodedFilename = encodeURIComponent(filename);
  return `${BASE_URL}/${configPath}/resolve/${provider}/${infoHash}/null/${fileIdx}/${encodedFilename}`;
}

function getPreferredVideoFile(torrent: RankedTorrent) {
  if (!torrent.files || torrent.files.length === 0) {
    return undefined;
  }

  const videoFiles = torrent.files.filter(file =>
    /\.(mkv|mp4|avi|m4v|mov|wmv|webm)$/i.test(file.name)
  );
  if (videoFiles.length === 0) {
    return torrent.files[0];
  }

  return [...videoFiles].sort((a, b) => b.size - a.size)[0];
}

function buildBingeGroup(torrent: RankedTorrent): string {
  const parts = [
    'kraken',
    torrent.quality.resolution,
    torrent.quality.source !== 'Unknown' ? torrent.quality.source : undefined,
    torrent.quality.codec,
    torrent.quality.hdr && torrent.quality.hdr !== 'SDR' ? torrent.quality.hdr : undefined,
    torrent.parsed.group,
  ].filter(Boolean);

  return parts.join('|');
}

function buildTorrentSources(infoHash: string, magnetUri?: string): string[] {
  const sources = new Set<string>();
  sources.add(`dht:${infoHash}`);

  for (const tracker of DEFAULT_TRACKERS) {
    sources.add(`tracker:${tracker}`);
  }

  const magnetTrackers = magnetUri?.match(/(?:\?|&)tr=([^&]+)/g) || [];
  for (const tracker of magnetTrackers) {
    const value = tracker.replace(/^(?:\?|&)tr=/, '');
    sources.add(`tracker:${decodeURIComponent(value)}`);
  }

  return Array.from(sources);
}

function buildErrorStream(name: string, message: string): Stream {
  return {
    name: `🦑 Kraken\n${name}`,
    title: message,
    externalUrl: `${BASE_URL}/error?message=${encodeURIComponent(message)}`,
  };
}

async function getCachedDebridStatus(provider: DebridProvider, apiKey: string) {
  const cacheKey = `debrid:status:${provider}:${createHash('sha256').update(apiKey).digest('hex').slice(0, 12)}`;
  return cache.getOrSet(cacheKey, () => createDebridService(provider, apiKey).getStatus(), 300);
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ============================================================================
// CATALOG HANDLER (for future use)
// ============================================================================

export async function handleCatalogRequest(
  type: ContentType,
  catalogId: string,
  extra?: Record<string, string>
): Promise<{ metas: unknown[] }> {
  // Catalogs would provide discovery/search features
  // For now, Kraken focuses on streams only
  return { metas: [] };
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

export async function healthCheck(): Promise<{
  status: 'ok' | 'degraded' | 'error';
  providers: Record<string, boolean>;
  cache: { memory: boolean; redis?: boolean };
}> {
  const providerStatus: Record<string, boolean> = {};

  // Check all registered providers
  const allProviders = providerManager.getAllProviders();
  for (const provider of allProviders) {
    providerStatus[provider.id] = true;
  }

  return {
    status: 'ok',
    providers: providerStatus,
    cache: {
      memory: true,
      redis: !!process.env['REDIS_URL'],
    },
  };
}
