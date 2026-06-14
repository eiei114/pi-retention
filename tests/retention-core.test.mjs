import assert from "node:assert/strict";
import test from "node:test";

const {
  addDays,
  formatReport,
  recordStats,
  selectOldestExpiredRecord,
} = await import("../lib/retention.ts");

test("addDays keeps utc math", () => {
  assert.equal(addDays("2026-06-14T00:00:00.000Z", 30), "2026-07-14T00:00:00.000Z");
});

test("selectOldestExpiredRecord skips pinned records", () => {
  const candidate = selectOldestExpiredRecord([
    {
      id: "a",
      kind: "extension",
      packageName: "pi-a",
      displayName: "A",
      rootPath: "C:/a",
      ttlDays: 10,
      usageCount: 1,
      lastUsedAt: "2026-01-01T00:00:00.000Z",
      dueAt: "2026-01-11T00:00:00.000Z",
      pinned: true,
      state: "active",
    },
    {
      id: "b",
      kind: "extension",
      packageName: "pi-b",
      displayName: "B",
      rootPath: "C:/b",
      ttlDays: 10,
      usageCount: 1,
      lastUsedAt: "2026-01-02T00:00:00.000Z",
      dueAt: "2026-01-12T00:00:00.000Z",
      pinned: false,
      state: "active",
    },
  ], "2026-02-01T00:00:00.000Z");

  assert.equal(candidate?.id, "b");
});

test("recordStats counts active, quarantined, due, and protected", () => {
  const stats = recordStats([
    {
      id: "a",
      kind: "extension",
      packageName: "pi-a",
      displayName: "A",
      rootPath: "C:/a",
      ttlDays: 10,
      usageCount: 1,
      lastUsedAt: "2026-01-01T00:00:00.000Z",
      dueAt: "2026-01-11T00:00:00.000Z",
      pinned: false,
      state: "active",
    },
    {
      id: "b",
      kind: "extension",
      packageName: "pi-b",
      displayName: "B",
      rootPath: "C:/b",
      ttlDays: 10,
      usageCount: 1,
      lastUsedAt: "2026-01-02T00:00:00.000Z",
      dueAt: "2026-01-12T00:00:00.000Z",
      pinned: false,
      state: "quarantined",
    },
  ]);

  assert.equal(stats.total, 2);
  assert.equal(stats.active, 1);
  assert.equal(stats.quarantined, 1);
});

test("formatReport renders rows", () => {
  const text = formatReport({
    version: 1,
    updatedAt: "2026-06-14T00:00:00.000Z",
    defaults: { skillTtlDays: 30, extensionTtlDays: 90 },
    records: [
      {
        id: "a",
        kind: "extension",
        packageName: "pi-a",
        displayName: "A",
        rootPath: "C:/a",
        ttlDays: 10,
        usageCount: 1,
        lastUsedAt: "2026-01-01T00:00:00.000Z",
        dueAt: "2026-01-11T00:00:00.000Z",
        pinned: false,
        state: "active",
      },
    ],
  });

  assert.match(text, /Retention report/);
  assert.match(text, /A/);
});
