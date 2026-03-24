# 🦑 Kraken

![GitHub stars](https://img.shields.io/github/stars/itsbryanman/Kraken-addon?style=flat-square) ![GitHub last commit](https://img.shields.io/github/last-commit/itsbryanman/Kraken-addon?style=flat-square) ![GitHub license](https://img.shields.io/github/license/itsbryanman/Kraken-addon?style=flat-square) ![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square&logo=node.js) ![GitHub forks](https://img.shields.io/github/forks/itsbryanman/Kraken-addon?style=flat-square)
![Stremio](https://img.shields.io/badge/Stremio-addon-6B5CE7?style=flat-square) ![Providers](https://img.shields.io/badge/providers-50%2B-orange?style=flat-square) ![Debrid](https://img.shields.io/badge/debrid_services-8-red?style=flat-square) ![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript) ![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker) ![GitHub issues](https://img.shields.io/github/issues/itsbryanman/Kraken-addon?style=flat-square)

Hosted Stremio torrent addon that hits 50+ providers, scores the results, and hands the good stuff to your debrid service.

## Official URLs

- Configure: `https://kraken.backwoodsdevelopment.com/configure`
- Manifest: `https://kraken.backwoodsdevelopment.com/manifest.json`
- Health: `https://kraken.backwoodsdevelopment.com/health`

## Install

1. Open the [Kraken config page](https://kraken.backwoodsdevelopment.com/configure).
2. Pick your debrid, providers, and quality filters.
3. Click install. That's it.

## What It Does

- Searches 50+ torrent providers in parallel.
- Supports 8 debrid services: RD, AD, PM, DL, TB, OC, ED, and Put.io.
- Ranks streams with a real scoring model instead of blindly sorting by seeders.
- Supports binge-ready playback with `bingeGroup` for next-episode autoplay.
- Handles movies, series, and anime with IMDb and Kitsu IDs.

## Supported Debrid Services

| Service | Short code |
| --- | --- |
| RealDebrid | RD |
| AllDebrid | AD |
| Premiumize | PM |
| Debrid-Link | DL |
| TorBox | TB |
| Offcloud | OC |
| EasyDebrid | ED |
| Put.io | Put.io |

## Configuration

- Providers: Turn sources on or off. Keep the default stack if you just want good coverage fast.
- Quality filters: Cap the max resolution and block trash like CAM or TS before it ever hits Stremio.
- Debrid: Pick your service, paste your API key, and Kraken will favor cached results when it can.
- Prowlarr and Jackett: Optional. Only touch these if you already run your own indexer stack.

## Self-Hosting

Kraken is already hosted for you at [kraken.backwoodsdevelopment.com](https://kraken.backwoodsdevelopment.com/configure). If you want your own instance anyway, read [DEPLOY.md](DEPLOY.md).

## Repo Layout

- `kraken-addon/`: Express app, manifest routes, stream logic, Docker assets, and the backend-served `/configure` page.
- `configure.html`: static config page copy for repo/docs publishing.
- `DEPLOY.md`: maintainer and self-hosting notes.

## Tech Stack

- TypeScript
- Express
- Cheerio
- Bottleneck
- Redis (optional)

## Contributing

Fork it, make a branch, and send a PR.
Bug reports and small focused fixes are welcome.
If you're changing provider behavior, include enough context to reproduce it.

## License

MIT. See [LICENSE](LICENSE).
