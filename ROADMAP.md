# Pi Retention Roadmap

## MVP (shipped)

The current release is a local-only retention tracker for Pi skills and extensions.

### Implemented

- Local usage tracking per artifact root via sidecars and JSONL logs
- `retention:report` with status legend and startup-candidate line
- Startup confirmation for exactly one expired candidate per launch
- Candidate ordering: earliest due date first, then oldest `lastUsedAt`
- Deny at startup leaves state unchanged and re-presents the same candidate next launch
- Pin excludes items from the startup candidate path (`P` in reports)
- Quarantined items are excluded from startup prompts (`Q` in reports)
- Manual restore, purge, pin, and unpin commands
- Project-local quarantine trash layout

### Non-goals (current MVP)

- Cloud sync or shared retention state
- Telemetry or remote reporting
- Automatic purge without explicit user confirmation
- Batch quarantine of multiple items in one startup prompt

## Next candidates

- Richer report filters and summaries
- Optional batch review flow (explicitly separate from startup)
- Additional integration tests around real Pi project layouts
