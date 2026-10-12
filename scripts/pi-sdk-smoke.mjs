import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  behaviorAssertions,
  EXTENSION_LOAD_ERROR_PATTERN,
  SDK_VERSIONS,
  UNHANDLED_ERROR_PATTERN,
  VERIFICATION_CONTRACT,
} from "./pi-sdk-smoke-contract.mjs";

const root = resolve(import.meta.dirname, "..");
const reportPath = resolve(root, "docs/verification/pi-sdk-smoke.json");
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const installedVersions = Object.fromEntries(Object.entries(SDK_VERSIONS).map(([name, expected]) => {
  const installed = JSON.parse(readFileSync(resolve(root, "node_modules", name, "package.json"), "utf8")).version;
  if (manifest.devDependencies?.[name] !== expected || installed !== expected) {
    throw new Error(`Smoke requires exact dev/test pin ${name}@${expected}; manifest=${manifest.devDependencies?.[name]}, installed=${installed}`);
  }
  return [name, installed];
}));
const piManifest = JSON.parse(readFileSync(resolve(root, "node_modules/@earendil-works/pi-coding-agent/package.json"), "utf8"));
const piCli = resolve(root, "node_modules/@earendil-works/pi-coding-agent", piManifest.bin.pi);
const extensionPath = resolve(root, "extensions/index.ts");
const rpcArgs = [
  piCli,
  "--offline",
  "--no-session",
  "--no-tools",
  "--no-extensions",
  "--no-skills",
  "--no-context-files",
  "--no-prompt-templates",
  "--no-mcp",
  "--approve",
  "--extension",
  extensionPath,
  "--mode",
  "rpc",
];
const commandTimeoutMs = 15_000;
const cleanupGraceMs = 1_000;

function createProject(sandbox, withPackage) {
  const project = join(sandbox, "project");
  mkdirSync(project, { recursive: true });
  if (withPackage) {
    const packageDir = join(project, "sample-extension");
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(join(packageDir, "package.json"), JSON.stringify({
      name: "pi-retention-smoke-extension",
      version: "1.0.0",
      pi: { extensions: ["./index.ts"] },
    }, null, 2) + "\n");
    mkdirSync(join(project, ".pi"), { recursive: true });
    writeFileSync(join(project, ".pi", "settings.json"), JSON.stringify({ packages: ["./sample-extension"] }, null, 2) + "\n");
  } else {
    mkdirSync(join(project, ".pi"), { recursive: true });
    writeFileSync(join(project, ".pi", "settings.json"), JSON.stringify({ packages: [] }, null, 2) + "\n");
  }
  return project;
}

function redactEvidence(value, sandbox) {
  if (typeof value === "string") {
    const escapedRoot = JSON.stringify(root).slice(1, -1);
    const escapedSandbox = JSON.stringify(sandbox).slice(1, -1);
    return value
      .replaceAll(root, "<checkout>")
      .replaceAll(sandbox, "<temporary-sandbox>")
      .replaceAll(escapedRoot, "<checkout>")
      .replaceAll(escapedSandbox, "<temporary-sandbox>");
  }
  if (Array.isArray(value)) return value.map((item) => redactEvidence(item, sandbox));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactEvidence(item, sandbox)]));
  }
  return value;
}

