# Pi Retention Roadmap

> Local retention tracker for Pi skills and extensions. This roadmap records the
> shipped MVP, current release status, near-term priorities, and a backlog of
> bounded maintenance **seeds** (30–90 minutes each) that the weekly maintenance
> seed planner can promote into backlog issues.

## Current release status

| Field | Value |
|---|---|
| `package.json` version | `0.1.21` |
| Latest published on npm | `0.1.15` |
| Last dated `CHANGELOG.md` entry | `[0.1.18]` — 2026-10-16 (Pi SDK 1.2.0 compatibility) |
| In-tree, not yet dated in changelog | DOT-2029: linear-time retention candidate selection; no release created |
| Next planned version | `0.1.21` — Pi SDK 1.5.0 compatibility (in-tree, awaiting release) |
| Release flow | npm Trusted Publishing via `auto-release.yml` → `publish.yml` (see [`docs/release.md`](docs/release.md)) |

The package is a **local-only** tracker. No cloud sync, no telemetry, no remote
reporting, and no unattended purge are planned for this MVP line.

## MVP (shipped)

### Implemented

- Local usage tracking per artifact root via sidecars and JSONL logs
- `retention:report` with a status legend and an explicit startup-candidate line
- Startup confirmation for **at most one** expired candidate per launch
- Candidate ordering: earliest `dueAt` first, then oldest `lastUsedAt` (age)
- Deny at startup leaves state unchanged and re-presents the same candidate next launch
- Pin excludes items from the startup candidate path (`P` in reports)
- Quarantined items are excluded from startup prompts (`Q` in reports)
- Manual `restore`, `purge`, `pin`, and `unpin` commands
- Project-local quarantine trash layout (`.pi-retention-trash/`)
- Preferred manifest path `.pi/.pi-retention-project.yaml` with automatic migration from the legacy root path

### Non-goals (current MVP line)

- Cloud sync or shared retention state
- Telemetry or remote reporting
- Automatic purge without explicit user confirmation
- Batch quarantine of multiple items in one startup prompt

## Roadmap review — 2026-W41

