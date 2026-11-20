import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import test from "node:test";

const { default: registerExtension } = await import("../extensions/index.ts");
const { addDays, getSidecarPath, loadManifest, saveManifestAndSidecars } = await import("../lib/retention.ts");

function registerHandlers() {
  const events = new Map();
  registerExtension({
    on: (name, handler) => events.set(name, handler),
    registerCommand: () => {},
  });
  return events;
}

test("tool_call synchronizes matching package usage and ignores unrelated tools", async (t) => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pi-retention-tool-call-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));

  const packageRoot = join(projectRoot, "packages", "tracked-extension");
  const record = {
    id: "tracked-extension",
    kind: "extension",
    packageName: "pi-tracked-extension",
    displayName: "Tracked Extension",
    rootPath: packageRoot,
    ttlDays: 37,
    usageCount: 4,
    lastUsedAt: "2026-02-01T12:30:00.000Z",
    dueAt: "2026-03-10T12:30:00.000Z",
    pinned: false,
    state: "active",
  };

  await mkdir(join(projectRoot, ".pi"), { recursive: true });
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name: record.packageName }), "utf8");
  await writeFile(join(projectRoot, ".pi", "settings.json"), JSON.stringify({ packages: ["./packages/tracked-extension"] }), "utf8");
  await saveManifestAndSidecars(projectRoot, {
    version: 1,
    updatedAt: record.lastUsedAt,
    defaults: { skillTtlDays: 30, extensionTtlDays: 90 },
    records: [record],
  });

  const events = registerHandlers();
  const onToolCall = events.get("tool_call");
  assert.equal(typeof onToolCall, "function");
  const ctx = { cwd: projectRoot };

  const beforeMatchingCall = Date.now();
  await onToolCall({ toolName: "pi-tracked-extension:run" }, ctx);
  const afterMatchingCall = Date.now();

  const manifestAfterMatch = await loadManifest(projectRoot);
  const trackedAfterMatch = manifestAfterMatch.records.find(({ id }) => id === record.id);
  const sidecarAfterMatch = parseYaml(await readFile(getSidecarPath(packageRoot), "utf8"));
  assert.ok(trackedAfterMatch);
  assert.equal(trackedAfterMatch.usageCount, record.usageCount + 1);
  assert.ok(Date.parse(trackedAfterMatch.lastUsedAt) >= beforeMatchingCall);
  assert.ok(Date.parse(trackedAfterMatch.lastUsedAt) <= afterMatchingCall);
  assert.equal(trackedAfterMatch.dueAt, addDays(trackedAfterMatch.lastUsedAt, record.ttlDays));
  assert.deepEqual(
    {
      usageCount: sidecarAfterMatch.usageCount,
      lastUsedAt: sidecarAfterMatch.lastUsedAt,
      dueAt: sidecarAfterMatch.dueAt,
    },
    {
      usageCount: trackedAfterMatch.usageCount,
      lastUsedAt: trackedAfterMatch.lastUsedAt,
      dueAt: trackedAfterMatch.dueAt,
    },
  );

  const beforeNonmatchingCall = structuredClone(trackedAfterMatch);
  await onToolCall({ toolName: "unrelated-tool:run" }, ctx);

  const manifestAfterNonmatch = await loadManifest(projectRoot);
  const trackedAfterNonmatch = manifestAfterNonmatch.records.find(({ id }) => id === record.id);
  const sidecarAfterNonmatch = parseYaml(await readFile(getSidecarPath(packageRoot), "utf8"));
  assert.deepEqual(trackedAfterNonmatch, beforeNonmatchingCall);
  assert.deepEqual(sidecarAfterNonmatch, sidecarAfterMatch);
});
