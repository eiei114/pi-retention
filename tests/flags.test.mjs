import assert from "node:assert/strict";
import test from "node:test";

const { hasFlag } = await import("../lib/flags.ts");

test("hasFlag returns true when the flag is present", () => {
  assert.equal(hasFlag("--due", "--due"), true);
  assert.equal(hasFlag("  --due  ", "--due"), true);
});

test("hasFlag returns false for unrelated flags or non-string args", () => {
  assert.equal(hasFlag("--verbose", "--due"), false);
  assert.equal(hasFlag("", "--due"), false);
  assert.equal(hasFlag(undefined, "--due"), false);
  assert.equal(hasFlag(null, "--due"), false);
});

test("hasFlag handles multi-token argument strings", () => {
  assert.equal(hasFlag("retention:report --due", "--due"), true);
  assert.equal(hasFlag("--verbose --due --json", "--due"), true);
  assert.equal(hasFlag("--verbose --json", "--due"), false);
});
