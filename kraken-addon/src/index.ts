/**
 * Kraken Add-on for Stremio
 *
 * The ultimate torrent aggregator with 50+ sources,
 * multi-debrid support, and intelligent ranking.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import path from 'path';
import { config as loadEnv } from 'dotenv';

import { StremioManifest, ContentType, StreamResponse, DebridProvider, KrakenConfig } from './types';
import { parseConfigFromPath, hashConfig } from './config/parser';
import { handleStreamRequest, healthCheck } from './handlers/stream';
import { createDebridService } from './debrid/services';
import { logger } from './utils/logger';
import { createNamedQueue } from './utils/namedQueue';
import { PROVIDER_COUNT, ALL_PROVIDERS } from './providers/registry';

// Load environment variables
loadEnv();

const app = express();
const requestQueue = createNamedQueue(200);
const PORT = process.env['PORT'] || 7000;
const HOST = process.env['HOST'] || '0.0.0.0';
const BASE_URL = process.env['BASE_URL'] || `http://localhost:${PORT}`;

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(compression());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('Request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: Date.now() - start,
    });
  });
  next();
});

app.use('/public', express.static(path.join(__dirname, '../public')));

// ============================================================================
// MANIFEST
// ============================================================================

function generateManifest(configPath?: string): StremioManifest {
  return {
    id: 'com.kraken.addon',
    version: '1.0.0',
    name: '🦑 Kraken',
    description: `The Ultimate Torrent Aggregator - ${PROVIDER_COUNT}+ sources, multi-debrid support, intelligent ranking`,
    logo: 'https://raw.githubusercontent.com/itsbryanman/Kraken-addon/main/kraken-addon/public/icon.png',
    website: 'https://github.com/itsbryanman/Kraken-addon',
    resources: [
      {
        name: 'stream',
        types: ['movie', 'series'],
        idPrefixes: ['tt', 'kitsu:'],
      },
    ],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'kitsu:'],
    catalogs: [],
    behaviorHints: {
      configurable: true,
      configurationRequired: false,
    },
  };
}

// ============================================================================
// ROUTES
// ============================================================================

app.get('/', (_req: Request, res: Response) => {
  res.redirect('/configure');
});

app.get('/health', async (_req: Request, res: Response) => {
  try {
    const health = await healthCheck();
    res.json(health);
  } catch (error) {
    res.status(500).json({ status: 'error', error: String(error) });
  }
});

app.get('/configure', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../docs/configure.html'));
});

app.get('/error', (req: Request, res: Response) => {
  const message = typeof req.query['message'] === 'string'
    ? req.query['message']
    : 'Playback failed. Please try again.';

  res.status(500).type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kraken Error</title>
  <style>
    body { font-family: sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
    main { max-width: 720px; margin: 0 auto; padding: 48px 24px; }
    h1 { margin: 0 0 16px; color: #67e8f9; }
    p { line-height: 1.6; color: #cbd5e1; }
    a { color: #67e8f9; }
    code { background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <main>
    <h1>Kraken Playback Error</h1>
    <p>${escapeHtml(message)}</p>
    <p>Return to Stremio and try another stream, or review your addon configuration at <a href="${BASE_URL}/configure">${BASE_URL}/configure</a>.</p>
  </main>
</body>
</html>`);
});

app.get('/manifest.json', (_req: Request, res: Response) => {
  res.json(generateManifest());
});

app.get('/:config/manifest.json', (req: Request, res: Response) => {
  res.json(generateManifest(req.params['config']));
});

app.get('/stream/:type/:id.json', async (req: Request, res: Response) => {
  await serveStreamResponse(req, res, 'default');
});

app.get('/:config/stream/:type/:id.json', async (req: Request, res: Response) => {
  await serveStreamResponse(req, res, req.params['config'] || 'default');
});

app.get(
  '/:config/resolve/:provider/:infoHash/:cachedFileIdx/:fileIdx/:filename?',
  async (req: Request, res: Response) => {
    try {
      const configPath = req.params['config'] || 'default';
      const provider = req.params['provider'] as DebridProvider;
      const infoHash = req.params['infoHash'] || '';
      const fileIdx = parseOptionalInt(req.params['fileIdx']);
      const config = parseConfigFromPath(configPath);
      const apiKey = getDebridApiKey(config, provider);

      if (!apiKey) {
        res.status(400).send('Missing debrid API key');
        return;
      }

      const service = createDebridService(provider, apiKey);
      const resolved = await service.resolve(infoHash, fileIdx);
      res.redirect(302, resolved.url);
    } catch (error) {
      logger.error('Resolve failed', { error });
      res.redirect(302, `${BASE_URL}/error?message=${encodeURIComponent(`Failed to resolve stream: ${formatError(error)}`)}`);
    }
  }
);

app.get('/api/providers', (_req: Request, res: Response) => {
  res.json({
    total: PROVIDER_COUNT,
    providers: ALL_PROVIDERS.map(provider => ({
      id: provider.id,
      name: provider.name,
      categories: provider.categories,
      languages: provider.languages,
      enabled: provider.enabled,
    })),
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// ============================================================================
// SERVER
// ============================================================================

app.listen(Number(PORT), HOST, () => {
  logger.info('🦑 Kraken addon started', {
    url: BASE_URL,
    providers: PROVIDER_COUNT,
  });
  console.log(`
  ╔═══════════════════════════════════════════════════════════════╗
  ║                                                               ║
  ║   🦑 KRAKEN - The Ultimate Stremio Torrent Aggregator        ║
  ║                                                               ║
  ║   Server:    ${BASE_URL.padEnd(45)}║
  ║   Providers: ${String(PROVIDER_COUNT).padEnd(45)}║
  ║   Configure: ${(BASE_URL + '/configure').padEnd(45)}║
  ║                                                               ║
  ║   Install:   stremio://${BASE_URL.replace(/^https?:\/\//, '')}/manifest.json${' '.repeat(Math.max(0, 28 - BASE_URL.replace(/^https?:\/\//, '').length))}║
  ║                                                               ║
  ╚═══════════════════════════════════════════════════════════════╝
  `);
});

export default app;

async function serveStreamResponse(req: Request, res: Response, configPath: string): Promise<void> {
  try {
    const type = req.params['type'] as ContentType;
    const id = req.params['id']?.replace('.json', '') || '';
    const configHash = hashConfig(parseConfigFromPath(configPath));
    const response = await requestQueue.wrap(
      `${type}:${id}:${configHash}`,
      () => handleStreamRequest(type, id, configPath)
    );

    res.set('Cache-Control', buildCacheControl(response));
    res.json({ streams: Array.isArray(response.streams) ? response.streams : [] });
  } catch (error) {
    logger.error('Stream error', { error });
    res.status(500).json({
      streams: [],
      cacheMaxAge: 0,
      staleRevalidate: 0,
      staleError: 0,
    });
  }
}

function buildCacheControl(response: StreamResponse): string {
  const maxAge = response.cacheMaxAge ?? 3600;
  const staleRevalidate = response.staleRevalidate ?? 14400;
  const staleError = response.staleError ?? 604800;

  if (maxAge <= 0) {
    return 'no-store';
  }

  return `public, max-age=${maxAge}, stale-while-revalidate=${staleRevalidate}, stale-if-error=${staleError}`;
}

function getDebridApiKey(config: KrakenConfig, provider: DebridProvider): string | undefined {
  if (config.debridService === provider) {
    return config.debridApiKey;
  }

  return config.multiDebrid?.[provider];
}

function parseOptionalInt(value?: string): number | undefined {
  if (!value || value === 'null') {
    return undefined;
  }

  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
