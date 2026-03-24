import { TorrentResult, SearchQuery } from '../types';
import { extractCleanTitle, parseTitle } from '../ranking/scorer';
import { ContentMetadata } from './metadata';

const MB = 1024 * 1024;
const GB = 1024 * 1024 * 1024;

export function validateResults(
  results: TorrentResult[],
  query: SearchQuery,
  metadata: ContentMetadata
): TorrentResult[] {
  return results.filter(result => validateSingleResult(result, query, metadata));
}

export function validateSingleResult(
  result: TorrentResult,
  query: SearchQuery,
  metadata: ContentMetadata
): boolean {
  if (query.imdbId && result.imdbId) {
    const resultImdb = normalizeImdbId(result.imdbId);
    const queryImdb = normalizeImdbId(query.imdbId);
    if (resultImdb && queryImdb && resultImdb !== queryImdb) {
      return false;
    }
  }

  if (!titleMatchesMetadata(result.title, metadata.title)) {
    return false;
  }

  const parsed = parseTitle(result.title);

  if (
    query.type === 'movie' &&
    metadata.year > 0 &&
    parsed.year !== undefined &&
    Math.abs(metadata.year - parsed.year) > 1
  ) {
    return false;
  }

  if (query.type === 'series' && query.season !== undefined) {
    if (parsed.season !== undefined && parsed.season !== query.season) {
      return false;
    }
    if (
      query.episode !== undefined &&
      parsed.episode !== undefined &&
      parsed.episode !== query.episode
    ) {
      return false;
    }
  }

  if (result.size && result.size > 0) {
    if (result.size > 200 * GB) {
      return false;
    }

    if (query.type === 'movie' && result.size < 50 * MB) {
      return false;
    }

    if (query.type === 'series' && result.size < 20 * MB) {
      return false;
    }
  }

  return true;
}

function titleMatchesMetadata(torrentTitle: string, metadataTitle: string): boolean {
  const cleanTorrentTitle = normalizeTitle(extractCleanTitle(torrentTitle));
  const cleanMetadataTitle = normalizeTitle(metadataTitle);

  if (!cleanTorrentTitle || !cleanMetadataTitle) {
    return false;
  }

  const torrentTokens = tokenize(cleanTorrentTitle);
  const metadataTokens = tokenize(cleanMetadataTitle);

  if (metadataTokens.length === 0) {
    return cleanTorrentTitle === cleanMetadataTitle;
  }

  if (metadataTokens.length === 1) {
    return torrentTokens.includes(metadataTokens[0]!);
  }

  const torrentWords = new Set(torrentTokens);
  const matches = metadataTokens.filter(word => torrentWords.has(word)).length;
  const matchRatio = matches / metadataTokens.length;

  return matchRatio >= 0.5;
}

function normalizeTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[-_:./\\+&]/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokenize(title: string): string[] {
  return title
    .split(' ')
    .map(word => word.trim())
    .filter(word => word.length >= 3);
}

function normalizeImdbId(imdbId: string): string {
  const digits = imdbId.replace(/^tt/i, '').replace(/\D/g, '');
  if (!digits) {
    return '';
  }

  return `tt${digits.padStart(7, '0')}`;
}
