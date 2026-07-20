# Changelog

## Unreleased

### Changed

- Bump package version to `0.1.6` for the next patch release.

- Replace stale template placeholders in `docs/examples.md` with Pi Retention command and data-file examples.
- Refresh `ROADMAP.md` with current release status, short-term maintenance goals, and a bounded (30–90 min) maintenance seed backlog.
- Add Buy Me a Coffee sponsor button to README and native GitHub funding link via `.github/FUNDING.yml`.

All notable changes to this project will be documented in this file.

This project follows semantic versioning.

## [0.1.4] - 2026-06-26

### Changed

- README aligned with the current Pi extension template: expanded install paths, package contents table, and explicit `npm run pack:check` / `npm pack --dry-run` release-readiness guidance.

## [0.1.3] - 2026-06-17

### Added

- Explicit startup-candidate helpers (`isStartupCandidate`, `compareStartupCandidates`, `recordReportStatus`).
- Deterministic startup/ordering tests for deny, pin, and quarantined exclusions.
- `ROADMAP.md` documenting shipped MVP scope and current non-goals.

### Changed

- `retention:report` now labels the single startup candidate and documents status symbols.
- Startup confirm copy states the one-per-launch rule; deny leaves state unchanged.
- README startup section matches implemented ordering and exclusion rules.

## [0.1.2] - 2026-06-14

### Added

- First Pi Retention MVP: local usage tracking, report, confirm, restore, purge, pin, and unpin commands.
- Startup-time confirmation for the oldest expired candidate.
- YAML project manifest / sidecars and project-local JSONL usage log.
- Quarantine flow and project trash layout.

### Changed

- Replaced the template scaffold with the Pi Retention package identity.
- Removed template placeholder skills, prompts, themes, and docs from the published package.
- Updated README with commands, data files, and startup behavior.

## [0.1.1] - 2026-06-01

### Changed

- Publish workflow now supports npm publishing on merged package version bumps in addition to tags, releases, and manual dispatch.
- Publish workflow now installs a current npm CLI so npm Trusted Publishing OIDC is supported.
- CI and publish workflow commands no longer include literal trailing `\\n` text.

## [0.1.0] - 2026-05-29

### Added

- Initial Pi package template.
- Example extension, Agent Skill, prompt, and theme.
- CI and npm Trusted Publishing workflow.

