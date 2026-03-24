/**
 * Kraken Configuration Parser
 * 
 * Parses configuration from URL path (Base64 JSON) or query params
 */

import { z } from 'zod';
import {
  KrakenConfig,
  DEFAULT_CONFIG,
  DebridProvider,
  Resolution,
  SourceType,
  VideoCodec,
} from '../types';
import { DEFAULT_ENABLED } from '../providers/registry';
import { createHash } from 'crypto';

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

const ResolutionSchema = z.enum(['4K', '2160p', '1080p', '720p', '480p', 'SD', 'Unknown']);
const SourceTypeSchema = z.enum([
  'BluRay', 'Remux', 'WEB-DL', 'WEBRip', 'HDTV', 
  'DVDRip', 'BDRip', 'HDRip', 'CAM', 'TS', 'SCR', 'Unknown'
]);
const VideoCodecSchema = z.enum(['x265', 'HEVC', 'x264', 'AVC', 'AV1', 'VP9', 'XviD', 'Unknown']);
const DebridProviderSchema = z.enum([
  'realdebrid', 'alldebrid', 'premiumize', 'debridlink',
  'torbox', 'offcloud', 'easydebrid', 'putio'
]);

const KrakenConfigSchema = z.object({
  // Providers
  providers: z.array(z.string()).default(DEFAULT_ENABLED),
  enableProwlarr: z.boolean().default(false),
  prowlarrUrl: z.string().url().optional(),
  prowlarrApiKey: z.string().optional(),
  enableJackett: z.boolean().default(false),
  jackettUrl: z.string().url().optional(),
  jackettApiKey: z.string().optional(),
  
  // Debrid
  debridService: DebridProviderSchema.optional(),
  debridApiKey: z.string().optional(),
  multiDebrid: z.record(DebridProviderSchema, z.string()).optional(),
  preferCached: z.boolean().default(true),
  
  // Quality
  maxResolution: ResolutionSchema.default('4K'),
  minResolution: ResolutionSchema.optional(),
  excludeQualities: z.array(SourceTypeSchema).default(['CAM', 'TS', 'SCR']),
  excludeCodecs: z.array(VideoCodecSchema).default([]),
  preferHDR: z.boolean().default(true),
  preferDolbyVision: z.boolean().default(true),
  maxSize: z.number().positive().optional(),
  
  // Sorting
  sortBy: z.enum(['quality', 'seeders', 'size', 'score']).default('score'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  
  // Results
  maxResults: z.number().int().positive().max(100).default(50),
  maxResultsPerQuality: z.number().int().positive().max(20).default(10),
  
  // Languages
  languages: z.array(z.string()).default(['en']),
  excludeLanguages: z.array(z.string()).default([]),
  
  // Advanced
  timeout: z.number().int().positive().max(60000).default(15000),
  enableCache: z.boolean().default(true),
  cacheExpiry: z.number().int().positive().default(3600),
}).strict();

// ============================================================================
// PARSER FUNCTIONS
// ============================================================================

/**
 * Parse configuration from Base64-encoded JSON in URL path
 */
export function parseConfigFromPath(configPath: string): KrakenConfig {
  if (!configPath || configPath === 'default') {
    return DEFAULT_CONFIG;
  }

  try {
    // URL-safe Base64 decode
    const decoded = Buffer.from(
      configPath.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf-8');
    
    const parsed = JSON.parse(decoded);
    return validateAndMergeConfig(parsed);
  } catch (error) {
    // Fallback: try parsing as pipe-delimited format (Torrentio-style)
    return parsePipeDelimitedConfig(configPath);
  }
}

/**
 * Parse Torrentio-style pipe-delimited configuration
 * Example: providers=yts,eztv|qualityfilter=cam,ts|realdebrid=APIKEY
 */
function parsePipeDelimitedConfig(configString: string): KrakenConfig {
  const config: Partial<KrakenConfig> = {};
  const parts = configString.split('|');

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (!key || !value) continue;

    switch (key.toLowerCase()) {
      case 'providers':
        config.providers = value.split(',');
        break;
      case 'sort':
        if (['quality', 'seeders', 'size', 'score'].includes(value)) {
          config.sortBy = value as KrakenConfig['sortBy'];
        }
        break;
      case 'qualityfilter':
        config.excludeQualities = value.split(',').map(q => {
          const mapping: Record<string, SourceType> = {
            'cam': 'CAM',
            'ts': 'TS',
            'scr': 'SCR',
            'hdcam': 'CAM',
          };
          return mapping[q.toLowerCase()] || q.toUpperCase() as SourceType;
        });
        break;
      case 'maxsize':
        config.maxSize = parseInt(value, 10) * 1024 * 1024 * 1024; // GB to bytes
        break;
      case 'realdebrid':
      case 'rd':
        config.debridService = 'realdebrid';
        config.debridApiKey = value;
        break;
      case 'alldebrid':
      case 'ad':
        config.debridService = 'alldebrid';
        config.debridApiKey = value;
        break;
      case 'premiumize':
      case 'pm':
        config.debridService = 'premiumize';
        config.debridApiKey = value;
        break;
      case 'debridlink':
      case 'dl':
        config.debridService = 'debridlink';
        config.debridApiKey = value;
        break;
      case 'torbox':
      case 'tb':
        config.debridService = 'torbox';
        config.debridApiKey = value;
        break;
      case 'prowlarr':
        config.enableProwlarr = true;
        const [url, apiKey] = value.split('@');
        config.prowlarrUrl = url;
        config.prowlarrApiKey = apiKey;
        break;
      case 'jackett':
        config.enableJackett = true;
        const [jUrl, jApiKey] = value.split('@');
        config.jackettUrl = jUrl;
        config.jackettApiKey = jApiKey;
        break;
      case 'lang':
      case 'languages':
        config.languages = value.split(',');
        break;
    }
  }

  return validateAndMergeConfig(config);
}

/**
 * Validate partial config and merge with defaults
 */
function validateAndMergeConfig(partial: unknown): KrakenConfig {
  try {
    const merged = {
      ...DEFAULT_CONFIG,
      ...(partial as object),
    };
    return KrakenConfigSchema.parse(merged);
  } catch (error) {
    console.error('Config validation error:', error);
    return DEFAULT_CONFIG;
  }
}

/**
 * Encode configuration to URL-safe Base64
 */
export function encodeConfig(config: Partial<KrakenConfig>): string {
  // Only encode non-default values to keep URL short
  const diff: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(config)) {
    const defaultValue = DEFAULT_CONFIG[key as keyof KrakenConfig];
    if (JSON.stringify(value) !== JSON.stringify(defaultValue)) {
      diff[key] = value;
    }
  }

  if (Object.keys(diff).length === 0) {
    return 'default';
  }

  const json = JSON.stringify(diff);
  return Buffer.from(json)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generate a hash of the config for cache keys
 */
export function hashConfig(config: KrakenConfig): string {
  // Only hash fields that affect results
  const relevant = {
    providers: config.providers,
    debridService: config.debridService,
    maxResolution: config.maxResolution,
    minResolution: config.minResolution,
    excludeQualities: config.excludeQualities,
    excludeCodecs: config.excludeCodecs,
    maxSize: config.maxSize,
    sortBy: config.sortBy,
    languages: config.languages,
    excludeLanguages: config.excludeLanguages,
  };

  return createHash('sha256')
    .update(JSON.stringify(relevant))
    .digest('hex')
    .substring(0, 16);
}

/**
 * Extract IMDB/Kitsu IDs and optional season/episode from Stremio ID
 */
export function parseStremioId(id: string): {
  imdbId?: string;
  kitsuId?: string;
  season?: number;
  episode?: number;
} {
  const kitsuMatch = id.match(/^kitsu:(\d+)(?::(\d+))?$/i);
  if (kitsuMatch) {
    return {
      kitsuId: kitsuMatch[1],
      episode: kitsuMatch[2] ? parseInt(kitsuMatch[2], 10) : undefined,
    };
  }

  // Format: tt1234567 or tt1234567:1:5
  const parts = id.split(':');
  const imdbId = parts[0] || id;
  
  if (parts.length === 3) {
    return {
      imdbId,
      season: parseInt(parts[1] ?? '0', 10),
      episode: parseInt(parts[2] ?? '0', 10),
    };
  }

  return { imdbId };
}

/**
 * Generate manifest URL with encoded config
 */
export function generateManifestUrl(
  baseUrl: string,
  config: Partial<KrakenConfig>
): string {
  const encoded = encodeConfig(config);
  return `${baseUrl}/${encoded}/manifest.json`;
}

// ============================================================================
// CONFIG DIFF FOR UI
// ============================================================================

export interface ConfigDiff {
  field: string;
  label: string;
  current: unknown;
  default: unknown;
}

export function getConfigDiff(config: KrakenConfig): ConfigDiff[] {
  const diffs: ConfigDiff[] = [];
  const labels: Record<string, string> = {
    providers: 'Providers',
    debridService: 'Debrid Service',
    maxResolution: 'Max Resolution',
    excludeQualities: 'Excluded Qualities',
    sortBy: 'Sort By',
    maxResults: 'Max Results',
    languages: 'Languages',
  };

  for (const [key, label] of Object.entries(labels)) {
    const current = config[key as keyof KrakenConfig];
    const defaultVal = DEFAULT_CONFIG[key as keyof KrakenConfig];
    
    if (JSON.stringify(current) !== JSON.stringify(defaultVal)) {
      diffs.push({
        field: key,
        label,
        current,
        default: defaultVal,
      });
    }
  }

  return diffs;
}
