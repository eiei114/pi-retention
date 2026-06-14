import assert from "node:assert/strict";
import test from "node:test";

const { formatReport } = await import("../lib/retention.ts");

test("formatReport handles empty manifests", () => {
  const text = formatReport({
    version: 1,
    updatedAt: "2026-06-14T00:00:00.000Z",
    defaults: { skillTtlDays: 30, extensionTtlDays: 90 },
    records: [],
  });

  assert.match(text, /Retention report/);
  assert.match(text, /no local roots tracked/);
});