This historical review listed work that has since shipped. SEED-3 and SEED-4
are completed on the current `main` branch (package version `0.1.21`); do not
promote them from this snapshot. For current work, use the live candidates in
the [maintenance seed backlog](#maintenance-seed-backlog) below.

No implementation or release action is part of this historical review.

## Short-term maintenance goals (next 2–3 releases)

- **Lifecycle coverage** — completed on `main`; see [SEED-4](#seed-4). This
  roadmap note does not imply a package release.
- **0.2.0** — Optional batch review flow (explicitly **separate** from startup),
  if the single-candidate startup contract stays intact. Gated on real usage
  feedback before committing.

Each release continues to follow the existing guardrails: `npm run ci`
(typecheck + tests + `npm pack --dry-run`) must pass, and the `auto-release.yml`
→ `publish.yml` handoff must stay intact.

## Areas needing improvement

- **Test coverage** — startup ordering, manifest paths, and the quarantine /
  restore / purge lifecycle have focused coverage. Direct tests for pin/unpin
  command persistence and the `tool_call` usage-sync handler remain useful
  ([SEED-8](#seed-8), [SEED-10](#seed-10)).
- **Planner guardrails** — `tests/smoke.test.mjs` enforces at least three
  estimated live seeds and excludes completed seeds; keep each candidate
  genuinely open in the backlog below.
- **Dependency hygiene** — Dependabot keeps one weekly grouped PR per
  ecosystem: the `pi-sdk` group moves the `@earendil-works/*` packages
  together, `npm-dependencies` carries the remaining npm updates, and
  `github-actions-dependencies` covers workflow actions. Keep merging the open
  group PRs promptly to reduce conflict surface.

## Completed maintenance seeds

<a id="seed-3"></a>

### SEED-3 — Add a `--due` filter and summary footer to `retention:report`

- **Status:** Shipped in `0.1.9`.
- **Acceptance criteria:**
  - [x] `formatReport` accepts an optional filter (e.g. `{ dueOnly?: boolean }`)
        without changing default output.
  - [x] `retention:report` exposes a `--due` flag wired through the command handler.
  - [x] Report ends with a one-line summary (e.g. `due today: N`).
  - [x] Tests in `tests/retention-core.test.mjs` cover the filtered path and the
        default (unchanged) path.
  - [x] `npm run ci` passes.

<a id="seed-4"></a>

### SEED-4 — Lifecycle integration test for quarantine → restore → purge

- **Status:** Shipped on `main` in DOT-3854 (`tests/retention-lifecycle.test.mjs`).
- **Acceptance criteria:**
  - [x] A temp-project integration test drives the full lifecycle.
  - [x] Quarantine moves the directory and removes its settings entry; restore
        returns the directory and settings entry and clears `quarantinePath`;
        purge deletes the trash entry.
  - [x] Self-protected roots cannot be quarantined.
  - [x] `npm run ci` passes.

<a id="seed-5"></a>

### SEED-5 — Migrate legacy project manifests to `.pi/`

- **Status:** Shipped in `0.1.8`.
- **Acceptance criteria:**
  - [x] README "Data files" and `docs/examples.md` state that
        `.pi/.pi-retention-project.yaml` is canonical and the legacy root file
        is automatically moved only when the canonical path does not exist.
  - [x] `loadManifest` migrates the legacy file without losing its contents.
  - [x] Documentation matches `resolveManifestPath` in `lib/retention.ts`.
  - [x] `npm run ci` passes.

<a id="seed-6"></a>

### SEED-6 — Unit-test extension command flag parsing (`hasFlag`)

- **Status:** Shipped on `main` (`lib/flags.ts`, `extensions/index.ts`, and
  `tests/flags.test.mjs`).
- **Acceptance criteria:**
  - [x] `hasFlag` lives in a testable module imported by the extension.
  - [x] Tests cover positive, negative, and multi-token arguments.
  - [x] Default `retention:report` output remains unchanged.
  - [x] `npm run ci` passes.

<a id="seed-7"></a>

### SEED-7 — Smoke test: ROADMAP backlog must list ≥3 live seeds

- **Status:** Shipped in `tests/smoke.test.mjs`.
- **Acceptance criteria:**
  - [x] The smoke test counts seed headings under the maintenance backlog and
        requires at least three.
  - [x] Each live seed has an estimate, and completed seeds are excluded.
  - [x] `npm run ci` passes.

## Maintenance seed backlog

Each seed is intentionally scoped to **30–90 minutes** and lists concrete
acceptance criteria so the weekly maintenance seed planner can promote it into a
backlog issue without re-scoping. Seeds are candidates, not commitments — pick
one per maintenance window.

<a id="seed-8"></a>

### SEED-8 — Exercise pin and unpin command state transitions

- **Problem:** `applyPin` changes the pinned state and unpin recalculates the
  due date, but tests do not drive the `retention:pin` / `retention:unpin`
  handlers or verify their saved manifest and sidecars.
- **Scope:** Tests only. No production change unless a test reveals a bug.
- **Estimate:** ~60 min.
- **Acceptance criteria:**
  - [ ] A temp-project test invokes both extension commands with a selected
        active record and verifies pin/unpin state is persisted.
  - [ ] The test verifies unpin recalculates `dueAt` from `lastUsedAt` and
        `ttlDays`, and neither command moves package files.
  - [ ] `npm run ci` passes.

<a id="seed-9"></a>

### SEED-9 — Document the quarantine → restore → purge walkthrough

- **Problem:** `docs/examples.md` lists the lifecycle commands and trash
  directory, but does not explain how the package location and tracked state
  change between those steps.
- **Scope:** Documentation only; match the behavior in `lib/retention.ts`.
- **Estimate:** ~45 min.
- **Acceptance criteria:**
  - [ ] The example explains that quarantine moves the package under
        `.pi-retention-trash/` and records its path.
  - [ ] It explains that restore returns the package and purge permanently
        deletes the quarantined copy (including the confirmation prompt).
  - [ ] Commands, paths, and state changes match the implementation.
  - [ ] `npm run ci` passes.

<a id="seed-10"></a>

### SEED-10 — Test extension `tool_call` usage synchronization

- **Problem:** `loadSyncedProjectRetention` has indirect usage-sync coverage,
  but no test directly exercises `syncRecordUsage` or the extension's
  `tool_call` handler and its persistence of matching tool usage.
- **Scope:** Tests only. No production change unless a test reveals a bug.
- **Estimate:** ~60 min.
- **Acceptance criteria:**
  - [ ] A temp-project test invokes the registered `tool_call` handler with a
        matching package tool name and verifies usage, timestamps, and due date
        are saved to the manifest and sidecar.
  - [ ] A nonmatching tool name leaves tracked usage unchanged.
  - [ ] `npm run ci` passes.

## How seeds are picked

1. The weekly maintenance seed planner reads this backlog and the current
   release status above.
2. One seed is promoted to a backlog issue per maintenance window, scoped to the
   listed acceptance criteria (no re-scoping needed).
3. When a seed ships, record it under `## Completed maintenance seeds` without
   renumbering it, then replace it with genuinely open work. The smoke test
   verifies that at least three estimated live candidates remain and excludes
   completed seeds.
