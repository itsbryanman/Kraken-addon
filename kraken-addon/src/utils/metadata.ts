/**
 * Kraken Metadata Service
 * 
 * Resolves IMDB IDs to titles and other metadata
 * Used when providers don't support IMDB search directly
 */

import axios from 'axios';
import { cache } from '../cache/manager';
import { logger } from './logger';

export interface ContentMetadata {
  imdbId: string;
  title: string;
  year: number;
  type: 'movie' | 'series';
  genres?: string[];
  runtime?: number;
  poster?: string;
}

export interface EpisodeMetadata extends ContentMetadata {
  season: number;
  episode: number;
  episodeTitle: string;
}

// ============================================================================
// CINEMETA (Stremio's metadata addon)
// ============================================================================

const CINEMETA_BASE = 'https://v3-cinemeta.strem.io';
const KITSU_BASE = 'https://kitsu.io/api/edge';

export async function resolveFromCinemeta(
  imdbId: string,
  type: 'movie' | 'series' = 'movie'
): Promise<ContentMetadata | null> {
  const cacheKey = `meta:cinemeta:${imdbId}`;
  
  const cached = await cache.get<ContentMetadata>(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(
      `${CINEMETA_BASE}/meta/${type}/${imdbId}.json`,
      { timeout: 10000 }
    );

    const meta = response.data?.meta;
    if (!meta) return null;

    const parsedYear = parseInt(meta.year) || parseInt(meta.releaseInfo) || 0;

    const result: ContentMetadata = {
      imdbId,
      title: meta.name,
      year: parsedYear,
      type: meta.type,
      genres: meta.genres,
      runtime: meta.runtime ? parseInt(meta.runtime) : undefined,
      poster: meta.poster,
    };

    await cache.set(cacheKey, result, 86400); // 24 hour cache
    return result;
  } catch (error) {
    logger.warn('Cinemeta lookup failed', { imdbId, error });
    return null;
  }
}

export async function resolveEpisode(
  imdbId: string,
  season: number,
  episode: number
): Promise<EpisodeMetadata | null> {
  const cacheKey = `meta:episode:${imdbId}:${season}:${episode}`;
  
  const cached = await cache.get<EpisodeMetadata>(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(
      `${CINEMETA_BASE}/meta/series/${imdbId}.json`,
      { timeout: 10000 }
    );

    const meta = response.data?.meta;
    if (!meta?.videos) return null;

    // Find the specific episode
    const videoId = `${imdbId}:${season}:${episode}`;
    const video = meta.videos.find((v: any) => v.id === videoId);

    const result: EpisodeMetadata = {
      imdbId,
      title: meta.name,
      year: parseInt(meta.year) || 0,
      type: 'series',
      genres: meta.genres,
      season,
      episode,
      episodeTitle: video?.title || `Episode ${episode}`,
    };

    await cache.set(cacheKey, result, 86400);
    return result;
  } catch (error) {
    logger.warn('Episode lookup failed', { imdbId, season, episode, error });
    return null;
  }
}

export async function resolveFromKitsu(kitsuId: string): Promise<ContentMetadata | null> {
  const cacheKey = `meta:kitsu:${kitsuId}`;

  const cached = await cache.get<ContentMetadata>(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(`${KITSU_BASE}/anime/${kitsuId}`, {
      timeout: 10000,
    });

    const attributes = response.data?.data?.attributes;
    if (!attributes) return null;

    const title =
      attributes.canonicalTitle ||
      attributes.titles?.en ||
      attributes.titles?.en_jp ||
      attributes.titles?.ja_jp;
    if (!title) return null;

    const startDate = attributes.startDate || attributes.createdAt;
    const parsedYear = startDate ? parseInt(String(startDate).slice(0, 4), 10) || 0 : 0;
    const type = attributes.subtype === 'movie' ? 'movie' : 'series';

    const result: ContentMetadata = {
      imdbId: `kitsu:${kitsuId}`,
      title,
      year: parsedYear,
      type,
      genres: Array.isArray(attributes.categories)
        ? attributes.categories.map((category: { title?: string }) => category.title).filter(Boolean)
        : undefined,
      poster:
        attributes.posterImage?.original ||
        attributes.posterImage?.large ||
        attributes.posterImage?.medium,
    };

    await cache.set(cacheKey, result, 86400);
    return result;
  } catch (error) {
    logger.warn('Kitsu lookup failed', { kitsuId, error });
    return null;
  }
}

// ============================================================================
// TMDB (The Movie Database)
// ============================================================================

const TMDB_BASE = 'https://api.themoviedb.org/3';

