/**
 * Kraken Add-on Type Definitions
 * Comprehensive types for Stremio protocol and internal systems
 */

// ============================================================================
// STREMIO PROTOCOL TYPES
// ============================================================================

export interface StremioManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  logo: string;
  website?: string;
  background?: string;
  resources: (string | ResourceDescriptor)[];
  types: ContentType[];
  catalogs?: CatalogDescriptor[];
  idPrefixes?: string[];
  behaviorHints?: BehaviorHints;
  contactEmail?: string;
}

export interface ResourceDescriptor {
  name: 'stream' | 'meta' | 'catalog' | 'subtitles';
  types: ContentType[];
  idPrefixes?: string[];
}

export interface CatalogDescriptor {
  type: ContentType;
  id: string;
  name: string;
  extra?: CatalogExtra[];
  extraSupported?: string[];
  extraRequired?: string[];
}

export interface CatalogExtra {
  name: string;
  isRequired?: boolean;
  options?: string[];
  optionsLimit?: number;
}

export interface BehaviorHints {
  adult?: boolean;
  p2p?: boolean;
  configurable?: boolean;
  configurationRequired?: boolean;
}

export type ContentType = 'movie' | 'series' | 'channel' | 'tv' | 'other';

// Stream response types
export interface StreamResponse {
  streams: Stream[];
  cacheMaxAge?: number;
  staleRevalidate?: number;
  staleError?: number;
}

export interface Stream {
  name?: string;
  title?: string;
  url?: string;
  infoHash?: string;
  fileIdx?: number;
  sources?: string[];
  externalUrl?: string;
  subtitles?: SubtitleTrack[];
  behaviorHints?: StreamBehaviorHints;
  // Kraken custom metadata
  _kraken?: KrakenStreamMetadata;
}

export interface KrakenStreamMetadata {
  provider: string;
  quality: QualityInfo;
  score: number;
  cached?: boolean;
  debridProvider?: string;
  seeders?: number;
  size?: number;
  uploadDate?: string;
}

export interface StreamBehaviorHints {
  notWebReady?: boolean;
  bingeGroup?: string;
  countryWhitelist?: string[];
  countryBlacklist?: string[];
  proxyHeaders?: {
    request?: Record<string, string>;
    response?: Record<string, string>;
  };
  videoHash?: string;
  videoSize?: number;
  filename?: string;
}

export interface SubtitleTrack {
  id: string;
  url: string;
  lang: string;
}

// Meta response types
export interface MetaResponse {
  meta: MetaItem;
}

export interface MetaItem {
  id: string;
  type: ContentType;
  name: string;
  poster?: string;
  posterShape?: 'square' | 'poster' | 'landscape';
  background?: string;
  logo?: string;
  description?: string;
  releaseInfo?: string;
  imdbRating?: string;
  year?: number;
  runtime?: string;
  genres?: string[];
  cast?: string[];
  director?: string[];
  writer?: string[];
  awards?: string;
  country?: string;
  trailers?: Trailer[];
  links?: Link[];
  videos?: Video[];
  behaviorHints?: MetaBehaviorHints;
}

export interface MetaBehaviorHints {
  defaultVideoId?: string;
  hasScheduledVideos?: boolean;
}

export interface Trailer {
  source: string;
  type: 'Trailer' | 'Clip';
}

export interface Link {
  name: string;
  category: string;
  url: string;
}

export interface Video {
  id: string;
  title: string;
  released?: string;
  thumbnail?: string;
  streams?: Stream[];
  available?: boolean;
  season?: number;
  episode?: number;
  overview?: string;
}

// ============================================================================
// TORRENT & PROVIDER TYPES
// ============================================================================

export interface TorrentResult {
  title: string;
  infoHash: string;
  magnetUri?: string;
  size?: number;
  seeders?: number;
  leechers?: number;
  provider: string;
  uploadDate?: Date;
  category?: string;
  imdbId?: string;
  files?: TorrentFile[];
}

export interface TorrentFile {
  name: string;
  size: number;
  index: number;
}

export interface ParsedTorrentTitle {
  title: string;
  year?: number;
  season?: number;
  episode?: number;
  resolution?: string;
  quality?: string;
  codec?: string;
  audio?: string;
  group?: string;
  proper?: boolean;
  repack?: boolean;
  extended?: boolean;
  hardcoded?: boolean;
  hdr?: string;
  threed?: boolean;
}

export interface QualityInfo {
  resolution: Resolution;
  source: SourceType;
  codec?: VideoCodec;
  audio?: AudioCodec;
  hdr?: HDRType;
  is3D?: boolean;
  bitDepth?: number;
  channels?: string;
}

export type Resolution = '4K' | '2160p' | '1080p' | '720p' | '480p' | 'SD' | 'Unknown';
export type SourceType = 
  | 'BluRay' | 'Remux' | 'WEB-DL' | 'WEBRip' | 'HDTV' 
  | 'DVDRip' | 'BDRip' | 'HDRip' | 'CAM' | 'TS' | 'SCR' | 'Unknown';
