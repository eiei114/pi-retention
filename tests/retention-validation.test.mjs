import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const {
  quarantineRecord,
  restoreRecord,
  purgeRecord,
  SELF_ROOT,
} = await import("../lib/retention.ts");

function activeRecord(overrides = {}) {
  return {
    id: "demo",
    kind: "extension",
    packageName: "pi-demo",
    displayName: "Demo",
    rootPath: "/tmp/demo",
    ttlDays: 90,
    usageCount: 0,
    lastUsedAt: "2026-01-01T00:00:00.000Z",
    dueAt: "2026-04-01T00:00:00.000Z",
    pinned: false,
    state: "active",
    ...overrides,
  };
}

test("quarantineRecord rejects self-protected roots", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pi-retention-validation-"));
  const record = activeRecord({ rootPath: SELF_ROOT, packageName: "pi-retention" });

  await assert.rejects(
    () => quarantineRecord(projectRoot, record),
    /self-protected roots cannot be quarantined/,
  );
});

test("restoreRecord rejects records that are not quarantined", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pi-retention-validation-"));

  await assert.rejects(
    () => restoreRecord(projectRoot, activeRecord()),
    /record is not quarantined/,
  );

  await assert.rejects(
    () => restoreRecord(projectRoot, activeRecord({ state: "quarantined" })),
    /record is not quarantined/,
  );
});

test("purgeRecord rejects active records and quarantined records without trash path", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pi-retention-validation-"));

  await assert.rejects(
    () => purgeRecord(projectRoot, activeRecord()),
    /only quarantined records can be purged/,
  );

  await assert.rejects(
    () => purgeRecord(projectRoot, activeRecord({ state: "quarantined" })),
    /only quarantined records can be purged/,
  );
});