export async function resolveFromTMDB(
  imdbId: string,
  apiKey: string
): Promise<ContentMetadata | null> {
  const cacheKey = `meta:tmdb:${imdbId}`;
  
  const cached = await cache.get<ContentMetadata>(cacheKey);
  if (cached) return cached;

  try {
    // Find TMDB ID from IMDB ID
    const findResponse = await axios.get(
      `${TMDB_BASE}/find/${imdbId}`,
      {
        params: {
          api_key: apiKey,
          external_source: 'imdb_id',
        },
        timeout: 10000,
      }
    );

    const movieResults = findResponse.data?.movie_results || [];
    const tvResults = findResponse.data?.tv_results || [];

    if (movieResults.length > 0) {
      const movie = movieResults[0];
      const result: ContentMetadata = {
        imdbId,
        title: movie.title,
        year: movie.release_date ? parseInt(movie.release_date.split('-')[0]) : 0,
        type: 'movie',
        genres: [], // Would need additional call for genres
        poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : undefined,
      };
      await cache.set(cacheKey, result, 86400);
      return result;
    }

    if (tvResults.length > 0) {
      const show = tvResults[0];
      const result: ContentMetadata = {
        imdbId,
        title: show.name,
        year: show.first_air_date ? parseInt(show.first_air_date.split('-')[0]) : 0,
        type: 'series',
        genres: [],
        poster: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : undefined,
      };
      await cache.set(cacheKey, result, 86400);
      return result;
    }

    return null;
  } catch (error) {
    logger.warn('TMDB lookup failed', { imdbId, error });
    return null;
  }
}

// ============================================================================
// OMDB (Open Movie Database)
// ============================================================================

const OMDB_BASE = 'http://www.omdbapi.com';

export async function resolveFromOMDB(
  imdbId: string,
  apiKey: string
): Promise<ContentMetadata | null> {
  const cacheKey = `meta:omdb:${imdbId}`;
  
  const cached = await cache.get<ContentMetadata>(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(OMDB_BASE, {
      params: {
        i: imdbId,
        apikey: apiKey,
      },
      timeout: 10000,
    });

    const data = response.data;
    if (data.Response === 'False') return null;

    const result: ContentMetadata = {
      imdbId,
      title: data.Title,
      year: parseInt(data.Year) || 0,
      type: data.Type === 'series' ? 'series' : 'movie',
      genres: data.Genre?.split(', '),
      runtime: data.Runtime ? parseInt(data.Runtime) : undefined,
      poster: data.Poster !== 'N/A' ? data.Poster : undefined,
    };

    await cache.set(cacheKey, result, 86400);
    return result;
  } catch (error) {
    logger.warn('OMDB lookup failed', { imdbId, error });
    return null;
  }
}

// ============================================================================
// UNIFIED RESOLVER
// ============================================================================

export async function resolveMetadata(
  imdbId: string,
  type?: 'movie' | 'series',
  options?: {
    tmdbApiKey?: string;
    omdbApiKey?: string;
  }
): Promise<ContentMetadata | null> {
  // Try Cinemeta first (free, no API key needed)
  const cinemeta = await resolveFromCinemeta(imdbId, type);
  if (cinemeta) return cinemeta;

  // Try TMDB if API key provided
  if (options?.tmdbApiKey) {
    const tmdb = await resolveFromTMDB(imdbId, options.tmdbApiKey);
    if (tmdb) return tmdb;
  }

  // Try OMDB if API key provided
  if (options?.omdbApiKey) {
    const omdb = await resolveFromOMDB(imdbId, options.omdbApiKey);
    if (omdb) return omdb;
  }

  return null;
}

// ============================================================================
// SEARCH QUERY BUILDER
// ============================================================================

export function buildSearchQuery(
  metadata: ContentMetadata,
  season?: number,
  episode?: number
): string {
  let query = metadata.title;

  // Add year for movies to reduce false matches.
  if (metadata.type === 'movie' && metadata.year) {
    query += ` ${metadata.year}`;
  }

  // Add season/episode for series
  if (metadata.type === 'series' && season !== undefined) {
    query += ` S${String(season).padStart(2, '0')}`;
    if (episode !== undefined) {
      query += `E${String(episode).padStart(2, '0')}`;
    }
  } else if (metadata.type === 'series' && episode !== undefined) {
    query += ` ${String(episode).padStart(2, '0')}`;
  }

  return query;
}

/**
 * Clean title for search - remove special characters that might cause issues
 */
export function cleanTitleForSearch(title: string): string {
  return title
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\w\s'-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