export type VideoCodec = 'x265' | 'HEVC' | 'x264' | 'AVC' | 'AV1' | 'VP9' | 'XviD' | 'Unknown';
export type AudioCodec = 
  | 'Atmos' | 'TrueHD' | 'DTS-HD MA' | 'DTS-HD' | 'DTS-X' 
  | 'DTS' | 'DD+' | 'DD5.1' | 'AAC' | 'MP3' | 'Unknown';
export type HDRType = 'DV' | 'HDR10+' | 'HDR10' | 'HDR' | 'HLG' | 'SDR';

// Provider interface
export interface Provider {
  name: string;
  id: string;
  enabled: boolean;
  categories: ('movies' | 'tv' | 'anime' | 'xxx' | 'other')[];
  languages: string[];
  rateLimit?: number;
  search(query: SearchQuery): Promise<TorrentResult[]>;
  getStatus(): Promise<ProviderStatus>;
}

export interface ProviderStatus {
  online: boolean;
  latency?: number;
  lastChecked: Date;
  error?: string;
}

export interface SearchQuery {
  query?: string;
  imdbId?: string;
  kitsuId?: string;
  tmdbId?: string;
  type: 'movie' | 'series';
  season?: number;
  episode?: number;
  year?: number;
}

// ============================================================================
// DEBRID TYPES
// ============================================================================

export type DebridProvider = 
  | 'realdebrid' | 'alldebrid' | 'premiumize' | 'debridlink'
  | 'torbox' | 'offcloud' | 'easydebrid' | 'putio';

export interface DebridService {
  name: string;
  id: DebridProvider;
  checkAvailability(infoHashes: string[]): Promise<DebridAvailability>;
  resolve(infoHash: string, fileIdx?: number): Promise<ResolvedStream>;
  addMagnet(magnetUri: string): Promise<string>;
  getStatus(): Promise<DebridStatus>;
}

export interface DebridAvailability {
  [infoHash: string]: {
    cached: boolean;
    files?: DebridFile[];
  };
}

export interface DebridFile {
  id: string | number;
  name: string;
  size: number;
  index?: number;
}

export interface ResolvedStream {
  url: string;
  filename?: string;
  size?: number;
  mimeType?: string;
}

export interface DebridStatus {
  authenticated: boolean;
  premium: boolean;
  premiumUntil?: Date;
  pointsUsed?: number;
  pointsRemaining?: number;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface KrakenConfig {
  // Providers
  providers: string[];
  enableProwlarr: boolean;
  prowlarrUrl?: string;
  prowlarrApiKey?: string;
  enableJackett: boolean;
  jackettUrl?: string;
  jackettApiKey?: string;
  
  // Debrid
  debridService?: DebridProvider;
  debridApiKey?: string;
  multiDebrid?: {
    [key in DebridProvider]?: string;
  };
  preferCached: boolean;
  
  // Quality
  maxResolution: Resolution;
  minResolution?: Resolution;
  excludeQualities: SourceType[];
  excludeCodecs: VideoCodec[];
  preferHDR: boolean;
  preferDolbyVision: boolean;
  maxSize?: number; // in bytes
  
  // Sorting
  sortBy: 'quality' | 'seeders' | 'size' | 'score';
  sortOrder: 'asc' | 'desc';
  
  // Results
  maxResults: number;
  maxResultsPerQuality: number;
  
  // Languages
  languages: string[];
  excludeLanguages: string[];
  
  // Advanced
  timeout: number;
  enableCache: boolean;
  cacheExpiry: number;
}

export const DEFAULT_CONFIG: KrakenConfig = {
  providers: ['yts', 'eztv', '1337x', 'rarbg', 'tpb', 'torrentgalaxy', 'nyaasi'],
  enableProwlarr: false,
  enableJackett: false,
  debridService: undefined,
  debridApiKey: undefined,
  preferCached: true,
  maxResolution: '4K',
  excludeQualities: ['CAM', 'TS', 'SCR'],
  excludeCodecs: [],
  preferHDR: true,
  preferDolbyVision: true,
  sortBy: 'score',
  sortOrder: 'desc',
  maxResults: 50,
  maxResultsPerQuality: 10,
  languages: ['en'],
  excludeLanguages: [],
  timeout: 15000,
  enableCache: true,
  cacheExpiry: 3600,
};

// ============================================================================
// INTERNAL TYPES
// ============================================================================

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface RankingWeights {
  resolution: number;
  source: number;
  codec: number;
  audio: number;
  hdr: number;
  seeders: number;
  size: number;
  provider: number;
  cached: number;
  age: number;
}

export interface StreamRequest {
  type: ContentType;
  id: string;
  config: KrakenConfig;
}

export interface ProviderRegistry {
  register(provider: Provider): void;
  get(id: string): Provider | undefined;
  getAll(): Provider[];
  getEnabled(config: KrakenConfig): Provider[];
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}
