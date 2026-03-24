/**
 * Kraken Provider Registry
 * 50+ torrent indexer definitions - more sources than any other Stremio addon
 */

export interface ProviderDefinition {
  id: string;
  name: string;
  url: string;
  categories: ('movies' | 'tv' | 'anime' | 'xxx' | 'music' | 'software' | 'other')[];
  languages: string[];
  enabled: boolean;
  rateLimit: number; // requests per minute
  searchPath?: string;
  apiType: 'html' | 'json' | 'rss' | 'api';
  requiresAuth?: boolean;
  notes?: string;
}

// ============================================================================
// TIER 1: PRIMARY SOURCES (High reliability, good coverage)
// ============================================================================

export const TIER1_PROVIDERS: ProviderDefinition[] = [
  {
    id: 'yts',
    name: 'YTS',
    url: 'https://yts.mx',
    categories: ['movies'],
    languages: ['en'],
    enabled: true,
    rateLimit: 30,
    apiType: 'api',
    notes: 'Best for movies, optimized file sizes'
  },
  {
    id: 'eztv',
    name: 'EZTV',
    url: 'https://eztvx.to',
    categories: ['tv'],
    languages: ['en'],
    enabled: true,
    rateLimit: 30,
    apiType: 'api',
    notes: 'Primary TV show source'
  },
  {
    id: '1337x',
    name: '1337x',
    url: 'https://1337x.to',
    categories: ['movies', 'tv', 'anime', 'music', 'software'],
    languages: ['en'],
    enabled: true,
    rateLimit: 20,
    apiType: 'html',
    notes: 'General purpose, high quality uploads'
  },
  {
    id: 'rarbg',
    name: 'RARBG (Archive)',
    url: 'https://rarbg.to',
    categories: ['movies', 'tv'],
    languages: ['en'],
    enabled: true,
    rateLimit: 60,
    apiType: 'api',
    notes: 'Legacy database via DMM hash lists'
  },
  {
    id: 'tpb',
    name: 'The Pirate Bay',
    url: 'https://thepiratebay.org',
    categories: ['movies', 'tv', 'anime', 'music', 'software', 'other'],
    languages: ['en'],
    enabled: true,
    rateLimit: 15,
    apiType: 'api',
    notes: 'Largest general tracker'
  },
  {
    id: 'torrentgalaxy',
    name: 'TorrentGalaxy',
    url: 'https://torrentgalaxy.to',
    categories: ['movies', 'tv', 'anime'],
    languages: ['en'],
    enabled: true,
    rateLimit: 20,
    apiType: 'html',
    notes: 'Good quality scene releases'
  },
  {
    id: 'kickass',
    name: 'KickassTorrents',
    url: 'https://kickasstorrents.to',
    categories: ['movies', 'tv', 'anime', 'music'],
    languages: ['en'],
    enabled: true,
    rateLimit: 15,
    apiType: 'html',
    notes: 'KAT revival, good coverage'
  },
  {
    id: 'magnetdl',
    name: 'MagnetDL',
    url: 'https://www.magnetdl.com',
    categories: ['movies', 'tv', 'software'],
    languages: ['en'],
    enabled: true,
    rateLimit: 20,
    apiType: 'html',
    notes: 'Fast, direct magnet links'
  },
  {
    id: 'limetorrents',
    name: 'LimeTorrents',
    url: 'https://www.limetorrents.lol',
    categories: ['movies', 'tv', 'anime', 'music'],
    languages: ['en'],
    enabled: true,
    rateLimit: 20,
    apiType: 'html',
    notes: 'Verified torrents'
  },
];

// ============================================================================
// TIER 2: ANIME SOURCES
// ============================================================================

