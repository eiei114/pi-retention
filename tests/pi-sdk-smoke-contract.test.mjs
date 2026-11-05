import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { behaviorAssertions, PI_SDK_PACKAGES, SDK_VERSIONS } from "../scripts/pi-sdk-smoke-contract.mjs";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

const registeredCommand = { name: "retention:init", source: "extension" };
const handledPrompt = { success: true, data: { disposition: "handled" } };
const notify = (message) => ({ method: "notify", message });

test("smoke contract follows the manifest Pi SDK pin instead of a version literal", () => {
  for (const name of PI_SDK_PACKAGES) {
    assert.equal(
      SDK_VERSIONS[name],
      packageJson.devDependencies[name],
      `${name} smoke expectation should track the package.json dev pin`,
    );
  }
});

test("smoke assertions accept expected real-host observations and fail closed when outputs are missing", async (t) => {
  await t.test("extension registration", () => {
    const positive = behaviorAssertions("extension_load", { commands: [registeredCommand], manifestExists: true });
    const missing = behaviorAssertions("extension_load", { commands: [], manifestExists: false });
    assert.equal(positive[0].id, "extension_registered");
    assert.equal(positive[0].passed, true);
    assert.equal(missing[0].passed, false);
  });

  await t.test("happy-path feature response", () => {
    const positive = behaviorAssertions("happy_path", {
      prompt: handledPrompt,
      notifications: [notify("pi-retention-smoke-extension active")],
    });
    const missing = behaviorAssertions("happy_path", { prompt: handledPrompt, notifications: [] });
    assert.equal(positive[0].id, "feature_response");
    assert.equal(positive[0].passed, true);
    assert.equal(missing[0].passed, false);
  });

  await t.test("handled empty-state error", () => {
    const positive = behaviorAssertions("error_path", {
      prompt: handledPrompt,
      notifications: [notify("No expired candidate found.")],
      recordCount: 0,
    });
    const missing = behaviorAssertions("error_path", { prompt: handledPrompt, notifications: [], recordCount: 0 });
    assert.equal(positive[0].id, "handled_error");
    assert.equal(positive[0].passed, true);
    assert.equal(missing[0].passed, false);
  });

  await t.test("second-process reload and clean shutdown", () => {
    const observation = {
      commands: [registeredCommand],
      prompt: handledPrompt,
      notifications: [notify("pi-retention-smoke-extension active")],
      firstProcessExitCode: 0,
      exit_code: 0,
      extensionErrors: [],
      fullOutput: "",
    };
    const positive = behaviorAssertions("reload_cleanup", observation);
    const missing = behaviorAssertions("reload_cleanup", {
      ...observation,
      commands: [],
      prompt: undefined,
      notifications: [],
      exit_code: 1,
    });
    assert.deepEqual(positive.map((item) => item.id), [
      "reloaded_extension_registered",
      "reloaded_feature_response",
      "clean_shutdown",
    ]);
    assert.ok(positive.every((item) => item.passed));
    assert.ok(missing.every((item) => !item.passed));
  });

  await t.test("native shell checks the exact pinned CLI version", () => {
    const pinnedCliVersion = `${SDK_VERSIONS["@earendil-works/pi-coding-agent"]}\n`;
    const positive = behaviorAssertions("host_shell", { exit_code: 0, fullOutput: pinnedCliVersion });
    const missing = behaviorAssertions("host_shell", { exit_code: 0, fullOutput: "" });
    const stale = behaviorAssertions("host_shell", { exit_code: 0, fullOutput: "0.0.1\n" });
    assert.equal(positive[0].id, "native_shell_boundary");
    assert.equal(positive[0].passed, true);
    assert.equal(missing[0].passed, false);
    assert.equal(stale[0].passed, false);
  });
});
