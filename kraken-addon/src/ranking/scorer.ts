/**
 * Kraken Intelligent Ranking System
 * 
 * Unlike Torrentio's simplistic quality-tier sorting, Kraken uses a weighted
 * multi-factor scoring algorithm that considers encode quality, audio tracks,
 * HDR metadata, release group reputation, and actual watchability.
 */

import {
  TorrentResult,
  QualityInfo,
  Resolution,
  SourceType,
  VideoCodec,
  AudioCodec,
  HDRType,
  ParsedTorrentTitle,
  KrakenConfig,
  RankingWeights,
} from '../types';

// ============================================================================
// TITLE PARSING
// ============================================================================

const RESOLUTION_PATTERNS: [RegExp, Resolution][] = [
  [/\b(2160p|4k|uhd)\b/i, '4K'],
  [/\b2160\b/i, '2160p'],
  [/\b1080p\b/i, '1080p'],
  [/\b1080\b/i, '1080p'],
  [/\b720p\b/i, '720p'],
  [/\b720\b/i, '720p'],
  [/\b480p\b/i, '480p'],
  [/\b576p?\b/i, '480p'],
  [/\bhdtv\b/i, '720p'],
  [/\bsd\b/i, 'SD'],
];

const SOURCE_PATTERNS: [RegExp, SourceType][] = [
  [/\b(blu-?ray|bd-?rip|bd-?remux|bdrip)\b/i, 'BluRay'],
  [/\b(remux)\b/i, 'Remux'],
  [/\b(web-?dl|webdl)\b/i, 'WEB-DL'],
  [/\b(web-?rip|webrip)\b/i, 'WEBRip'],
  [/\b(hdtv)\b/i, 'HDTV'],
  [/\b(dvd-?rip|dvdrip)\b/i, 'DVDRip'],
  [/\b(hd-?rip|hdrip)\b/i, 'HDRip'],
  [/\b(cam-?rip|camrip|hdcam|cam)\b/i, 'CAM'],
  [/\b(telesync|ts|hdts)\b/i, 'TS'],
  [/\b(screener|scr|dvdscr)\b/i, 'SCR'],
];

const CODEC_PATTERNS: [RegExp, VideoCodec][] = [
  [/\b(x265|h\.?265|hevc)\b/i, 'x265'],
  [/\b(x264|h\.?264|avc)\b/i, 'x264'],
  [/\b(av1)\b/i, 'AV1'],
  [/\b(vp9)\b/i, 'VP9'],
  [/\b(xvid|divx)\b/i, 'XviD'],
];

const AUDIO_PATTERNS: [RegExp, AudioCodec][] = [
  [/\b(atmos)\b/i, 'Atmos'],
  [/\b(truehd|true-hd)\b/i, 'TrueHD'],
  [/\b(dts-?hd[\s.-]?ma|dts-?hdma)\b/i, 'DTS-HD MA'],
  [/\b(dts-?hd)\b/i, 'DTS-HD'],
  [/\b(dts-?x)\b/i, 'DTS-X'],
  [/\b(dts)\b/i, 'DTS'],
  [/\b(dd\+|ddp|e-?ac-?3|eac3)\b/i, 'DD+'],
  [/\b(dd5\.?1|ac-?3|dolby[\s.-]?digital)\b/i, 'DD5.1'],
  [/\b(aac)\b/i, 'AAC'],
  [/\b(mp3)\b/i, 'MP3'],
];

const HDR_PATTERNS: [RegExp, HDRType][] = [
  [/\b(dv|dolby[\s.-]?vision|dovi)\b/i, 'DV'],
  [/\b(hdr10\+|hdr10plus)\b/i, 'HDR10+'],
  [/\b(hdr10)\b/i, 'HDR10'],
  [/\b(hdr)\b/i, 'HDR'],
  [/\b(hlg)\b/i, 'HLG'],
];

// Known quality release groups (higher = better)
const RELEASE_GROUP_SCORES: Record<string, number> = {
  // Top tier - scene groups known for quality
  'sparks': 100, 'flux': 100, 'epsilon': 100, 'geckos': 100,
  'framestor': 95, 'tigole': 95, 'qxr': 95, 'playbd': 95,
  'criterion': 95, 'haiku': 90, 'd-z0n3': 90, 'dts': 90,
  // Good tier
  'yts': 80, 'yify': 75, 'rarbg': 85, 'ettv': 80,
  'eztv': 80, 'megusta': 85, 'ntb': 85, 'ctrlhd': 90,
  // Anime groups
  'subsplease': 90, 'erai-raws': 85, 'judas': 85,
  'hi10': 85, 'commie': 80, 'horriblesubs': 75,
  // Lower tier
  'mkvcage': 60, 'psyfer': 65, 'bone': 65,
};

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

