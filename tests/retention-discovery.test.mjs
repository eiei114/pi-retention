import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const {
  PACKAGE_NAME,
  discoverPackages,
  loadSyncedProjectRetention,
  parsePackageMetadata,
  saveManifestAndSidecars,
} = await import("../lib/retention.ts");

test("parsePackageMetadata prefers package name and detects skills", () => {
  assert.deepEqual(parsePackageMetadata({ name: "pi-demo" }, "/tmp/demo"), {
    packageName: "pi-demo",
    kind: "extension",
  });
  assert.deepEqual(parsePackageMetadata({ name: "pi-skill", pi: { skills: ["./skills/demo"] } }, "/tmp/skill"), {
    packageName: "pi-skill",
    kind: "skill",
  });
  assert.deepEqual(parsePackageMetadata(undefined, "/tmp/fallback"), {
    packageName: "fallback",
    kind: "extension",
  });
});

test("discoverPackages reads package metadata once per local root", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pi-retention-discovery-"));
  const packageRoot = join(projectRoot, "packages", "demo-skill");
  await mkdir(join(projectRoot, ".pi"), { recursive: true });
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(projectRoot, ".pi", "settings.json"),
    JSON.stringify({ packages: ["./packages/demo-skill"] }),
    "utf8",
  );
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({ name: "pi-demo-skill", pi: { skills: ["./skills/demo"] } }),
    "utf8",
  );

  const discoveries = await discoverPackages(projectRoot);
  assert.equal(discoveries.length, 1);
  assert.equal(discoveries[0].packageName, "pi-demo-skill");
  assert.equal(discoveries[0].kind, "skill");
  assert.equal(discoveries[0].entry, "./packages/demo-skill");
});

test("loadSyncedProjectRetention bumps usage for the package alias", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pi-retention-sync-"));
  const manifest = {
    version: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
    defaults: { skillTtlDays: 30, extensionTtlDays: 90 },
    records: [
      {
        id: "self",
        kind: "extension",
        packageName: PACKAGE_NAME,
        displayName: PACKAGE_NAME,
        rootPath: projectRoot,
        ttlDays: 90,
        usageCount: 2,
        lastUsedAt: "2026-01-01T00:00:00.000Z",
        dueAt: "2026-04-01T00:00:00.000Z",
        pinned: false,
        state: "active",
      },
    ],
  };

  await saveManifestAndSidecars(projectRoot, manifest);
  const synced = await loadSyncedProjectRetention(projectRoot, PACKAGE_NAME);
  const record = synced.records.find((entry) => entry.packageName === PACKAGE_NAME);

  assert.equal(record?.usageCount, 3);
});
