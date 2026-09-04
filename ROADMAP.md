# Pi Retention Roadmap

> Local retention tracker for Pi skills and extensions. This roadmap records the
> shipped MVP, current release status, near-term priorities, and a backlog of
> bounded maintenance **seeds** (30–90 minutes each) that the weekly maintenance
> seed planner can promote into backlog issues.

## Current release status

| Field | Value |
|---|---|
| `package.json` version | `0.1.9` |
| Latest published on npm | `0.1.9` |
| Last dated `CHANGELOG.md` entry | `[0.1.9]` — 2026-08-22 (managed OSS dependency batch) |
| In-tree, not yet dated in changelog | None |
| Next planned version | `0.1.10` — lifecycle integration tests (see [SEED-4](#seed-4)) |
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

## Short-term maintenance goals (next 2–3 releases)

- **0.1.10** — Lifecycle coverage. Add integration tests for the quarantine →
  restore → purge path (see [SEED-4](#seed-4)).
- **0.2.0** — Optional batch review flow (explicitly **separate** from startup),
  if the single-candidate startup contract stays intact. Gated on real usage
  feedback before committing.

Each release continues to follow the existing guardrails: `npm run ci`
(typecheck + tests + `npm pack --dry-run`) must pass, and the `auto-release.yml`
→ `publish.yml` handoff must stay intact.

## Areas needing improvement

- **Test coverage** — core startup ordering and manifest-path resolution are
  well covered; the extension command layer and the quarantine/restore/purge
  filesystem lifecycle are not directly exercised ([SEED-4](#seed-4),
  [SEED-6](#seed-6)).
- **Planner guardrails** — the backlog must keep at least three live seeds so
  the weekly maintenance seed planner can promote work without re-scoping
  ([SEED-7](#seed-7)).
- **Dependency hygiene** — Dependabot keeps the weekly `all-dependencies` group
  current (npm and GitHub Actions); keep merging the open group PRs promptly to
  reduce conflict surface.

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

## Maintenance seed backlog

Each seed is intentionally scoped to **30–90 minutes** and lists concrete
acceptance criteria so the weekly maintenance seed planner can promote it into a
backlog issue without re-scoping. Seeds are candidates, not commitments — pick
one per maintenance window.

<a id="seed-4"></a>

### SEED-4 — Lifecycle integration test for quarantine → restore → purge

- **Problem:** `lib/retention.ts` core helpers are unit-tested, but the
  `quarantineRecord` → `restoreRecord` → `purgeRecord` filesystem lifecycle and
  the `updateProjectPackages` settings.json sync are not directly exercised.
- **Scope:** Tests only. No production change unless a test reveals a bug.
- **Estimate:** ~60 min.
- **Acceptance criteria:**
  - [ ] A new `tests/retention-lifecycle.test.mjs` (or equivalent) drives the
        full lifecycle against a temp project root.
  - [ ] It asserts: quarantine moves the dir and removes the entry from
        `.pi/settings.json`; restore re-adds the entry and clears
        `quarantinePath`; purge deletes the trash entry.
  - [ ] It asserts self-protected roots cannot be quarantined.
  - [ ] `npm run ci` passes.

<a id="seed-6"></a>

### SEED-6 — Unit-test extension command flag parsing (`hasFlag`)

- **Problem:** `retention:report --due` depends on a private `hasFlag` helper in
  `extensions/index.ts`. Core report filtering is tested in
  `tests/retention-core.test.mjs`, but the extension argument parser has no
  direct coverage, so a refactor could break `--due` wiring without CI catching
  it.
- **Scope:** Tests and a small export/move only. No command behavior change
  unless a test reveals a bug.
- **Estimate:** ~45 min.
- **Acceptance criteria:**
  - [ ] `hasFlag` lives in a testable module (e.g. `lib/flags.ts`) and is
        imported by `extensions/index.ts`.
  - [ ] A new test file covers positive, negative, and multi-token argument
        strings (including `--due`).
  - [ ] Default `retention:report` output remains unchanged.
  - [ ] `npm run ci` passes.

<a id="seed-7"></a>

### SEED-7 — Smoke test: ROADMAP backlog must list ≥3 live seeds

- **Problem:** The weekly maintenance seed planner promotes one seed per window
  from this backlog. When fewer than three candidates exist, promotion stalls
  and roadmap-driven seeding issues recur (e.g. missing bounded micro tasks).
- **Scope:** Test only. No production code change.
- **Estimate:** ~30 min.
- **Acceptance criteria:**
  - [ ] `tests/smoke.test.mjs` counts `### SEED-*` headings under
        `## Maintenance seed backlog` and asserts the count is ≥ 3.
  - [ ] Each counted seed includes an `**Estimate:**` line scoped to ~30–90 min.
  - [ ] Shipped seeds under `## Completed maintenance seeds` are excluded from
        the count.
  - [ ] `npm run ci` passes.

## How seeds are picked

1. The weekly maintenance seed planner reads this backlog and the current
   release status above.
2. One seed is promoted to a backlog issue per maintenance window, scoped to the
   listed acceptance criteria (no re-scoping needed).
3. When a seed ships, move it out of this backlog and update the relevant
   release goal above. Keep at least three live candidates here so the weekly
   seed planner can pick without re-scoping; SEED-4 remains the primary target
   for `0.1.10`, with SEED-6 and SEED-7 covering extension parsing coverage
   and planner guardrails.
