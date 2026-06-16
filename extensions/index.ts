import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  applyPin,
  formatReport,
  getProjectRoot,
  initializeProject,
  loadProjectRetention,
  purgeRecord,
  quarantineRecord,
  restoreRecord,
  saveManifestAndSidecars,
  selectOldestExpiredRecord,
  syncRecordUsage,
  PACKAGE_NAME,
  type RetentionRecord,
} from "../lib/retention.ts";

function recordLabel(record: Pick<RetentionRecord, "displayName" | "kind" | "state" | "pinned" | "rootPath">) {
  const pin = record.pinned ? "pin" : "free";
  return `${record.displayName} · ${record.kind} · ${record.state} · ${pin} · ${record.rootPath}`;
}

async function chooseRecord(
  ctx: { hasUI: boolean; ui: { select: (title: string, options: string[]) => Promise<string | undefined> } },
  title: string,
  records: RetentionRecord[],
) {
  if (!ctx.hasUI || records.length === 0) return undefined;
  const labels = records.map(recordLabel);
  const choice = await ctx.ui.select(title, labels);
  if (!choice) return undefined;
  const index = labels.indexOf(choice);
  return index >= 0 ? records[index] : undefined;
}

async function confirmStartupCandidate(
  ctx: { hasUI: boolean; ui: { confirm: (title: string, message: string) => Promise<boolean>; notify: (message: string, type?: "info" | "warning" | "error") => void } },
  projectRoot: string,
) {
  const manifest = await initializeProject(projectRoot);
  const candidate = selectOldestExpiredRecord(manifest.records);
  if (!candidate || !ctx.hasUI) return;

  const confirmed = await ctx.ui.confirm(
    "Pi Retention",
    `Oldest expired candidate (one per startup):\n\n${recordLabel(candidate)}\n\nQuarantine this item?`,
  );

  // Deny leaves state unchanged so the same candidate is offered on the next launch.
  if (!confirmed) return;

  await quarantineRecord(projectRoot, candidate);
  await saveManifestAndSidecars(projectRoot, manifest);
  ctx.ui.notify(`Quarantined: ${candidate.displayName}`, "info");
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    await confirmStartupCandidate(ctx, getProjectRoot(ctx.cwd));
  });

  pi.on("tool_call", async (event, ctx) => {
    const toolName = typeof event.toolName === "string" ? event.toolName : "";
    if (!toolName) return undefined;

    const projectRoot = getProjectRoot(ctx.cwd);
    const manifest = await loadProjectRetention(projectRoot);
    const updated = await syncRecordUsage(manifest, toolName);
    if (!updated) return undefined;

    await saveManifestAndSidecars(projectRoot, manifest);
    return undefined;
  });

  pi.registerCommand("retention:init", {
    description: "Initialize Pi Retention manifest and sidecars",
    handler: async (_args, ctx) => {
      const projectRoot = getProjectRoot(ctx.cwd);
      const manifest = await initializeProject(projectRoot);
      await syncRecordUsage(manifest, PACKAGE_NAME);
      await saveManifestAndSidecars(projectRoot, manifest);
      ctx.ui.notify(`Retention initialized: ${manifest.records.length} root(s)`, "info");
    },
  });

  pi.registerCommand("retention:report", {
    description: "Show the Pi Retention report",
    handler: async (_args, ctx) => {
      const projectRoot = getProjectRoot(ctx.cwd);
      const manifest = await loadProjectRetention(projectRoot);
      await syncRecordUsage(manifest, PACKAGE_NAME);
      const text = formatReport(manifest);
      await saveManifestAndSidecars(projectRoot, manifest);
      ctx.ui.notify(text, "info");
    },
  });

  pi.registerCommand("retention:confirm", {
    description: "Quarantine the oldest expired candidate",
    handler: async (_args, ctx) => {
      const projectRoot = getProjectRoot(ctx.cwd);
      const manifest = await loadProjectRetention(projectRoot);
      await syncRecordUsage(manifest, PACKAGE_NAME);
      const candidate = selectOldestExpiredRecord(manifest.records);
      if (!candidate) {
        await saveManifestAndSidecars(projectRoot, manifest);
        ctx.ui.notify("No expired candidate found.", "info");
        return;
      }

      if (!ctx.hasUI) return;

      const confirmed = await ctx.ui.confirm(
        "Pi Retention",
        `Quarantine the oldest expired candidate?\n\n${recordLabel(candidate)}`,
      );

      if (!confirmed) return;

      await quarantineRecord(projectRoot, candidate);
      await saveManifestAndSidecars(projectRoot, manifest);
      ctx.ui.notify(`Quarantined: ${candidate.displayName}`, "info");
    },
  });

  pi.registerCommand("retention:restore", {
    description: "Restore one quarantined item",
    handler: async (_args, ctx) => {
      const projectRoot = getProjectRoot(ctx.cwd);
      const manifest = await loadProjectRetention(projectRoot);
      await syncRecordUsage(manifest, PACKAGE_NAME);
      const candidate = await chooseRecord(ctx, "Restore which item?", manifest.records.filter((record) => record.state === "quarantined"));
      if (!candidate) {
        await saveManifestAndSidecars(projectRoot, manifest);
        return;
      }

      await restoreRecord(projectRoot, candidate);
      await saveManifestAndSidecars(projectRoot, manifest);
      ctx.ui.notify(`Restored: ${candidate.displayName}`, "info");
    },
  });

  pi.registerCommand("retention:purge", {
    description: "Permanently delete one quarantined item",
    handler: async (_args, ctx) => {
      const projectRoot = getProjectRoot(ctx.cwd);
      const manifest = await loadProjectRetention(projectRoot);
      await syncRecordUsage(manifest, PACKAGE_NAME);
      const candidate = await chooseRecord(ctx, "Purge which quarantined item?", manifest.records.filter((record) => record.state === "quarantined"));
      if (!candidate) {
        await saveManifestAndSidecars(projectRoot, manifest);
        return;
      }

      const confirmed = !ctx.hasUI || (await ctx.ui.confirm("Pi Retention", `Permanently delete this quarantined item?\n\n${recordLabel(candidate)}`));
      if (!confirmed) return;

      await purgeRecord(projectRoot, candidate);
      manifest.records = manifest.records.filter((record) => record.id !== candidate.id);
      await saveManifestAndSidecars(projectRoot, manifest);
      ctx.ui.notify(`Purged: ${candidate.displayName}`, "info");
    },
  });

  pi.registerCommand("retention:pin", {
    description: "Pin one tracked item",
    handler: async (_args, ctx) => {
      const projectRoot = getProjectRoot(ctx.cwd);
      const manifest = await loadProjectRetention(projectRoot);
      await syncRecordUsage(manifest, PACKAGE_NAME);
      const candidate = await chooseRecord(ctx, "Pin which item?", manifest.records.filter((record) => record.state === "active" && !record.pinned));
      if (!candidate) {
        await saveManifestAndSidecars(projectRoot, manifest);
        return;
      }

      applyPin(candidate, true);
      await saveManifestAndSidecars(projectRoot, manifest);
      ctx.ui.notify(`Pinned: ${candidate.displayName}`, "info");
    },
  });

  pi.registerCommand("retention:unpin", {
    description: "Unpin one tracked item",
    handler: async (_args, ctx) => {
      const projectRoot = getProjectRoot(ctx.cwd);
      const manifest = await loadProjectRetention(projectRoot);
      await syncRecordUsage(manifest, PACKAGE_NAME);
      const candidate = await chooseRecord(ctx, "Unpin which item?", manifest.records.filter((record) => record.state === "active" && record.pinned));
      if (!candidate) {
        await saveManifestAndSidecars(projectRoot, manifest);
        return;
      }

      applyPin(candidate, false);
      await saveManifestAndSidecars(projectRoot, manifest);
      ctx.ui.notify(`Unpinned: ${candidate.displayName}`, "info");
    },
  });
}
