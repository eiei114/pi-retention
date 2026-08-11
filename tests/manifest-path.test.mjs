import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const {
  getManifestPath,
  getPreferredManifestPath,
  getLegacyManifestPath,
  loadManifest,
  saveManifest,
  createEmptyManifest,
} = await import("../lib/retention.ts");

test("getManifestPath returns the preferred .pi location", () => {
  const root = "/tmp/project";
  assert.equal(
    getManifestPath(root),
    join(root, ".pi", ".pi-retention-project.yaml"),
  );
  assert.equal(getManifestPath(root), getPreferredManifestPath(root));
});

test("loadManifest prefers .pi/.pi-retention-project.yaml over legacy root file", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pi-retention-manifest-"));
  const preferred = getPreferredManifestPath(projectRoot);
  const legacy = getLegacyManifestPath(projectRoot);

  await mkdir(join(projectRoot, ".pi"), { recursive: true });
  await writeFile(legacy, "version: 1\nupdatedAt: legacy\nrecords: []\n", "utf8");
  await writeFile(preferred, "version: 1\nupdatedAt: preferred\nrecords: []\n", "utf8");

  const manifest = await loadManifest(projectRoot);
  assert.equal(manifest.updatedAt, "preferred");
});

test("loadManifest migrates a legacy root manifest to the preferred path", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pi-retention-manifest-"));
  const legacy = getLegacyManifestPath(projectRoot);
  const preferred = getPreferredManifestPath(projectRoot);

  await writeFile(
    legacy,
    "version: 1\nupdatedAt: legacy-only\ndefaults:\n  skillTtlDays: 14\n  extensionTtlDays: 45\nrecords:\n  - id: legacy\n    kind: skill\n    packageName: legacy-skill\n    displayName: Legacy Skill\n    rootPath: /tmp/legacy-skill\n    ttlDays: 14\n    usageCount: 3\n    lastUsedAt: 2026-01-01T00:00:00.000Z\n    dueAt: 2026-01-15T00:00:00.000Z\n    pinned: false\n    state: active\n",
    "utf8",
  );
  const legacyText = await readFile(legacy, "utf8");

  const manifest = await loadManifest(projectRoot);
  assert.equal(manifest.updatedAt, "legacy-only");
  assert.equal(manifest.defaults.skillTtlDays, 14);
  assert.equal(manifest.records[0].id, "legacy");
  await access(preferred);
  assert.equal(await readFile(preferred, "utf8"), legacyText);
  await assert.rejects(access(legacy));
});

test("saveManifest writes to preferred path for new projects", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pi-retention-manifest-"));
  const preferred = getPreferredManifestPath(projectRoot);
  const legacy = getLegacyManifestPath(projectRoot);
  const manifest = createEmptyManifest();

  await saveManifest(projectRoot, manifest);

  await access(preferred);
  await assert.rejects(access(legacy));
  const text = await readFile(preferred, "utf8");
  assert.match(text, /version: 1/);
});

test("saveManifest updates a migrated legacy manifest at the preferred path", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pi-retention-manifest-"));
  const preferred = getPreferredManifestPath(projectRoot);
  const legacy = getLegacyManifestPath(projectRoot);

  await writeFile(legacy, "version: 1\nupdatedAt: before\nrecords: []\n", "utf8");

  const manifest = await loadManifest(projectRoot);
  manifest.records = [{ id: "demo", kind: "skill", packageName: "demo", displayName: "demo", rootPath: projectRoot, ttlDays: 30, usageCount: 0, lastUsedAt: "2026-01-01T00:00:00.000Z", dueAt: "2026-02-01T00:00:00.000Z", pinned: false, state: "active" }];
  await saveManifest(projectRoot, manifest);

  await access(preferred);
  await assert.rejects(access(legacy));
  const text = await readFile(preferred, "utf8");
  assert.match(text, /displayName: demo/);
});