export const ANIME_PROVIDERS: ProviderDefinition[] = [
  {
    id: 'nyaasi',
    name: 'Nyaa.si',
    url: 'https://nyaa.si',
    categories: ['anime'],
    languages: ['en', 'ja'],
    enabled: true,
    rateLimit: 30,
    apiType: 'rss',
    notes: 'Primary anime source'
  },
  {
    id: 'nyaapantsu',
    name: 'Nyaa Pantsu',
    url: 'https://nyaa.net',
    categories: ['anime'],
    languages: ['en', 'ja'],
    enabled: true,
    rateLimit: 30,
    apiType: 'api',
    notes: 'Nyaa alternative'
  },
  {
    id: 'tokyotosho',
    name: 'TokyoTosho',
    url: 'https://www.tokyotosho.info',
    categories: ['anime'],
    languages: ['en', 'ja'],
    enabled: true,
    rateLimit: 20,
    apiType: 'rss',
    notes: 'Anime aggregator'
  },
  {
    id: 'anidex',
    name: 'AniDex',
    url: 'https://anidex.info',
    categories: ['anime'],
    languages: ['en', 'ja'],
    enabled: true,
    rateLimit: 30,
    apiType: 'api',
    notes: 'Anime tracker with multi-language'
  },
  {
    id: 'subsplease',
    name: 'SubsPlease',
    url: 'https://subsplease.org',
    categories: ['anime'],
    languages: ['en', 'ja'],
    enabled: true,
    rateLimit: 60,
    apiType: 'rss',
    notes: 'Fast anime releases'
  },
  {
    id: 'animebytes',
    name: 'AnimeTosho',
    url: 'https://animetosho.org',
    categories: ['anime'],
    languages: ['en', 'ja'],
    enabled: true,
    rateLimit: 30,
    apiType: 'api',
    notes: 'Anime metadata aggregator'
  },
  {
    id: 'acgnx',
    name: 'ACGNX',
    url: 'https://share.acgnx.se',
    categories: ['anime'],
    languages: ['zh', 'ja'],
    enabled: false,
    rateLimit: 20,
    apiType: 'rss',
    notes: 'Chinese/Japanese anime'
  },
  {
    id: 'bangumi',
    name: 'Bangumi Moe',
    url: 'https://bangumi.moe',
    categories: ['anime'],
    languages: ['zh', 'ja'],
    enabled: false,
    rateLimit: 20,
    apiType: 'api',
    notes: 'Chinese anime tracker'
  },
];

// ============================================================================
// TIER 3: RUSSIAN SOURCES
// ============================================================================