export function parseTitle(title: string): ParsedTorrentTitle {
  const result: ParsedTorrentTitle = {
    title: extractCleanTitle(title),
  };

  // Extract year
  const yearMatch = title.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) {
    result.year = parseInt(yearMatch[1]!, 10);
  }

  // Extract season/episode
  const seasonMatch = title.match(/s(\d{1,2})e(\d{1,3})/i);
  if (seasonMatch) {
    result.season = parseInt(seasonMatch[1]!, 10);
    result.episode = parseInt(seasonMatch[2]!, 10);
  } else {
    const altSeasonMatch = title.match(/season[\s.-]?(\d{1,2})/i);
    if (altSeasonMatch) {
      result.season = parseInt(altSeasonMatch[1]!, 10);
    } else {
      const compactSeasonMatch = title.match(/\bs(\d{1,2})\b/i);
      if (compactSeasonMatch) {
        result.season = parseInt(compactSeasonMatch[1]!, 10);
      }
    }
  }

  // Extract resolution
  for (const [pattern, resolution] of RESOLUTION_PATTERNS) {
    if (pattern.test(title)) {
      result.resolution = resolution;
      break;
    }
  }

  // Extract source/quality
  for (const [pattern, source] of SOURCE_PATTERNS) {
    if (pattern.test(title)) {
      result.quality = source;
      break;
    }
  }

  // Extract codec
  for (const [pattern, codec] of CODEC_PATTERNS) {
    if (pattern.test(title)) {
      result.codec = codec;
      break;
    }
  }

  // Extract audio
  for (const [pattern, audio] of AUDIO_PATTERNS) {
    if (pattern.test(title)) {
      result.audio = audio;
      break;
    }
  }

  // Extract HDR
  for (const [pattern, hdr] of HDR_PATTERNS) {
    if (pattern.test(title)) {
      result.hdr = hdr;
      break;
    }
  }

  // Flags
  result.proper = /\bproper\b/i.test(title);
  result.repack = /\brepack\b/i.test(title);
  result.extended = /\b(extended|uncut|director'?s?[\s.-]?cut)\b/i.test(title);
  result.hardcoded = /\b(hc|hardcoded)\b/i.test(title);
  result.threed = /\b(3d|sbs|half-?sbs|ou)\b/i.test(title);

  // Extract release group
  const groupMatch = title.match(/-([a-z0-9]+)(?:\.[a-z0-9]+)?$/i);
  if (groupMatch) {
    result.group = groupMatch[1];
  }

  return result;
}

export function extractCleanTitle(title: string): string {
  let clean = title
    .replace(/\.[a-z0-9]+$/i, '') // Remove extension
    .replace(/[\[\](){}]/g, ' ')   // Remove brackets
    .replace(/\b(1080p|720p|2160p|4k|uhd|hdr|bluray|webrip|web-dl|x264|x265|hevc|aac|dts|ac3|truehd|atmos)\b/gi, '')
    .replace(/\b(proper|repack|extended|uncut|internal|real)\b/gi, '')
    .replace(/\b(19|20)\d{2}\b/, '') // Remove year
    .replace(/s\d{1,2}e\d{1,3}/gi, '') // Remove S01E01
    .replace(/-[a-z0-9]+$/i, '')   // Remove group
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return clean;
}

export function extractQualityInfo(torrent: TorrentResult): QualityInfo {
  const parsed = parseTitle(torrent.title);
  
  return {
    resolution: (parsed.resolution as Resolution) || inferResolutionFromSize(torrent.size),
    source: (parsed.quality as SourceType) || 'Unknown',
    codec: parsed.codec as VideoCodec,
    audio: parsed.audio as AudioCodec,
    hdr: parsed.hdr as HDRType,
    is3D: parsed.threed,
  };
}

function inferResolutionFromSize(size?: number): Resolution {
  if (!size) return 'Unknown';
  
  const gb = size / (1024 * 1024 * 1024);
  
  // Rough heuristics for movie length (~2 hours)
  if (gb > 40) return '4K';      // 4K remux
  if (gb > 15) return '2160p';   // 4K encode
  if (gb > 8) return '1080p';    // 1080p high bitrate
  if (gb > 4) return '1080p';    // 1080p standard
  if (gb > 1.5) return '720p';   // 720p
  if (gb > 0.5) return '480p';   // SD
  return 'SD';
}

