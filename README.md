# Pi Retention

[![CI](https://github.com/eiei114/pi-retention/actions/workflows/ci.yml/badge.svg)](https://github.com/eiei114/pi-retention/actions/workflows/ci.yml)
[![Publish](https://github.com/eiei114/pi-retention/actions/workflows/publish.yml/badge.svg)](https://github.com/eiei114/pi-retention/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/pi-retention.svg)](https://www.npmjs.com/package/pi-retention)
[![npm downloads](https://img.shields.io/npm/dm/pi-retention.svg)](https://www.npmjs.com/package/pi-retention)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Pi package](https://img.shields.io/badge/pi-package-purple.svg)](https://pi.dev/packages)
[![Trusted Publishing](https://img.shields.io/badge/npm-Trusted%20Publishing-blue.svg)](docs/release.md)
<a href="https://buymeacoffee.com/ekawano114m"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width="217" height="60"></a>

> Local retention tracker for Pi skills and extensions.

## What this is

Pi Retention counts local usage, surfaces expired items, and quarantines one stale item at a time on startup.

## Startup behavior

On each Pi launch, Pi Retention evaluates expired active roots and may prompt for **at most one** quarantine candidate.

- **Ordering:** earliest `dueAt` wins; ties break on oldest `lastUsedAt` (age).
- **Deny:** declining the prompt changes nothing; the same candidate is offered on the next launch.
- **Excluded:** pinned (`P`), quarantined (`Q`), self-protected, and not-yet-due roots never appear in the startup prompt.
- **Report:** `/retention:report` uses the same ordering and labels the startup candidate explicitly.

See [`ROADMAP.md`](ROADMAP.md) for MVP scope and non-goals.

## Features

- Tracks usage locally per artifact root
- Reports stale and protected items
- Prompts once per startup for the oldest expired candidate (due date, then age)
- Report rows show `A`/`!`/`P`/`Q` status and the single startup candidate
- Quarantines approved items before manual purge
- Keeps retention data local

## Commands

- `retention:init` — initialize the manifest for the current project
- `retention:report` — show all tracked roots
- `retention:confirm` — quarantine the oldest expired candidate
- `retention:restore` — restore one quarantined item
- `retention:purge` — permanently delete one quarantined item
- `retention:pin` / `retention:unpin` — protect or release one item

## Data files

- `.pi/.pi-retention-project.yaml` — project manifest (preferred)
- `.pi-retention-project.yaml` — legacy project manifest (still read when present)
- `.pi-retention.yaml` — per-root sidecar
- `.pi-retention.jsonl` — append-only usage log
- `.pi-retention-trash/` — quarantine area

## Install

Install the published npm package with Pi:

```bash
pi install npm:pi-retention
```

Pin a specific version when you want reproducible installs:

```bash
pi install npm:pi-retention@0.1.4
```

Install into the current project instead of your user Pi settings:

```bash
pi install npm:pi-retention -l
```

Or install from GitHub:

```bash
pi install git:github.com/eiei114/pi-retention
```

Try it without permanently installing:

```bash
pi -e npm:pi-retention
```

## Quick start

Try this package locally from a clone:

```bash
pi -e .
```

Then run:

```txt
/retention:report
```

On startup, Pi Retention checks the single oldest expired candidate and asks once before quarantine. Declining the prompt leaves the item active for the next launch.

## Package contents

Published tarball includes:

| Path | Purpose |
|---|---|
| `extensions/` | Pi TypeScript extension entrypoints |
| `lib/` | Shared TypeScript helpers |
| `docs/` | Supporting docs (`examples.md`, `release.md`) |
| `README.md` | Project entrypoint |
| `ROADMAP.md` | MVP scope and non-goals |
| `CHANGELOG.md` | Release history |
| `LICENSE` | MIT license |

## Development

```bash
npm install
npm run ci
```

`npm run ci` runs typecheck, tests, and `npm run pack:check` (`npm pack --dry-run`) to verify the published tarball contents before release.

## Release

Before tagging, confirm package readiness:

```bash
npm run ci
npm run pack:check
```

Then bump and push:

```bash
npm version patch
git push
```

See [`docs/release.md`](docs/release.md) for Trusted Publishing setup.

## Docs

- [`docs/examples.md`](docs/examples.md)
- [`docs/release.md`](docs/release.md)

## Security

Pi packages can execute code with your local permissions. Review extensions before installing third-party packages.

For vulnerability reporting, see [`SECURITY.md`](SECURITY.md).

## Links

- npm: https://www.npmjs.com/package/pi-retention
- GitHub: https://github.com/eiei114/pi-retention
- Issues: https://github.com/eiei114/pi-retention/issues
- [`CONTRIBUTING.md`](CONTRIBUTING.md)
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- [`CHANGELOG.md`](CHANGELOG.md)

## License

MIT
