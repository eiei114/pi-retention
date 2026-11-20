import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import test from "node:test";

const { default: registerExtension } = await import("../extensions/index.ts");
const { getSidecarPath, loadManifest, saveManifestAndSidecars } = await import("../lib/retention.ts");

function registerCommands() {
  const commands = new Map();
  registerExtension({
    on: () => {},
    registerCommand: (name, command) => commands.set(name, command),
  });
  return commands;
}

test("registered pin and unpin commands persist state without moving the package", async (t) => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pi-retention-pin-unpin-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));

  const packageEntry = "./packages/tracked-extension";
  const packageRoot = join(projectRoot, "packages", "tracked-extension");
  const packageMarker = join(packageRoot, "artifact.txt");
  const settingsPath = join(projectRoot, ".pi", "settings.json");
  const record = {
    id: "tracked-extension",
    kind: "extension",
    packageName: "pi-tracked-extension",
    displayName: "Tracked Extension",
    rootPath: packageRoot,
    ttlDays: 37,
    usageCount: 4,
    lastUsedAt: "2026-02-01T12:30:00.000Z",
    dueAt: "2026-07-15T12:30:00.000Z",
    pinned: false,
    state: "active",
    originalPackageEntry: packageEntry,
  };

  await mkdir(join(projectRoot, ".pi"), { recursive: true });
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name: record.packageName }), "utf8");
  await writeFile(packageMarker, "registered package stays put", "utf8");
  await writeFile(settingsPath, `${JSON.stringify({ packages: [packageEntry] }, null, 2)}\n`, "utf8");
  await saveManifestAndSidecars(projectRoot, {
    version: 1,
    updatedAt: "2026-02-01T12:30:00.000Z",
    defaults: { skillTtlDays: 30, extensionTtlDays: 90 },
    records: [record],
  });

  const commands = registerCommands();
  const selections = [];
  const ctx = {
    cwd: projectRoot,
    hasUI: true,
    ui: {
      select: async (title, options) => {
        selections.push({ title, options });
        return options[0];
      },
      notify: () => {},
    },
  };

  assert.equal(typeof commands.get("retention:pin")?.handler, "function");
  assert.equal(typeof commands.get("retention:unpin")?.handler, "function");

  await commands.get("retention:pin").handler("", ctx);

  let manifest = await loadManifest(projectRoot);
  let manifestRecord = manifest.records.find(({ id }) => id === record.id);
  let sidecar = parseYaml(await readFile(getSidecarPath(packageRoot), "utf8"));
  assert.equal(manifestRecord.pinned, true);
  assert.equal(manifestRecord.dueAt, record.dueAt);
  assert.equal(sidecar.pinned, true);
  assert.equal(sidecar.dueAt, record.dueAt);
  assert.equal(selections[0].options.length, 1);
  assert.match(selections[0].options[0], /pi-tracked-extension · extension · active · free/);
  await access(packageRoot);
  assert.equal(await readFile(packageMarker, "utf8"), "registered package stays put");
  assert.deepEqual(JSON.parse(await readFile(settingsPath, "utf8")).packages, [packageEntry]);

  await commands.get("retention:unpin").handler("", ctx);

  manifest = await loadManifest(projectRoot);
  manifestRecord = manifest.records.find(({ id }) => id === record.id);
  sidecar = parseYaml(await readFile(getSidecarPath(packageRoot), "utf8"));
  const expectedDueAt = "2026-03-10T12:30:00.000Z";
  assert.equal(manifestRecord.pinned, false);
  assert.equal(manifestRecord.dueAt, expectedDueAt);
  assert.equal(sidecar.pinned, false);
  assert.equal(sidecar.dueAt, expectedDueAt);
  assert.equal(manifestRecord.lastUsedAt, record.lastUsedAt);
  assert.equal(sidecar.lastUsedAt, record.lastUsedAt);
  assert.equal(selections.length, 2);
  assert.match(selections[1].title, /Unpin/);
  assert.match(selections[1].options[0], /pi-tracked-extension · extension · active · pin/);
  await access(packageRoot);
  assert.equal(await readFile(packageMarker, "utf8"), "registered package stays put");
  assert.deepEqual(JSON.parse(await readFile(settingsPath, "utf8")).packages, [packageEntry]);
});
