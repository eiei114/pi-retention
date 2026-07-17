import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

const autoReleaseWorkflow = await readFile(
  new URL("../.github/workflows/auto-release.yml", import.meta.url),
  "utf8",
);
const publishWorkflow = await readFile(
  new URL("../.github/workflows/publish.yml", import.meta.url),
  "utf8",
);
const examplesDoc = await readFile(
  new URL("../docs/examples.md", import.meta.url),
  "utf8",
);

test("package declares only the extension runtime surface", () => {
  assert.deepEqual(packageJson.pi.extensions, ["./extensions"]);
  assert.ok(!packageJson.pi.skills);
  assert.ok(!packageJson.pi.prompts);
  assert.ok(!packageJson.pi.themes);
});

test("package metadata points at pi-retention", () => {
  assert.equal(packageJson.name, "pi-retention");
  assert.match(packageJson.repository.url, /pi-retention/);
});

test("package uses public publish config", () => {
  assert.equal(packageJson.publishConfig.access, "public");
});

test("examples doc documents retention commands instead of template placeholders", () => {
  const staleTemplateMarkers = [
    "template-hello",
    "extensions/hello.ts",
    "example-skill",
    "template-info",
    "lib/greeting.ts",
  ];

  for (const marker of staleTemplateMarkers) {
    assert.doesNotMatch(examplesDoc, new RegExp(marker));
  }

  assert.match(examplesDoc, /retention:init/);
  assert.match(examplesDoc, /retention:report/);
  assert.match(examplesDoc, /retention:confirm/);
});

test("template includes npm release workflow handoff", () => {
  assert.match(autoReleaseWorkflow, /actions:\s*write/);
  assert.match(autoReleaseWorkflow, /contents:\s*write/);
  assert.match(autoReleaseWorkflow, /gh workflow run publish\.yml/);
  assert.match(publishWorkflow, /id-token:\s*write/);
  assert.match(publishWorkflow, /workflow_dispatch:/);
  assert.match(publishWorkflow, /npm publish --access public/);
});