// ============================================================================
// SCORING SYSTEM
// ============================================================================

const DEFAULT_WEIGHTS: RankingWeights = {
  resolution: 30,    // Resolution importance
  source: 25,        // Source type importance
  codec: 10,         // Video codec importance
  audio: 10,         // Audio codec importance
  hdr: 8,            // HDR importance
  seeders: 10,       // Seeder count importance
  size: 3,           // Size preference (not too small, not too big)
  provider: 2,       // Provider reliability
  cached: 15,        // Debrid cache bonus
  age: 2,            // Newer uploads slightly preferred
};

// Resolution scores (out of 100)
const RESOLUTION_SCORES: Record<Resolution, number> = {
  '4K': 100,
  '2160p': 100,
  '1080p': 80,
  '720p': 60,
  '480p': 30,
  'SD': 20,
  'Unknown': 40,
};

// Source type scores (out of 100)
const SOURCE_SCORES: Record<SourceType, number> = {
  'Remux': 100,
  'BluRay': 95,
  'WEB-DL': 85,
  'WEBRip': 75,
  'HDTV': 65,
  'HDRip': 60,
  'DVDRip': 50,
  'BDRip': 70,
  'CAM': 5,
  'TS': 10,
  'SCR': 15,
  'Unknown': 40,
};

// Video codec scores (out of 100)
const CODEC_SCORES: Record<VideoCodec, number> = {
  'AV1': 100,
  'x265': 95,
  'HEVC': 95,
  'x264': 80,
  'AVC': 80,
  'VP9': 85,
  'XviD': 40,
  'Unknown': 50,
};

// Audio codec scores (out of 100)
const AUDIO_SCORES: Record<AudioCodec, number> = {
  'Atmos': 100,
  'DTS-X': 98,
  'TrueHD': 95,
  'DTS-HD MA': 92,
  'DTS-HD': 85,
  'DTS': 75,
  'DD+': 80,
  'DD5.1': 70,
  'AAC': 60,
  'MP3': 40,
  'Unknown': 50,
};

// HDR scores (out of 100)
const HDR_SCORES: Record<HDRType, number> = {
  'DV': 100,
  'HDR10+': 95,
  'HDR10': 85,
  'HDR': 80,
  'HLG': 75,
  'SDR': 50,
};

/**
 * Calculate comprehensive quality score for a torrent
 */
export function calculateScore(
  torrent: TorrentResult,
  quality: QualityInfo,
  config: KrakenConfig,
  cached: boolean = false
): number {
  const weights = DEFAULT_WEIGHTS;
  let totalScore = 0;
  let totalWeight = 0;

  // Resolution score
  const resScore = RESOLUTION_SCORES[quality.resolution] || 40;
  totalScore += resScore * weights.resolution;
  totalWeight += weights.resolution;

  // Source score
  const sourceScore = SOURCE_SCORES[quality.source] || 40;
  totalScore += sourceScore * weights.source;
  totalWeight += weights.source;

  // Codec score (if known)
  if (quality.codec) {
    const codecScore = CODEC_SCORES[quality.codec] || 50;
    totalScore += codecScore * weights.codec;
    totalWeight += weights.codec;
  }

  // Audio score (if known)
  if (quality.audio) {
    const audioScore = AUDIO_SCORES[quality.audio] || 50;
    totalScore += audioScore * weights.audio;
    totalWeight += weights.audio;
  }

  // HDR score
  if (quality.hdr && config.preferHDR) {
    const hdrScore = HDR_SCORES[quality.hdr] || 50;
    totalScore += hdrScore * weights.hdr;
    totalWeight += weights.hdr;
    
    // Extra bonus for Dolby Vision if preferred
    if (quality.hdr === 'DV' && config.preferDolbyVision) {
      totalScore += 10 * weights.hdr;
    }
  }

  // Seeder score (logarithmic scale)
  if (torrent.seeders !== undefined) {
    const seederScore = Math.min(100, Math.log10(torrent.seeders + 1) * 33);
    totalScore += seederScore * weights.seeders;
    totalWeight += weights.seeders;
  }

  // Size sanity check score
  if (torrent.size) {
    const sizeScore = calculateSizeScore(torrent.size, quality.resolution);
    totalScore += sizeScore * weights.size;
    totalWeight += weights.size;
  }

  // Release group bonus
  const parsed = parseTitle(torrent.title);
  if (parsed.group) {
    const groupScore = RELEASE_GROUP_SCORES[parsed.group.toLowerCase()] || 50;
    totalScore += groupScore * weights.provider;
    totalWeight += weights.provider;
  }

  // Cached bonus (significant!)
  if (cached) {
    totalScore += 100 * weights.cached;
    totalWeight += weights.cached;
  }

  // Calculate final normalized score (0-100)
  const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 50;

  // Apply penalties
  let penalties = 0;

  // Hardcoded subs penalty
  if (parsed.hardcoded) penalties += 15;

  // CAM/TS severe penalty (on top of low source score)
  if (quality.source === 'CAM') penalties += 30;
  if (quality.source === 'TS') penalties += 25;
  if (quality.source === 'SCR') penalties += 20;

  // 3D content penalty (unless specifically requested)
  if (quality.is3D) penalties += 10;

  return Math.max(0, Math.min(100, normalizedScore - penalties));
}