export const RUSSIAN_PROVIDERS: ProviderDefinition[] = [
  {
    id: 'rutor',
    name: 'Rutor',
    url: 'https://rutor.info',
    categories: ['movies', 'tv', 'anime'],
    languages: ['ru'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'Top Russian tracker'
  },
  {
    id: 'rutracker',
    name: 'RuTracker',
    url: 'https://rutracker.org',
    categories: ['movies', 'tv', 'anime', 'music'],
    languages: ['ru'],
    enabled: false,
    rateLimit: 10,
    apiType: 'html',
    requiresAuth: true,
    notes: 'Largest Russian tracker, requires auth'
  },
  {
    id: 'nnmclub',
    name: 'NNM-Club',
    url: 'https://nnmclub.to',
    categories: ['movies', 'tv'],
    languages: ['ru'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'Russian community tracker'
  },
  {
    id: 'kinozal',
    name: 'Kinozal',
    url: 'https://kinozal.tv',
    categories: ['movies', 'tv'],
    languages: ['ru'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    requiresAuth: true,
    notes: 'Russian HD tracker'
  },
];

// ============================================================================
// TIER 4: PORTUGUESE/BRAZILIAN SOURCES
// ============================================================================

export const PORTUGUESE_PROVIDERS: ProviderDefinition[] = [
  {
    id: 'comando',
    name: 'Comando Torrents',
    url: 'https://comandotorrents.to',
    categories: ['movies', 'tv'],
    languages: ['pt'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'Brazilian Portuguese content'
  },
  {
    id: 'bludv',
    name: 'BluDV',
    url: 'https://bludv.xyz',
    categories: ['movies', 'tv'],
    languages: ['pt'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'Brazilian HD content'
  },
  {
    id: 'micoleao',
    name: 'MicoLeão Dublado',
    url: 'https://micoleaodublado.com',
    categories: ['movies', 'tv'],
    languages: ['pt'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'Dubbed Portuguese content'
  },
  {
    id: 'lapumia',
    name: 'Lapumia',
    url: 'https://lapumia.org',
    categories: ['movies', 'tv'],
    languages: ['pt'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'Portuguese tracker'
  },
];

// ============================================================================
// TIER 5: SPANISH SOURCES
// ============================================================================

export const SPANISH_PROVIDERS: ProviderDefinition[] = [
  {
    id: 'mejortorrent',
    name: 'MejorTorrent',
    url: 'https://mejortorrent.wtf',
    categories: ['movies', 'tv'],
    languages: ['es'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'Spanish content hub'
  },
  {
    id: 'wolfmax4k',
    name: 'Wolfmax4K',
    url: 'https://wolfmax4k.com',
    categories: ['movies', 'tv'],
    languages: ['es'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'Spanish 4K content'
  },
  {
    id: 'cinecalidad',
    name: 'CineCalidad',
    url: 'https://cinecalidad.ms',
    categories: ['movies'],
    languages: ['es'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'High quality Spanish movies'
  },
  {
    id: 'dontorrent',
    name: 'DonTorrent',
    url: 'https://dontorrent.earth',
    categories: ['movies', 'tv'],
    languages: ['es'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'Popular Spanish tracker'
  },
  {
    id: 'elitetorrent',
    name: 'EliteTorrent',
    url: 'https://elitetorrent.do',
    categories: ['movies', 'tv'],
    languages: ['es'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'Spanish elite content'
  },
  {
    id: 'divxtotal',
    name: 'DivxTotal',
    url: 'https://divxtotal.dev',
    categories: ['movies', 'tv'],
    languages: ['es'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'Long-running Spanish tracker'
  },
];

// ============================================================================
// TIER 6: FRENCH SOURCES
// ============================================================================

export const FRENCH_PROVIDERS: ProviderDefinition[] = [
  {
    id: 'torrent9',
    name: 'Torrent9',
    url: 'https://www.torrent9.fm',
    categories: ['movies', 'tv'],
    languages: ['fr'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'Top French tracker'
  },
  {
    id: 'oxtorrent',
    name: 'OxTorrent',
    url: 'https://oxtorrent.nz',
    categories: ['movies', 'tv'],
    languages: ['fr'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'French torrent aggregator'
  },
  {
    id: 'cpasbien',
    name: 'Cpasbien',
    url: 'https://www.cpasbien.tw',
    categories: ['movies', 'tv'],
    languages: ['fr'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'Classic French tracker'
  },
  {
    id: 'yggtorrent',
    name: 'YggTorrent',
    url: 'https://www.yggtorrent.qa',
    categories: ['movies', 'tv', 'anime'],
    languages: ['fr'],
    enabled: false,
    rateLimit: 10,
    apiType: 'html',
    requiresAuth: true,
    notes: 'Premium French tracker'
  },
  {
    id: 'sharewood',
    name: 'Sharewood',
    url: 'https://www.sharewood.tv',
    categories: ['movies', 'tv'],
    languages: ['fr'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'French community tracker'
  },
];

// ============================================================================
// TIER 7: ITALIAN SOURCES
// ============================================================================

export const ITALIAN_PROVIDERS: ProviderDefinition[] = [
  {
    id: 'ilcorsaronero',
    name: 'ilCorSaRoNeRo',
    url: 'https://ilcorsaronero.link',
    categories: ['movies', 'tv'],
    languages: ['it'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'Top Italian tracker'
  },
  {
    id: 'tntvillage',
    name: 'TNT Village (Archive)',
    url: 'https://tntvillage.scambioetico.org',
    categories: ['movies', 'tv'],
    languages: ['it'],
    enabled: false,
    rateLimit: 30,
    apiType: 'html',
    notes: 'Historic Italian archive'
  },
  {
    id: 'eurostreaming',
    name: 'EuroStreaming',
    url: 'https://eurostreaming.cafe',
    categories: ['movies', 'tv'],
    languages: ['it'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'Italian streaming torrents'
  },
];

// ============================================================================
// TIER 8: GERMAN SOURCES
// ============================================================================

export const GERMAN_PROVIDERS: ProviderDefinition[] = [
  {
    id: 'hd-area',
    name: 'HD-Area',
    url: 'https://hd-area.org',
    categories: ['movies', 'tv'],
    languages: ['de'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'German HD content'
  },
  {
    id: 'filmpalast',
    name: 'FilmPalast',
    url: 'https://filmpalast.to',
    categories: ['movies', 'tv'],
    languages: ['de'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'German movie tracker'
  },
];

// ============================================================================
// TIER 9: INDIAN/SOUTH ASIAN SOURCES
// ============================================================================

export const INDIAN_PROVIDERS: ProviderDefinition[] = [
  {
    id: 'tamilblasters',
    name: 'TamilBlasters',
    url: 'https://tamilblasters.bond',
    categories: ['movies', 'tv'],
    languages: ['ta', 'te', 'hi', 'ml'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'South Indian content'
  },
  {
    id: 'tamilmv',
    name: 'TamilMV',
    url: 'https://www.1tamilmv.tf',
    categories: ['movies', 'tv'],
    languages: ['ta', 'te', 'hi'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'Tamil/Telugu content'
  },
  {
    id: 'movierulz',
    name: 'MovieRulz',
    url: 'https://movierulz.link',
    categories: ['movies'],
    languages: ['hi', 'ta', 'te'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'Indian movie tracker'
  },
  {
    id: 'bolly4u',
    name: 'Bolly4u',
    url: 'https://bolly4u.surf',
    categories: ['movies', 'tv'],
    languages: ['hi'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'Bollywood content'
  },
];

// ============================================================================
// TIER 10: KOREAN SOURCES
// ============================================================================

export const KOREAN_PROVIDERS: ProviderDefinition[] = [
  {
    id: 'torrentqq',
    name: 'TorrentQQ',
    url: 'https://torrentqq.com',
    categories: ['movies', 'tv'],
    languages: ['ko'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'Korean content'
  },
  {
    id: 'torrenthaja',
    name: 'TorrentHaja',
    url: 'https://torrenthaja.com',
    categories: ['movies', 'tv'],
    languages: ['ko'],
    enabled: false,
    rateLimit: 15,
    apiType: 'html',
    notes: 'K-drama source'
  },
];

// ============================================================================
// TIER 11: SPECIALTY SOURCES
// ============================================================================

export const SPECIALTY_PROVIDERS: ProviderDefinition[] = [
  {
    id: 'btdig',
    name: 'BTDigg',
    url: 'https://btdig.com',
    categories: ['movies', 'tv', 'other'],
    languages: ['en'],
    enabled: true,
    rateLimit: 10,
    apiType: 'html',
    notes: 'DHT search engine'
  },
  {
    id: 'solidtorrents',
    name: 'Solid Torrents',
    url: 'https://solidtorrents.to',
    categories: ['movies', 'tv', 'anime'],
    languages: ['en'],
    enabled: true,
    rateLimit: 20,
    apiType: 'api',
    notes: 'Torrent aggregator/search'
  },
  {
    id: 'bitsearch',
    name: 'BitSearch',
    url: 'https://bitsearch.to',
    categories: ['movies', 'tv', 'anime', 'other'],
    languages: ['en'],
    enabled: true,
    rateLimit: 20,
    apiType: 'api',
    notes: 'Meta search engine'
  },
  {
    id: 'glodls',
    name: 'GLODLS',
    url: 'https://glodls.to',
    categories: ['movies', 'tv', 'anime'],
    languages: ['en'],
    enabled: true,
    rateLimit: 15,
    apiType: 'html',
    notes: 'General torrent site'
  },
  {
    id: 'zooqle',
    name: 'Zooqle',
    url: 'https://zooqle.skin',
    categories: ['movies', 'tv'],
    languages: ['en'],
    enabled: true,
    rateLimit: 15,
    apiType: 'html',
    notes: 'Verified torrents with metadata'
  },
];

// ============================================================================
// EXTERNAL INTEGRATIONS
// ============================================================================

export const INTEGRATION_PROVIDERS: ProviderDefinition[] = [
  {
    id: 'prowlarr',
    name: 'Prowlarr',
    url: 'configurable',
    categories: ['movies', 'tv', 'anime', 'music', 'other'],
    languages: ['en'],
    enabled: false,
    rateLimit: 100,
    apiType: 'api',
    requiresAuth: true,
    notes: 'Self-hosted indexer manager - supports 100+ indexers'
  },
  {
    id: 'jackett',
    name: 'Jackett',
    url: 'configurable',
    categories: ['movies', 'tv', 'anime', 'music', 'other'],
    languages: ['en'],
    enabled: false,
    rateLimit: 100,
    apiType: 'api',
    requiresAuth: true,
    notes: 'Legacy indexer proxy - supports 500+ trackers'
  },
  {
    id: 'torrentio',
    name: 'Torrentio (Upstream)',
    url: 'https://torrentio.strem.fun',
    categories: ['movies', 'tv', 'anime'],
    languages: ['en'],
    enabled: true,  // Reliable fallback source
    rateLimit: 30,
    apiType: 'api',
    notes: 'Use Torrentio as additional source'
  },
  {
    id: 'dmm',
    name: 'DebridMediaManager Lists',
    url: 'https://raw.githubusercontent.com/debridmediamanager',
    categories: ['movies', 'tv'],
    languages: ['en'],
    enabled: true,
    rateLimit: 60,
    apiType: 'api',
    notes: 'Pre-verified hash lists'
  },
  {
    id: 'zilean',
    name: 'Zilean',
    url: 'configurable',
    categories: ['movies', 'tv'],
    languages: ['en'],
    enabled: false,
    rateLimit: 100,
    apiType: 'api',
    notes: 'DMM scraper API'
  },
];

// ============================================================================
// AGGREGATED EXPORTS
// ============================================================================

export const ALL_PROVIDERS: ProviderDefinition[] = [
  ...TIER1_PROVIDERS,
  ...ANIME_PROVIDERS,
  ...RUSSIAN_PROVIDERS,
  ...PORTUGUESE_PROVIDERS,
  ...SPANISH_PROVIDERS,
  ...FRENCH_PROVIDERS,
  ...ITALIAN_PROVIDERS,
  ...GERMAN_PROVIDERS,
  ...INDIAN_PROVIDERS,
  ...KOREAN_PROVIDERS,
  ...SPECIALTY_PROVIDERS,
  ...INTEGRATION_PROVIDERS,
];

export const PROVIDER_COUNT = ALL_PROVIDERS.length;
export const DEFAULT_ENABLED = ALL_PROVIDERS.filter(p => p.enabled).map(p => p.id);

// Provider lookup map
export const PROVIDER_MAP = new Map<string, ProviderDefinition>(
  ALL_PROVIDERS.map(p => [p.id, p])
);

// Get providers by language
export function getProvidersByLanguage(lang: string): ProviderDefinition[] {
  return ALL_PROVIDERS.filter(p => p.languages.includes(lang));
}

// Get providers by category
export function getProvidersByCategory(
  category: 'movies' | 'tv' | 'anime'
): ProviderDefinition[] {
  return ALL_PROVIDERS.filter(p => p.categories.includes(category));
}

console.log(`Kraken: Loaded ${PROVIDER_COUNT} provider definitions`);
