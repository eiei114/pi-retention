# Pi Retention Roadmap

> Local retention tracker for Pi skills and extensions. This roadmap records the
> shipped MVP, current release status, near-term priorities, and a backlog of
> bounded maintenance **seeds** (30–90 minutes each) that the weekly maintenance
> seed planner can promote into backlog issues.

## Current release status

| Field | Value |
|---|---|
| `package.json` version | `0.1.5` |
| Latest published on npm | `0.1.5` |
| Last dated `CHANGELOG.md` entry | `[0.1.4]` — 2026-06-26 (README alignment) |
| In-tree, not yet dated in changelog | `0.1.5` (sponsor button + funding link) — see [SEED-1](#seed-1) |
| Next planned version | `0.1.6` — maintenance/docs + a small report improvement |
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
- Preferred manifest path `.pi/.pi-retention-project.yaml` with legacy fallback

### Non-goals (current MVP line)

- Cloud sync or shared retention state
- Telemetry or remote reporting
- Automatic purge without explicit user confirmation
- Batch quarantine of multiple items in one startup prompt

## Short-term maintenance goals (next 2–3 releases)

- **0.1.6** — Documentation accuracy pass and one small report improvement.
  Close the gap between what the repo documents and what it ships (see
  [SEED-1](#seed-1), [SEED-2](#seed-2), [SEED-3](#seed-3)). Docs-only where
  possible; no behavior change unless a test backs it.
- **0.1.7** — Lifecycle coverage. Add integration tests for the
  quarantine → restore → purge path and settings.json sync so future refactors
  of `lib/retention.ts` stay safe (see [SEED-4](#seed-4)).
- **0.2.0** — Optional batch review flow (explicitly **separate** from startup),
  if the single-candidate startup contract stays intact. Gated on real usage
  feedback before committing.

Each release continues to follow the existing guardrails: `npm run ci`
(typecheck + tests + `npm pack --dry-run`) must pass, and the `auto-release.yml`
→ `publish.yml` handoff must stay intact.

## Areas needing improvement

- **Docs accuracy** — `docs/examples.md` still describes the removed template
  scaffold and is the most visible drift ([SEED-2](#seed-2)). `CHANGELOG.md` is
  missing a dated `0.1.5` entry ([SEED-1](#seed-1)).
- **Test coverage** — core startup ordering and manifest-path resolution are
  well covered; the extension command layer and the quarantine/restore/purge
  filesystem lifecycle are not directly exercised ([SEED-4](#seed-4)).
- **Report richness** — `formatReport` has no filtering or summary footer; the
  report grows linearly with tracked roots ([SEED-3](#seed-3)).
- **Dependency hygiene** — Dependabot keeps the `npm-dev-minor-patch` group
  current; keep merging the open group PRs promptly to reduce conflict surface.

## Maintenance seed backlog

Each seed is intentionally scoped to **30–90 minutes** and lists concrete
acceptance criteria so the weekly maintenance seed planner can promote it into a
backlog issue without re-scoping. Seeds are candidates, not commitments — pick
one per maintenance window.

### SEED-1 — Date the `0.1.5` CHANGELOG entry

- **Problem:** `0.1.5` is published on npm, but `CHANGELOG.md` still lists the
  sponsor-button change under `## Unreleased` with no dated `## [0.1.5]` section.
- **Scope:** Docs only. No code or version bump (version already matches npm).
- **Estimate:** ~30 min.
- **Acceptance criteria:**
  - [ ] `CHANGELOG.md` has a dated `## [0.1.5] - <YYYY-MM-DD>` section containing
        the sponsor/funding change (date = sponsor-rollout commit `b5f3e18`).
  - [ ] A fresh empty `## Unreleased` heading sits above `## [0.1.5]`.
  - [ ] Latest dated entry version equals `package.json` `version` (`0.1.5`).
  - [ ] `npm run ci` passes.

### SEED-2 — Rewrite stale `docs/examples.md` for pi-retention

- **Problem:** `docs/examples.md` documents the removed template scaffold
  (`/template-hello`, `skills/example-skill`, `themes/`, `lib/greeting.ts`,
  `template_greet`) instead of pi-retention. It is shipped in the npm tarball.
- **Scope:** Docs only.
- **Estimate:** ~45 min.
- **Acceptance criteria:**
  - [ ] `docs/examples.md` contains **no** references to `template-hello`,
        `greeting`, `example-skill`, `example-theme`, or `template_greet`.
  - [ ] Every command it references exists in `extensions/index.ts`
        (`retention:init|report|confirm|restore|purge|pin|unpin`).
  - [ ] It documents the data files (`.pi/.pi-retention-project.yaml`,
        `.pi-retention.yaml`, `.pi-retention.jsonl`, `.pi-retention-trash/`).
  - [ ] `npm run ci` passes; `npm pack --dry-run` still includes `docs/`.

### SEED-3 — Add a `--due` filter and summary footer to `retention:report`

- **Problem:** The report lists every tracked root with no way to narrow to due
  items, and no compact summary line beyond the existing counts. Listed under
  MVP "Next candidates" (richer report filters and summaries).
- **Scope:** Small feature + tests. Behavior-preserving when no flag is passed.
- **Estimate:** ~60 min.
- **Acceptance criteria:**
  - [ ] `formatReport` accepts an optional filter (e.g. `{ dueOnly?: boolean }`)
        without changing default output.
  - [ ] `retention:report` exposes a `--due` flag (or equivalent) wired through
        the command handler.
  - [ ] Report ends with a one-line summary (e.g. `due today: N`).
  - [ ] New tests in `tests/retention-core.test.mjs` cover the filtered path and
        the default (unchanged) path.
  - [ ] `npm run ci` passes.

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

### SEED-5 — Clarify manifest path precedence in README and `docs/examples.md`

- **Problem:** PR #19 introduced `.pi/.pi-retention-project.yaml` as the
  preferred path with a legacy fallback, but the user-facing docs do not state
  the precedence explicitly. (`tests/manifest-path.test.mjs` already covers it.)
- **Scope:** Docs only.
- **Estimate:** ~30 min.
- **Acceptance criteria:**
  - [ ] README "Data files" and `docs/examples.md` both state: preferred
        `.pi/.pi-retention-project.yaml`, with `.pi-retention-project.yaml`
        still read as a legacy fallback.
  - [ ] No claim contradicts `resolveManifestPath` in `lib/retention.ts`.
  - [ ] `npm run ci` passes.

## How seeds are picked

1. The weekly maintenance seed planner reads this backlog and the current
   release status above.
2. One seed is promoted to a backlog issue per maintenance window, scoped to the
   listed acceptance criteria (no re-scoping needed).
3. When a seed ships, move it out of this backlog and update the relevant
   release goal above. Keep at least three live candidates here at all times.