/**
 * Score based on file size appropriateness for resolution
 */
function calculateSizeScore(size: number, resolution: Resolution): number {
  const gb = size / (1024 * 1024 * 1024);

  // Expected size ranges per resolution (in GB)
  const expectedRanges: Record<Resolution, [number, number, number]> = {
    '4K': [15, 35, 80],        // min ideal, max ideal, absolute max
    '2160p': [10, 25, 60],
    '1080p': [3, 12, 25],
    '720p': [1, 4, 10],
    '480p': [0.5, 2, 5],
    'SD': [0.3, 1, 3],
    'Unknown': [1, 5, 15],
  };

  const [minIdeal, maxIdeal, absMax] = expectedRanges[resolution] || [1, 5, 15];

  // Score based on how well size matches expectations
  if (gb >= minIdeal && gb <= maxIdeal) return 100; // Perfect
  if (gb < minIdeal) {
    // Too small - might be poor quality
    return Math.max(30, 100 - ((minIdeal - gb) / minIdeal) * 70);
  }
  if (gb > maxIdeal && gb <= absMax) {
    // A bit large but acceptable
    return 80;
  }
  if (gb > absMax) {
    // Unnecessarily large
    return 60;
  }

  return 70; // Default
}

// ============================================================================
// RANKING AND SORTING
// ============================================================================

export interface RankedTorrent extends TorrentResult {
  quality: QualityInfo;
  score: number;
  cached: boolean;
  parsed: ParsedTorrentTitle;
}

/**
 * Rank and sort torrents by quality score
 */
export function rankTorrents(
  torrents: TorrentResult[],
  config: KrakenConfig,
  cachedHashes: Set<string> = new Set()
): RankedTorrent[] {
  const ranked: RankedTorrent[] = torrents.map(torrent => {
    const quality = extractQualityInfo(torrent);
    const cached = cachedHashes.has(torrent.infoHash.toLowerCase());
    const score = calculateScore(torrent, quality, config, cached);
    const parsed = parseTitle(torrent.title);

    return {
      ...torrent,
      quality,
      score,
      cached,
      parsed,
    };
  });

  // Filter by config
  const filtered = ranked.filter(t => {
    // Exclude unwanted qualities
    if (config.excludeQualities.includes(t.quality.source)) return false;
    
    // Exclude unwanted codecs
    if (t.quality.codec && config.excludeCodecs.includes(t.quality.codec)) return false;

    // Max size filter
    if (config.maxSize && t.size && t.size > config.maxSize) return false;

    // Resolution filters
    const resOrder: Resolution[] = ['4K', '2160p', '1080p', '720p', '480p', 'SD', 'Unknown'];
    const maxResIdx = resOrder.indexOf(config.maxResolution);
    const torrentResIdx = resOrder.indexOf(t.quality.resolution);
    if (maxResIdx !== -1 && torrentResIdx < maxResIdx) return false; // Better than max

    if (config.minResolution) {
      const minResIdx = resOrder.indexOf(config.minResolution);
      if (minResIdx !== -1 && torrentResIdx > minResIdx) return false; // Worse than min
    }

    return true;
  });

  // Sort by score (descending)
  filtered.sort((a, b) => {
    // Always push truly unknown quality to the bottom
    if (a.quality.resolution === 'Unknown' && b.quality.resolution !== 'Unknown') return 1;
    if (a.quality.resolution !== 'Unknown' && b.quality.resolution === 'Unknown') return -1;

    // Cached torrents first if preferred
    if (config.preferCached) {
      if (a.cached && !b.cached) return -1;
      if (!a.cached && b.cached) return 1;
    }

    // Then by score
    return b.score - a.score;
  });

  // Limit results per quality tier
  if (config.maxResultsPerQuality > 0) {
    const byQuality = new Map<Resolution, RankedTorrent[]>();
    
    for (const torrent of filtered) {
      const res = torrent.quality.resolution;
      const existing = byQuality.get(res) || [];
      if (existing.length < config.maxResultsPerQuality) {
        existing.push(torrent);
        byQuality.set(res, existing);
      }
    }

    // Flatten back, preserving resolution order
    const resOrder: Resolution[] = ['4K', '2160p', '1080p', '720p', '480p', 'SD', 'Unknown'];
    const limited: RankedTorrent[] = [];
    
    for (const res of resOrder) {
      const torrents = byQuality.get(res) || [];
      limited.push(...torrents);
    }

    return limited.slice(0, config.maxResults);
  }

  return filtered.slice(0, config.maxResults);
}