async function runPiHost(project, agentDir, scenario) {
  const child = spawn(process.execPath, rpcArgs, {
    cwd: project,
    env: {
      ...process.env,
      PI_CODING_AGENT_DIR: agentDir,
      PI_CODING_AGENT_SESSION_DIR: join(agentDir, "sessions"),
      PI_OFFLINE: "1",
      PI_TELEMETRY: "0",
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const startedAt = Date.now();
  const deadline = startedAt + commandTimeoutMs;
  let stdout = "";
  let stderr = "";
  let partialLine = "";
  const nonJsonLines = [];
  let timedOut = false;
  let childError;
  let nextRequestId = 0;
  const rows = [];
  const waiters = new Set();
  const closed = new Promise((resolveClose) => {
    child.once("close", (code, signal) => resolveClose({ code, signal, closedAt: Date.now() }));
  });

  const rejectWaiters = (error) => {
    for (const waiter of [...waiters]) waiter.reject(error);
  };
  const collectStdout = (chunk) => {
    stdout += chunk.toString();
    partialLine += chunk.toString();
    const lines = partialLine.split(/\r?\n/);
    partialLine = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        rows.push(row);
        for (const waiter of [...waiters]) waiter.check(row);
      } catch {
        // Non-JSON output remains in the captured full output for error scanning.
        nonJsonLines.push(line);
      }
    }
  };
  child.stdout.on("data", collectStdout);
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  child.once("close", () => rejectWaiters(new Error("Pi RPC process exited before the requested response")));
  child.once("error", (error) => {
    childError = error;
    rejectWaiters(error);
  });

  const timeout = setTimeout(() => {
    timedOut = true;
    const error = new Error(`Pi RPC process exceeded ${commandTimeoutMs}ms deadline`);
    rejectWaiters(error);
    child.kill();
  }, commandTimeoutMs);

  function waitForRow(predicate, description) {
    const existing = rows.find(predicate);
    if (existing) return Promise.resolve(existing);
    const remaining = deadline - Date.now();
    if (remaining <= 0) return Promise.reject(new Error(`Timed out waiting for ${description}`));
    return new Promise((resolveRow, rejectRow) => {
      const waiter = {
        check(row) {
          if (predicate(row)) {
            waiters.delete(waiter);
            clearTimeout(timer);
            resolveRow(row);
          }
        },
        reject(error) {
          waiters.delete(waiter);
          clearTimeout(timer);
          rejectRow(error);
        },
      };
      const timer = setTimeout(() => waiter.reject(new Error(`Timed out waiting for ${description}`)), remaining);
      waiters.add(waiter);
    });
  }

  async function request(type, fields = {}) {
    if (child.exitCode !== null || child.stdin.destroyed || !child.stdin.writable) {
      throw new Error(`Pi RPC stdin closed before ${type} request`);
    }
    const id = `retention-smoke-${++nextRequestId}`;
    const response = waitForRow((row) => row?.type === "response" && row.id === id, `${type} response`);
    child.stdin.write(`${JSON.stringify({ type, ...fields, id })}\n`);
    return response;
  }

  const result = {
    value: undefined,
    error: undefined,
    code: undefined,
    signal: undefined,
    timedOut: false,
    duration_ms: 0,
    stdout: "",
    stderr: "",
    nonJsonLines: [],
    rows,
  };

  async function waitForCloseWithin(milliseconds) {
    let timer;
    const timeoutPromise = new Promise((resolveClose) => {
      timer = setTimeout(() => resolveClose(undefined), Math.max(1, milliseconds));
    });
    const closeResult = await Promise.race([closed, timeoutPromise]);
    clearTimeout(timer);
    return closeResult;
  }

  try {
    result.value = await scenario({ request, waitForRow, rows });
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    if (child.exitCode === null && child.signalCode === null && child.stdin.writable) child.stdin.end();
    let closeResult;
    if (Date.now() < deadline) {
      closeResult = await waitForCloseWithin(deadline - Date.now());
    }
    if (!closeResult && child.exitCode === null && child.signalCode === null) {
      timedOut = timedOut || Date.now() >= deadline;
      child.kill();
      closeResult = await waitForCloseWithin(cleanupGraceMs);
      if (!closeResult && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
    clearTimeout(timeout);
    result.code = closeResult?.code ?? child.exitCode ?? undefined;
    result.signal = closeResult?.signal ?? child.signalCode ?? undefined;
    result.timedOut = timedOut;
    result.duration_ms = Date.now() - startedAt;
    result.stdout = stdout + (partialLine ? `${partialLine}\n` : "");
    result.stderr = stderr;
    result.nonJsonLines = nonJsonLines;
    result.rows = rows;
    if (childError) result.error ??= childError.message;
    if (result.code === undefined && !result.error) result.error = "Pi RPC process did not exit before its deadline";
  }
  return result;
}

async function runCase(name, sandbox, project, agentDir, scenario) {
  const host = await runPiHost(project, agentDir, scenario);
  const fullOutput = `${host.stdout}${host.stderr}`;
  const extensionErrors = host.rows.filter((row) => row?.type === "extension_error");
  const observations = redactEvidence(host.value?.observations ?? host.value ?? {}, sandbox);
  const capturedOutput = JSON.stringify(redactEvidence({
    rpc_rows: host.rows,
    stdout_non_json: host.nonJsonLines,
    stderr: host.stderr,
  }, sandbox));
  const assertions = behaviorAssertions(name, {
    ...observations,
    exit_code: host.code,
    fullOutput: capturedOutput,
    extensionErrors: redactEvidence(extensionErrors, sandbox),
  });
  const unhandledError = UNHANDLED_ERROR_PATTERN.test(fullOutput);
  const extensionLoadError = EXTENSION_LOAD_ERROR_PATTERN.test(fullOutput) || extensionErrors.length > 0;
  return {
    name,
    command: "npm run smoke:pi",
    exit_code: host.code ?? 1,
    passed: host.code === 0 && !host.error && !host.timedOut && !unhandledError && !extensionLoadError && assertions.every((item) => item.passed),
    evidence: JSON.stringify(redactEvidence({
      sandbox: "isolated temporary project and Pi config; removed after this run",
      redaction: "Local checkout and temporary project paths are replaced in captured evidence.",
      duration_ms: host.duration_ms,
      timed_out: host.timedOut,
      process_error: host.error ?? null,
      signal: host.signal ?? null,
      observations,
      assertions,
      captured_output: capturedOutput.slice(-6000) || "<no process output>",
    }, sandbox)),
    assertions,
    errors: { unhandledError, extensionLoadError },
  };
}

async function withSandbox(withPackage, action) {
  const sandbox = mkdtempSync(join(tmpdir(), "pi-retention-smoke-"));
  const project = createProject(sandbox, withPackage);
  const agentDir = join(sandbox, "agent");
  mkdirSync(agentDir, { recursive: true });
  try {
    return await action(sandbox, project, agentDir);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

async function initAndReport(session) {
  const commandsResponse = await session.request("get_commands");
  if (commandsResponse.success !== true) throw new Error(`get_commands failed: ${commandsResponse.error}`);
  const initPrompt = await session.request("prompt", { message: "/retention:init" });
  if (initPrompt.success !== true) throw new Error(`retention:init failed: ${initPrompt.error}`);
  const initNotification = await session.waitForRow((row) => row?.type === "extension_ui_request"
    && row.method === "notify" && typeof row.message === "string" && row.message.includes("Retention initialized:"), "retention:init notification");
  const reportPrompt = await session.request("prompt", { message: "/retention:report" });
  if (reportPrompt.success !== true) throw new Error(`retention:report failed: ${reportPrompt.error}`);
  const reportNotification = await session.waitForRow((row) => row?.type === "extension_ui_request"
    && row.method === "notify" && typeof row.message === "string" && row.message.includes("pi-retention-smoke-extension"), "retention:report feature notification");
  return {
    commands: commandsResponse.data?.commands ?? [],
    initPrompt,
    initNotification,
    prompt: reportPrompt,
    notifications: [initNotification, reportNotification],
  };
}

function hostShellCase() {
  const expectedVersion = SDK_VERSIONS["@earendil-works/pi-coding-agent"];
  let result;
  if (process.platform === "win32") {
    const quote = (value) => `'${value.replaceAll("'", "''")}'`;
    const shell = resolve(process.env.SystemRoot ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
    const command = `& ${quote(process.execPath)} ${quote(piCli)} --no-extensions --version; exit $LASTEXITCODE`;
    result = spawnSync(shell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], {
      cwd: root,
      encoding: "utf8",
      timeout: commandTimeoutMs,
      windowsHide: true,
    });
  } else {
    result = spawnSync("/bin/sh", ["-c", '"$1" "$2" --no-extensions --version', "pi-retention-host-shell", process.execPath, piCli], {
      cwd: root,
      encoding: "utf8",
      timeout: commandTimeoutMs,
    });
  }
  const fullOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const exitCode = result.status ?? 1;
  const assertions = behaviorAssertions("host_shell", { exit_code: exitCode, fullOutput });
  return {
    name: "host_shell",
    command: "npm run smoke:pi",
    exit_code: exitCode,
    passed: exitCode === 0 && !result.error && assertions.every((item) => item.passed),
    evidence: JSON.stringify({
      shell: process.platform === "win32" ? "Windows PowerShell" : "/bin/sh",
      duration_ms: result.error?.code === "ETIMEDOUT" ? commandTimeoutMs : undefined,
      process_error: result.error?.message ?? null,
      assertions,
      captured_output: fullOutput.slice(-6000) || "<no process output>",
    }),
    assertions,
    errors: { unhandledError: UNHANDLED_ERROR_PATTERN.test(fullOutput), extensionLoadError: EXTENSION_LOAD_ERROR_PATTERN.test(fullOutput) },
  };
}

const cases = [];
try {
  cases.push(await withSandbox(false, async (_sandbox, project, agentDir) => runCase(
    "extension_load", _sandbox, project, agentDir, async (session) => {
      const response = await session.request("get_commands");
      if (response.success !== true) throw new Error(`get_commands failed: ${response.error}`);
      const manifestExists = (() => {
        try {
          readFileSync(join(project, ".pi", ".pi-retention-project.yaml"), "utf8");
          return true;
        } catch {
          return false;
        }
      })();
      return Object.assign({ commands: response.data?.commands ?? [], manifestExists }, {
        observations: { commands: response.data?.commands ?? [], manifestExists },
      });
    },
  )));

  cases.push(await withSandbox(true, async (_sandbox, project, agentDir) => runCase(
    "happy_path", _sandbox, project, agentDir, async (session) => {
      const result = await initAndReport(session);
      return { ...result, observations: { ...result } };
    },
  )));

  cases.push(await withSandbox(false, async (_sandbox, project, agentDir) => runCase(
    "error_path", _sandbox, project, agentDir, async (session) => {
      const commandsResponse = await session.request("get_commands");
      if (commandsResponse.success !== true) throw new Error(`get_commands failed: ${commandsResponse.error}`);
      const prompt = await session.request("prompt", { message: "/retention:confirm" });
      if (prompt.success !== true) throw new Error(`retention:confirm failed: ${prompt.error}`);
      const handledNotification = await session.waitForRow((row) => row?.type === "extension_ui_request"
        && row.method === "notify" && row.message === "No expired candidate found.", "empty retention:confirm notification");
      const manifestPath = join(project, ".pi", ".pi-retention-project.yaml");
      const manifest = readFileSync(manifestPath, "utf8");
      const recordCount = /^records:\s*\[\s*\]\s*$/m.test(manifest) ? 0 : (manifest.match(/^  - id:/gm) ?? []).length;
      const observations = {
        commands: commandsResponse.data?.commands ?? [],
        prompt,
        notifications: [handledNotification],
        recordCount,
      };
      return { ...observations, observations };
    },
  )));

  cases.push(await withSandbox(true, async (_sandbox, project, agentDir) => {
    const first = await runPiHost(project, agentDir, async (session) => {
      const result = await initAndReport(session);
      return result;
    });
    const firstOutput = `${first.stdout}${first.stderr}`;
    const firstProcessExtensionErrors = first.rows.filter((row) => row?.type === "extension_error");
    const firstProcessUnhandledError = UNHANDLED_ERROR_PATTERN.test(firstOutput);
    const firstProcessExtensionLoadError = EXTENSION_LOAD_ERROR_PATTERN.test(firstOutput) || firstProcessExtensionErrors.length > 0;
    const second = await runCase("reload_cleanup", _sandbox, project, agentDir, async (session) => {
      const commandsResponse = await session.request("get_commands");
      if (commandsResponse.success !== true) throw new Error(`reloaded get_commands failed: ${commandsResponse.error}`);
      const prompt = await session.request("prompt", { message: "/retention:report" });
      if (prompt.success !== true) throw new Error(`reloaded retention:report failed: ${prompt.error}`);
      const reportNotification = await session.waitForRow((row) => row?.type === "extension_ui_request"
        && row.method === "notify" && typeof row.message === "string" && row.message.includes("pi-retention-smoke-extension"), "reloaded retention:report notification");
      const observations = {
        commands: commandsResponse.data?.commands ?? [],
        prompt,
        notifications: [reportNotification],
        firstProcessExitCode: first.code,
        firstProcessDurationMs: first.duration_ms,
        firstProcessExtensionErrors,
        firstProcessUnhandledError,
        firstProcessExtensionLoadError,
        firstProcessRows: first.rows,
      };
      return { ...observations, observations };
    });
    second.errors.unhandledError ||= firstProcessUnhandledError;
    second.errors.extensionLoadError ||= firstProcessExtensionLoadError;
    if (first.code !== 0 || firstProcessUnhandledError || firstProcessExtensionLoadError) {
      second.passed = false;
      second.evidence += ` First host did not exit cleanly: ${JSON.stringify(redactEvidence({ code: first.code, error: first.error, timedOut: first.timedOut, unhandledError: firstProcessUnhandledError, extensionLoadError: firstProcessExtensionLoadError, capturedRows: first.rows, stderr: first.stderr }, _sandbox))}`;
    }
    return second;
  }));

  cases.push(hostShellCase());
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}

const report = {
  schema_version: 1,
  verification_contract: VERIFICATION_CONTRACT,
  sdk_versions: installedVersions,
  platform: process.platform,
  model_inference: "none; actual Pi Retention commands execute in the real offline Pi host",
  extension_load_errors: cases.filter((item) => item.errors.extensionLoadError
    || (item.name === "extension_load" && !item.passed)).length,
  unhandled_errors: cases.filter((item) => item.errors.unhandledError).length,
  cases: cases.map(({ errors, ...item }) => item),
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  verification_contract: VERIFICATION_CONTRACT,
  platform: process.platform,
  cases: cases.map(({ name, passed, exit_code }) => ({ name, passed, exit_code })),
}));
if (cases.length !== 5 || cases.some((item) => !item.passed)) process.exitCode = 1;
