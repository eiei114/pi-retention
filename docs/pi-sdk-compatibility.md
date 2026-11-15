## Pi SDK 1.5.0 compatibility

`pi-retention` is verified against the frozen Pi SDK wave:

- `@earendil-works/pi-agent-core`: `1.5.0`
- `@earendil-works/pi-ai`: `1.5.0`
- `@earendil-works/pi-coding-agent`: `1.5.0`
- `@earendil-works/pi-tui`: `1.5.0`

These are exact dev/test pins only. Public peer dependency ranges remain `*`,
so the published package still installs against whatever Pi SDK the host
provides.

This package registers **commands and event handlers only**. It does not
register custom tools, skills, prompt templates, themes, or TUI components, and
it declares no TypeBox schemas. The surfaces it uses — `pi.registerCommand`,
`pi.on("session_start")`, `pi.on("tool_call")`, `ctx.hasUI`,
`ctx.ui.notify` / `confirm` / `select`, `ctx.cwd` — typecheck and load on
1.5.0 without API migration.

### 1.5.0 migration notes

The official [Pi v1.5.0 release notes](https://github.com/earendil-works/pi/releases/tag/v1.5.0)
move tool argument validation to `@earendil-works/pi-schema`. TypeBox schemas
are JSON Schema and keep working, but TypeBox features outside JSON Schema
(`Type.Refine()`, `Type.BigInt()`, `Type.Undefined()`, `Type.Void()`, codecs,
`Format.Set()` formats) no longer apply to tool arguments, loosely typed
arguments are now coerced, and validation errors use pi-schema messages.

This package is **not affected**: it defines no tools and no tool parameter
schemas. If a future release adds a custom tool here, keep the schema inside
JSON Schema and validate anything outside JSON Schema inside `execute()`.
Follow the baseline guidance in
[`pi-extension-template` `docs/pi-sdk-compatibility.md`](https://github.com/eiei114/pi-extension-template/blob/main/docs/pi-sdk-compatibility.md)
for tool-bearing packages (`StringEnum` typing, `Type.Unsafe<T>` wrapping, and
importing `Type`/`Static` from `typebox` instead of `@earendil-works/pi-ai`).

`pi-coding-agent` 1.5.0 still ships `typebox` exactly at `1.3.27`, so the
lockfile keeps that version for the `typebox` peer/dev entry; moving it to
1.4.x would install a second copy.

The other 1.5.0 changes (extension update changelogs, `pi.exec()` buffer caps,
keybinding helpers, model catalog refresh) are additive and do not change the
retention manifest, command handling, or startup confirmation contract.

### Runtime verification

Run `npm run smoke:pi` to load the extension in the actual locally pinned Pi
host. `npm run ci` runs this harness as part of the required CI pipeline, so CI
executes the behaviour checks rather than only linting the report. The committed
result is `docs/verification/pi-sdk-smoke.json` and uses
`verification_contract=pi-sdk-behavior-v2`.

The harness asserts, against a real Pi RPC host process:

- `extension_load` — all `retention:*` commands are registered by the extension
  and the session-start hook initializes the project manifest.
- `happy_path` — `retention:init` and `retention:report` are handled by the host
  and report the configured tracked extension package.
- `error_path` — `retention:confirm` with no expired candidate is handled, adds
  no record, and notifies the user.
- `reload_cleanup` — a **second** actual Pi process re-registers the commands,
  reads the manifest written by the first process, and both processes exit with
  no unhandled, shutdown, or extension-load errors.
- `host_shell` — the native host shell launches the pinned CLI and returns its
  exact version (Windows PowerShell on Windows, `/bin/sh` on POSIX).

The harness resolves the CLI from the installed SDK manifest, checks all four
installed versions against the exact pins, and runs each case in an isolated
temporary project and agent directory, so global Pi settings are untouched.
The feature path is deterministic and offline: verification makes no paid model
requests. Pi's extension loader, host process, RPC handling, extension lifecycle,
and feature responses are real rather than mocked; provider inference is
outside this compatibility contract. Contract regression tests
(`tests/pi-sdk-smoke-contract.test.mjs`) require the reload case's
second-process response fields and reject deliberately missing or stale
responses, so the report cannot pass on exit codes alone.