/**
 * Generate human-readable stream title
 */
export function formatStreamTitle(torrent: RankedTorrent): string {
  const parts: string[] = [];

  // Resolution
  parts.push(`📺 ${torrent.quality.resolution}`);

  // Source
  if (torrent.quality.source !== 'Unknown') {
    parts.push(torrent.quality.source);
  }

  // Codec
  if (torrent.quality.codec) {
    parts.push(torrent.quality.codec);
  }

  // Audio
  if (torrent.quality.audio) {
    parts.push(`🔊 ${torrent.quality.audio}`);
  }

  // HDR
  if (torrent.quality.hdr && torrent.quality.hdr !== 'SDR') {
    parts.push(`✨ ${torrent.quality.hdr}`);
  }

  // Size
  if (torrent.size) {
    const gb = torrent.size / (1024 * 1024 * 1024);
    parts.push(`💾 ${gb.toFixed(2)} GB`);
  }

  // Seeders
  if (torrent.seeders !== undefined) {
    parts.push(`👥 ${torrent.seeders}`);
  }

  // Provider
  parts.push(`🔗 ${torrent.provider}`);

  // Cached indicator
  if (torrent.cached) {
    parts.push('⚡ CACHED');
  }

  return parts.join(' | ');
}

/**
 * Generate stream name (short version)
 */
export function formatStreamName(torrent: RankedTorrent, debridProvider?: string): string {
  // Explicit quality mapping (prevents excessive "Unknown")
  // Priority: CAM/TS/HDCAM -> 4K -> 1080p -> 720p -> fallback
  const title = torrent.title;

  const debridTag = debridProvider
    ? torrent.cached
      ? `[${debridProvider.toUpperCase()}+]`
      : `[${debridProvider.toUpperCase()}]`
    : '';

  const isCam =
    /\b(hd\s*-?\s*cam|cam\s*-?\s*rip|telesync|hdts|ts|cam)\b/i.test(title) ||
    torrent.quality.source === 'CAM' ||
    torrent.quality.source === 'TS';
  if (isCam) {
    return `${debridTag ? `${debridTag} ` : ''}[CAM] Kraken`.trim();
  }

  const is4k =
    /\b(2160p|2160|4k|uhd)\b/i.test(title) ||
    torrent.quality.resolution === '4K' ||
    torrent.quality.resolution === '2160p';
  if (is4k) {
    return `${debridTag ? `${debridTag} ` : ''}[4K] Kraken`.trim();
  }

  if (/\b1080p\b/i.test(title) || torrent.quality.resolution === '1080p') {
    return `${debridTag ? `${debridTag} ` : ''}[1080p] Kraken`.trim();
  }

  if (/\b720p\b/i.test(title) || torrent.quality.resolution === '720p') {
    return `${debridTag ? `${debridTag} ` : ''}[720p] Kraken`.trim();
  }

  if (torrent.quality.resolution !== 'Unknown') {
    return `${debridTag ? `${debridTag} ` : ''}[${torrent.quality.resolution}] Kraken`.trim();
  }

  return `${debridTag ? `${debridTag} ` : ''}[Unknown] Kraken`.trim();
}
