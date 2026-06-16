import assert from "node:assert/strict";
import test from "node:test";

const {
  compareStartupCandidates,
  formatReport,
  isStartupCandidate,
  recordReportStatus,
  selectOldestExpiredRecord,
  SELF_ROOT,
} = await import("../lib/retention.ts");

const NOW = "2026-02-01T00:00:00.000Z";

function record(overrides) {
  return {
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
    ...overrides,
  };
}

test("isStartupCandidate excludes pinned, quarantined, and not-yet-due records", () => {
  assert.equal(isStartupCandidate(record({ pinned: true }), NOW), false);
  assert.equal(isStartupCandidate(record({ state: "quarantined" }), NOW), false);
  assert.equal(isStartupCandidate(record({ dueAt: "2026-03-01T00:00:00.000Z" }), NOW), false);
  assert.equal(isStartupCandidate(record({ rootPath: SELF_ROOT }), NOW), false);
  assert.equal(isStartupCandidate(record({}), NOW), true);
});

test("selectOldestExpiredRecord orders by due date then age", () => {
  const candidate = selectOldestExpiredRecord([
    record({
      id: "newer-due",
      displayName: "Newer Due",
      dueAt: "2026-01-20T00:00:00.000Z",
      lastUsedAt: "2026-01-01T00:00:00.000Z",
    }),
    record({
      id: "older-due",
      displayName: "Older Due",
      dueAt: "2026-01-10T00:00:00.000Z",
      lastUsedAt: "2026-01-05T00:00:00.000Z",
    }),
    record({
      id: "same-due-older-age",
      displayName: "Same Due Older Age",
      dueAt: "2026-01-10T00:00:00.000Z",
      lastUsedAt: "2025-12-01T00:00:00.000Z",
    }),
  ], NOW);

  assert.equal(candidate?.id, "same-due-older-age");
});

test("compareStartupCandidates matches selectOldestExpiredRecord ordering", () => {
  const records = [
    record({ id: "b", dueAt: "2026-01-12T00:00:00.000Z", lastUsedAt: "2026-01-02T00:00:00.000Z" }),
    record({ id: "a", dueAt: "2026-01-11T00:00:00.000Z", lastUsedAt: "2026-01-03T00:00:00.000Z" }),
  ];

  const sorted = [...records].sort(compareStartupCandidates);
  assert.deepEqual(sorted.map((entry) => entry.id), ["a", "b"]);
  assert.equal(selectOldestExpiredRecord(records, NOW)?.id, "a");
});

test("selectOldestExpiredRecord returns at most one candidate", () => {
  const records = [
    record({ id: "a", dueAt: "2026-01-10T00:00:00.000Z" }),
    record({ id: "b", dueAt: "2026-01-11T00:00:00.000Z" }),
    record({ id: "c", dueAt: "2026-01-12T00:00:00.000Z", state: "quarantined" }),
    record({ id: "d", dueAt: "2026-01-09T00:00:00.000Z", pinned: true }),
  ];

  const candidate = selectOldestExpiredRecord(records, NOW);
  assert.equal(candidate?.id, "a");
});

test("recordReportStatus marks pinned and quarantined rows", () => {
  assert.equal(recordReportStatus(record({ pinned: true }), NOW), "P");
  assert.equal(recordReportStatus(record({ state: "quarantined" }), NOW), "Q");
  assert.equal(recordReportStatus(record({ dueAt: "2026-03-01T00:00:00.000Z" }), NOW), "A");
  assert.equal(recordReportStatus(record({}), NOW), "!");
});

test("formatReport highlights startup candidate and status legend", () => {
  const text = formatReport({
    version: 1,
    updatedAt: NOW,
    defaults: { skillTtlDays: 30, extensionTtlDays: 90 },
    records: [
      record({
        id: "due",
        displayName: "Due Item",
        dueAt: "2026-01-10T00:00:00.000Z",
      }),
      record({
        id: "pinned",
        displayName: "Pinned Item",
        pinned: true,
        dueAt: "2026-01-01T00:00:00.000Z",
      }),
      record({
        id: "quarantined",
        displayName: "Quarantined Item",
        state: "quarantined",
        quarantinePath: "C:/trash/quarantined",
      }),
    ],
  }, NOW);

  assert.match(text, /startup candidate \(one per launch\): Due Item/);
  assert.match(text, /status: A=active !=due P=pinned Q=quarantined/);
  assert.match(text, />! Due Item/);
  assert.match(text, / P Pinned Item/);
  assert.match(text, / Q Quarantined Item/);
});
