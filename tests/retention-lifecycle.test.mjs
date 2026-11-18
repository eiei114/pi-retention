import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import test from "node:test";

const {
  addDays,
  getLogPath,
  getSidecarPath,
  getTrashDir,
  quarantineRecord,
  restoreRecord,
  purgeRecord,
  SELF_ROOT,
} = await import("../lib/retention.ts");

function activeRecord(overrides = {}) {
  return {
    id: "demo-extension",
    kind: "extension",
    packageName: "pi-demo-extension",
    displayName: "Demo Extension",
    rootPath: "/tmp/demo-extension",
    ttlDays: 90,
    usageCount: 2,
    lastUsedAt: "2026-01-01T00:00:00.000Z",
    dueAt: "2026-04-01T00:00:00.000Z",
    pinned: false,
    state: "active",
    ...overrides,
  };
}

async function readSettings(projectRoot) {
  return JSON.parse(await readFile(join(projectRoot, ".pi", "settings.json"), "utf8"));
}

async function readSidecar(path) {
  return parseYaml(await readFile(getSidecarPath(path), "utf8"));
}

test("quarantine, restore, and purge keep the package, sidecar, and log in sync", async (t) => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pi-retention-lifecycle-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));

  const packageEntry = "./packages/demo-extension";
  const packageRoot = join(projectRoot, "packages", "demo-extension");
  const markerPath = join(packageRoot, "artifact.txt");
  const settingsPath = join(projectRoot, ".pi", "settings.json");
  const manifestPath = join(projectRoot, ".pi", ".pi-retention-project.yaml");
  const record = activeRecord({ rootPath: packageRoot, originalPackageEntry: packageEntry });
  const manifestContents = JSON.stringify({
    version: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
    defaults: { skillTtlDays: 30, extensionTtlDays: 90 },
    records: [record],
  }, null, 2) + "\n";

  await mkdir(join(projectRoot, ".pi"), { recursive: true });
  await mkdir(packageRoot, { recursive: true });
  await writeFile(markerPath, "artifact survives restore", "utf8");
  await writeFile(settingsPath, JSON.stringify({ packages: [packageEntry, "./packages/other"] }, null, 2), "utf8");
  await writeFile(manifestPath, manifestContents, "utf8");

  await quarantineRecord(projectRoot, record);

  const firstTrashPath = record.quarantinePath;
  assert.equal(record.state, "quarantined");
  assert.ok(firstTrashPath);
  assert.equal(dirname(firstTrashPath), getTrashDir(projectRoot));
  assert.match(basename(firstTrashPath), /^demo-extension-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/);
  await assert.rejects(access(packageRoot));
  assert.equal(await readFile(join(firstTrashPath, "artifact.txt"), "utf8"), "artifact survives restore");
  assert.deepEqual((await readSettings(projectRoot)).packages, ["./packages/other"]);

  const quarantinedSidecar = await readSidecar(firstTrashPath);
  assert.equal(quarantinedSidecar.state, "quarantined");
  assert.equal(quarantinedSidecar.quarantinePath, firstTrashPath);

  const beforeRestore = Date.now();
  await restoreRecord(projectRoot, record);
  const afterRestore = Date.now();

  assert.equal(record.state, "active");
  assert.equal(record.quarantinePath, undefined);
  assert.ok(Date.parse(record.lastUsedAt) >= beforeRestore);
  assert.ok(Date.parse(record.lastUsedAt) <= afterRestore);
  assert.equal(record.dueAt, addDays(record.lastUsedAt, record.ttlDays));
  assert.equal(await readFile(markerPath, "utf8"), "artifact survives restore");
  assert.deepEqual((await readSettings(projectRoot)).packages, ["./packages/other", packageEntry]);

  const restoredSidecar = await readSidecar(packageRoot);
  assert.equal(restoredSidecar.state, "active");
  assert.equal(restoredSidecar.quarantinePath, undefined);
  assert.equal(restoredSidecar.lastUsedAt, record.lastUsedAt);
  assert.equal(restoredSidecar.dueAt, record.dueAt);

  // Restore reactivates the record; quarantine it again to exercise the purge branch.
  await quarantineRecord(projectRoot, record);
  const purgePath = record.quarantinePath;
  assert.ok(purgePath);
  await assert.rejects(access(packageRoot));
  const settingsBeforePurge = await readFile(settingsPath, "utf8");
  const manifestBeforePurge = await readFile(manifestPath, "utf8");

  await purgeRecord(projectRoot, record);

  await assert.rejects(access(purgePath));
  assert.equal(await readFile(settingsPath, "utf8"), settingsBeforePurge);
  assert.equal(await readFile(manifestPath, "utf8"), manifestBeforePurge);

  const logEntries = (await readFile(getLogPath(projectRoot), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(logEntries.map(({ event }) => event), ["confirm", "restore", "confirm", "purge"]);
});

test("quarantine still rejects the self-protected root", async (t) => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pi-retention-self-root-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));

  await assert.rejects(
    () => quarantineRecord(projectRoot, activeRecord({ rootPath: SELF_ROOT, packageName: "pi-retention" })),
    /self-protected roots cannot be quarantined/,
  );
});
