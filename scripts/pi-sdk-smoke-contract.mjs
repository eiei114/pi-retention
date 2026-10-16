export const VERIFICATION_CONTRACT = "pi-sdk-behavior-v2";
export const SDK_VERSIONS = {
  "@earendil-works/pi-agent-core": "1.2.0",
  "@earendil-works/pi-ai": "1.2.0",
  "@earendil-works/pi-coding-agent": "1.2.0",
  "@earendil-works/pi-tui": "1.2.0",
};
export const UNHANDLED_ERROR_PATTERN = /UnhandledPromiseRejection|uncaught exception|shutdown error/i;
export const EXTENSION_LOAD_ERROR_PATTERN = /Failed to load extension|Error loading extension/i;

export function parseJsonLines(output) {
  return output.split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

function assertion(id, expected, observed, passed) {
  return { id, expected, observed: JSON.stringify(observed), passed: passed === true };
}

function registered(commands) {
  return Array.isArray(commands)
    && commands.some((command) => command.source === "extension" && command.name === "retention:init");
}

function notification(notifications, text) {
  return notifications.find((row) => row?.method === "notify"
    && typeof row.message === "string" && row.message.includes(text));
}

function handled(response) {
  return response?.success === true && response.data?.disposition === "handled";
}

export function behaviorAssertions(name, observed) {
  if (name === "extension_load") {
    return [assertion(
      "extension_registered",
      "The actual Pi host lists the Pi Retention extension command and session startup initializes the project manifest",
      { registered: registered(observed.commands), manifestExists: observed.manifestExists === true },
      registered(observed.commands) && observed.manifestExists === true,
    )];
  }

  if (name === "happy_path") {
    const reportNotification = notification(observed.notifications ?? [], "pi-retention-smoke-extension");
    const reportContainsActiveItem = typeof reportNotification?.message === "string"
      && /active/i.test(reportNotification.message);
    return [assertion(
      "feature_response",
      "The real retention:init and retention:report commands are handled and report the configured active extension package",
      { handled: handled(observed.prompt), report: reportNotification?.message ?? null },
      handled(observed.prompt) && reportContainsActiveItem,
    )];
  }

  if (name === "error_path") {
    const noCandidate = notification(observed.notifications ?? [], "No expired candidate found.");
    return [assertion(
      "handled_error",
      "With no expired item, retention:confirm handles the empty state without adding records and reports it to the user",
      { handled: handled(observed.prompt), notification: noCandidate?.message ?? null, recordCount: observed.recordCount },
      handled(observed.prompt) && !!noCandidate && observed.recordCount === 0,
    )];
  }

  if (name === "reload_cleanup") {
    const reportNotification = notification(observed.notifications ?? [], "pi-retention-smoke-extension");
    const hasActiveItem = typeof reportNotification?.message === "string"
      && /active/i.test(reportNotification.message);
    const cleanShutdown = observed.exit_code === 0
      && !UNHANDLED_ERROR_PATTERN.test(observed.fullOutput ?? "")
      && (observed.extensionErrors?.length ?? 0) === 0
      && observed.firstProcessExitCode === 0
      && observed.firstProcessUnhandledError !== true
      && observed.firstProcessExtensionLoadError !== true
      && (observed.firstProcessExtensionErrors?.length ?? 0) === 0;
    return [
      assertion(
        "reloaded_extension_registered",
        "A second independent Pi process re-registers the retention commands against the persisted project",
        { registered: registered(observed.commands), firstProcessExitCode: observed.firstProcessExitCode },
        registered(observed.commands) && observed.firstProcessExitCode === 0,
      ),
      assertion(
        "reloaded_feature_response",
        "The second Pi process handles retention:report and reads the active record written by the first process",
        { handled: handled(observed.prompt), report: reportNotification?.message ?? null },
        handled(observed.prompt) && hasActiveItem,
      ),
      assertion(
        "clean_shutdown",
        "Both actual Pi processes exit zero with no unhandled, shutdown, or extension errors",
        {
          exit_code: observed.exit_code,
          errors: observed.extensionErrors ?? [],
          firstProcessExitCode: observed.firstProcessExitCode,
          firstProcessErrors: observed.firstProcessExtensionErrors ?? [],
          firstProcessUnhandledError: observed.firstProcessUnhandledError,
          firstProcessExtensionLoadError: observed.firstProcessExtensionLoadError,
        },
        cleanShutdown,
      ),
    ];
  }

  if (name === "host_shell") {
    const output = (observed.fullOutput ?? "").trim();
    return [assertion(
      "native_shell_boundary",
      "The native host shell launches the locally installed Pi CLI and returns its exact pinned SDK version",
      { exit_code: observed.exit_code, output, expectedVersion: SDK_VERSIONS["@earendil-works/pi-coding-agent"] },
      observed.exit_code === 0 && output === SDK_VERSIONS["@earendil-works/pi-coding-agent"],
    )];
  }

  throw new Error(`Unknown smoke case: ${name}`);
}
