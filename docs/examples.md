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

Try this in a throwaway project with a disposable local Pi package, for
example `./packages/demo-extension` registered in the `packages` array in
`.pi/settings.json`. Initialize retention with `/retention:init`. Once the demo
is due, use `/retention:report --due` to check that it is marked `>` (the oldest
eligible candidate). Decline any startup quarantine prompt if you want to try
the manual command: `/retention:confirm` offers the oldest eligible candidate,
not a package you specify by name.

1. **Quarantine:** In interactive Pi, run `/retention:confirm`, check the
   candidate, and accept the prompt. Pi Retention moves the package directory
   to `.pi-retention-trash/<name>-<timestamp>/` under the project root and
   removes its entry from `.pi/settings.json`. The quarantined record keeps the
   original location (`rootPath`), the new location (`quarantinePath`), and the
   original settings entry (`originalPackageEntry`, here
   `./packages/demo-extension`) in the project manifest and the moved package's
   `.pi-retention.yaml` sidecar. If no original entry is known, Pi Retention uses
   the original root path instead.

2. **Choose one action while the item is quarantined:** Neither command lists
   active items.

   - **Restore:** Run `/retention:restore` and select the demo. Pi Retention
     moves it back to `packages/demo-extension/`, re-adds its saved entry to
     `.pi/settings.json` if absent, and marks it active. It sets `lastUsedAt` to
     the restore time and recalculates `dueAt` from that time plus the item's
     existing TTL. The restored item is no longer eligible for purge unless
     it is quarantined again.
   - **Purge instead:** Run `/retention:purge`, select the quarantined demo,
     and confirm the permanent-delete prompt. Declining leaves it in
     quarantine. Confirming permanently deletes the quarantined directory,
     including its sidecar, and removes its record from the project manifest.
     The package stays unregistered and cannot be restored by Pi Retention.

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
