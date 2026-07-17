# Examples

Pi Retention ships one extension entrypoint and a shared library. These examples match the commands registered in `extensions/index.ts`.

## Local development

Load the package from a clone:

```bash
pi -e .
```

Initialize retention data for the current project:

```txt
/retention:init
```

## Report tracked roots

Show active, protected, quarantined, and due items:

```txt
/retention:report
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

- `.pi/.pi-retention-project.yaml` — project manifest (preferred)
- `.pi-retention-project.yaml` — legacy manifest path (still read when present)
- `.pi-retention.yaml` — per-root sidecar
- `.pi-retention.jsonl` — append-only usage log
- `.pi-retention-trash/` — quarantine area

## Extension surface

`extensions/index.ts` registers only retention commands. This package does not ship skills, prompt templates, themes, or custom tools.
