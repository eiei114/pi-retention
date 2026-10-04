# Examples

Pi Retention ships one extension entrypoint and a shared library. These examples match the commands registered in `extensions/index.ts`.

## Quick start

Install the published package and start Pi in the project you want to track:

```bash
pi install npm:pi-retention -l
pi
```

Inside Pi, initialize retention data and view the tracked roots:

```txt
/retention:init
/retention:report
```

`retention:init` creates `.pi/.pi-retention-project.yaml` for the current project.
The report lists active, protected, quarantined, and due roots. To show only due
roots, run `/retention:report --due`.

## Local development

Load the package from a clone instead of the published package:

```bash
pi -e .
```

## Report tracked roots

Show active, protected, quarantined, and due items:

```txt
/retention:report
```

Filter to due items only:

```txt
/retention:report --due
```

The report uses the same ordering as the startup prompt: earliest `dueAt`, then oldest `lastUsedAt`.

## Quarantine workflow

Manually quarantine the oldest expired candidate:

```txt
/retention:confirm
```

Restore or permanently delete a quarantined item:

```txt
/retention:restore
/retention:purge
```

## Pinning

Protect an item from expiry prompts:

```txt
/retention:pin
/retention:unpin
```

## Data files

After initialization, Pi Retention writes local files under the project:

- `.pi/.pi-retention-project.yaml` — project manifest (canonical)
- `.pi-retention-project.yaml` — legacy manifest path; automatically moved only when the canonical path does not already exist
- `.pi-retention.yaml` — per-root sidecar
- `.pi-retention.jsonl` — append-only usage log
- `.pi-retention-trash/` — quarantine area

## Extension surface

`extensions/index.ts` registers only retention commands. This package does not ship skills, prompt templates, themes, or custom tools.
