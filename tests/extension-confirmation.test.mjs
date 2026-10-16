import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const { default: registerExtension } = await import("../extensions/index.ts");
const { loadManifest, saveManifestAndSidecars } = await import("../lib/retention.ts");

function registerHandlers() {
  const events = new Map();
  const commands = new Map();
  registerExtension({
    on: (name, handler) => events.set(name, handler),
    registerCommand: (name, command) => commands.set(name, command),
  });
  return { events, commands };
}

async function createProject() {
  const projectRoot = await mkdtemp(join(tmpdir(), "pi-retention-confirmation-"));
  const olderRoot = join(projectRoot, "older");
  const newerRoot = join(projectRoot, "newer");
  await mkdir(olderRoot);
  await mkdir(newerRoot);
  const records = [
    {
      id: "older",
      kind: "extension",
      packageName: "pi-older",
      displayName: "Older due",
      rootPath: olderRoot,
      ttlDays: 30,
      usageCount: 1,
      lastUsedAt: "2025-01-01T00:00:00.000Z",
      dueAt: "2025-02-01T00:00:00.000Z",
      pinned: false,
      state: "active",
    },
    {
      id: "newer",
      kind: "extension",
      packageName: "pi-newer",
      displayName: "Newer due",
      rootPath: newerRoot,
      ttlDays: 30,
      usageCount: 1,
      lastUsedAt: "2024-01-01T00:00:00.000Z",
      dueAt: "2025-03-01T00:00:00.000Z",
      pinned: false,
      state: "active",
    },
  ];
  await saveManifestAndSidecars(projectRoot, {
    version: 1,
    updatedAt: "2025-01-01T00:00:00.000Z",
    defaults: { skillTtlDays: 30, extensionTtlDays: 90 },
    records,
  });
  return { projectRoot, olderRoot, newerRoot };
}

for (const flow of ["startup", "retention:confirm"]) {
  test(`${flow} denial keeps the selected oldest candidate active`, async (t) => {
    const { projectRoot, olderRoot, newerRoot } = await createProject();
    t.after(() => rm(projectRoot, { recursive: true, force: true }));

    const { events, commands } = registerHandlers();
    const prompts = [];
    const ctx = {
      cwd: projectRoot,
      hasUI: true,
      ui: {
        confirm: async (title, message) => {
          prompts.push({ title, message });
          return false;
        },
        notify: () => {},
        select: async () => undefined,
      },
    };

    if (flow === "startup") {
      await events.get("session_start")({}, ctx);
    } else {
      await commands.get(flow).handler("", ctx);
    }

    assert.equal(prompts.length, 1);
    assert.match(prompts[0].message, /Older due/);
    assert.doesNotMatch(prompts[0].message, /Newer due/);
    const manifest = await loadManifest(projectRoot);
    assert.deepEqual(manifest.records.map(({ id, state }) => [id, state]).sort(), [
      ["older", "active"],
      ["newer", "active"],
    ].sort());
    assert.ok((await stat(olderRoot)).isDirectory());
    assert.ok((await stat(newerRoot)).isDirectory());
  });

  test(`${flow} confirmation quarantines only the selected oldest candidate`, async (t) => {
    const { projectRoot, olderRoot, newerRoot } = await createProject();
    t.after(() => rm(projectRoot, { recursive: true, force: true }));

    const { events, commands } = registerHandlers();
    const notifications = [];
    const ctx = {
      cwd: projectRoot,
      hasUI: true,
      ui: {
        confirm: async () => true,
        notify: (message) => notifications.push(message),
        select: async () => undefined,
      },
    };

    if (flow === "startup") {
      await events.get("session_start")({}, ctx);
    } else {
      await commands.get(flow).handler("", ctx);
    }

    const manifest = await loadManifest(projectRoot);
    const states = Object.fromEntries(manifest.records.map(({ id, state }) => [id, state]));
    assert.deepEqual(states, { newer: "active", older: "quarantined" });
    const quarantined = manifest.records.find(({ id }) => id === "older");
    assert.ok(quarantined?.quarantinePath);
    assert.ok((await stat(quarantined.quarantinePath)).isDirectory());
    await assert.rejects(stat(olderRoot), { code: "ENOENT" });
    assert.ok((await stat(newerRoot)).isDirectory());
    assert.ok(notifications.includes("Quarantined: Older due"));
  });
}
