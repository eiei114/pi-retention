import { mkdir, readFile, rename, rm, writeFile, cp } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export const DEFAULT_SKILL_TTL_DAYS = 30;
export const DEFAULT_EXTENSION_TTL_DAYS = 90;
export const PACKAGE_NAME = "pi-retention";

export type RetentionKind = "skill" | "extension";
export type RetentionState = "active" | "quarantined";

export interface RetentionRecord {
  id: string;
  kind: RetentionKind;
  packageName: string;
  displayName: string;
  rootPath: string;
  ttlDays: number;
  usageCount: number;
  lastUsedAt: string;
  dueAt: string;
  pinned: boolean;
  state: RetentionState;
  originalPackageEntry?: string;
  quarantinePath?: string;
  notes?: string;
}

export interface RetentionManifest {
  version: 1;
  updatedAt: string;
  defaults: {
    skillTtlDays: number;
    extensionTtlDays: number;
  };
  records: RetentionRecord[];
}

export interface PackageDiscovery {
  entry: string;
  rootPath: string;
  packageName: string;
  displayName: string;
  kind: RetentionKind;
}

export interface ReportStats {
  total: number;
  active: number;
  quarantined: number;
  due: number;
  protected: number;
}

export const SELF_ROOT = normalize(resolve(dirname(fileURLToPath(import.meta.url)), ".."));

function nowIso() {
  return new Date().toISOString();
}

export function normalizeRootPath(rootPath: string) {
  return normalize(resolve(rootPath));
}

export function addDays(iso: string, days: number) {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function shortName(packageName: string) {
  return packageName.startsWith("pi-") ? packageName.slice(3) : packageName;
}

export function packageAliases(record: Pick<RetentionRecord, "packageName" | "displayName" | "rootPath">) {
  return Array.from(
    new Set([
      record.packageName.toLowerCase(),
      shortName(record.packageName).toLowerCase(),
      slugify(record.displayName),
      basename(record.rootPath).toLowerCase(),
    ].filter(Boolean)),
  );
}

async function readTextIfExists(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function readJsonIfExists<T>(path: string): Promise<T | undefined> {
  const text = await readTextIfExists(path);
  if (text === undefined) return undefined;
  return JSON.parse(text) as T;
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readYamlIfExists<T>(path: string): Promise<T | undefined> {
  const text = await readTextIfExists(path);
  if (text === undefined) return undefined;
  return parseYaml(text) as T;
}

async function writeYaml(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${stringifyYaml(value)}`, "utf8");
}

export function getProjectRoot(cwd?: string) {
  return normalizeRootPath(cwd ?? process.cwd());
}

export function getProjectSettingsPath(projectRoot: string) {
  return join(projectRoot, ".pi", "settings.json");
}

export function getManifestPath(projectRoot: string) {
  return join(projectRoot, ".pi-retention-project.yaml");
}

export function getLogPath(projectRoot: string) {
  return join(projectRoot, ".pi-retention.jsonl");
}

export function getTrashDir(projectRoot: string) {
  return join(projectRoot, ".pi-retention-trash");
}

export function getSidecarPath(rootPath: string) {
  return join(rootPath, ".pi-retention.yaml");
}

export function getKindDefaults(kind: RetentionKind) {
  return kind === "skill" ? DEFAULT_SKILL_TTL_DAYS : DEFAULT_EXTENSION_TTL_DAYS;
}

export function isLocalPackageEntry(entry: unknown): entry is string {
  if (typeof entry !== "string") return false;
  const trimmed = entry.trim();
  if (!trimmed) return false;
  if (/^(npm:|git:|https?:|file:)/i.test(trimmed)) return false;
  return true;
}

export function resolvePackageEntry(entry: string, projectRoot: string) {
  return normalizeRootPath(isAbsolute(entry) ? entry : resolve(projectRoot, entry));
}

async function readPackageMetadata(rootPath: string) {
  const pkg = await readJsonIfExists<{ name?: string; pi?: { extensions?: unknown[]; skills?: unknown[] } }>(
    join(rootPath, "package.json"),
  );
  const packageName = pkg?.name?.trim() || basename(rootPath);
  const kind: RetentionKind = (pkg?.pi?.skills?.length ?? 0) > 0 ? "skill" : "extension";
  return { packageName, kind };
}

export async function discoverPackages(projectRoot: string): Promise<PackageDiscovery[]> {
  const settingsPath = getProjectSettingsPath(projectRoot);
  const settings = await readJsonIfExists<{ packages?: unknown[] }>(settingsPath);
  const packageEntries = Array.isArray(settings?.packages) ? settings.packages : [];
  const discoveries: PackageDiscovery[] = [];
  const seen = new Set<string>();

  for (const entry of packageEntries) {
    if (!isLocalPackageEntry(entry)) continue;

    const rootPath = resolvePackageEntry(entry, projectRoot);
    if (seen.has(rootPath)) continue;

    const pkgJson = await readJsonIfExists<{ name?: string }>(join(rootPath, "package.json"));
    if (!pkgJson) continue;

    const { packageName, kind } = await readPackageMetadata(rootPath);
    const displayName = packageName;

    discoveries.push({
      entry,
      rootPath,
      packageName,
      displayName,
      kind,
    });
    seen.add(rootPath);
  }

  return discoveries.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function createRecordFromDiscovery(
  discovery: PackageDiscovery,
  ttlDays = getKindDefaults(discovery.kind),
  existing?: Partial<RetentionRecord>,
): RetentionRecord {
  const now = existing?.lastUsedAt ?? nowIso();
  const rootPath = normalizeRootPath(discovery.rootPath);
  return {
    id: existing?.id ?? (slugify(discovery.packageName) || slugify(basename(rootPath))),
    kind: discovery.kind,
    packageName: discovery.packageName,
    displayName: discovery.displayName,
    rootPath,
    ttlDays: existing?.ttlDays ?? ttlDays,
    usageCount: existing?.usageCount ?? 0,
    lastUsedAt: existing?.lastUsedAt ?? now,
    dueAt: existing?.dueAt ?? addDays(now, existing?.ttlDays ?? ttlDays),
    pinned: existing?.pinned ?? false,
    state: existing?.state ?? "active",
    originalPackageEntry: existing?.originalPackageEntry ?? discovery.entry,
    quarantinePath: existing?.quarantinePath,
    notes: existing?.notes,
  };
}

export function createEmptyManifest(): RetentionManifest {
  return {
    version: 1,
    updatedAt: nowIso(),
    defaults: {
      skillTtlDays: DEFAULT_SKILL_TTL_DAYS,
      extensionTtlDays: DEFAULT_EXTENSION_TTL_DAYS,
    },
    records: [],
  };
}

export async function loadManifest(projectRoot: string): Promise<RetentionManifest> {
  const path = getManifestPath(projectRoot);
  const raw = await readYamlIfExists<Partial<RetentionManifest>>(path);
  if (!raw) return createEmptyManifest();

  return {
    version: 1,
    updatedAt: raw.updatedAt ?? nowIso(),
    defaults: {
      skillTtlDays: raw.defaults?.skillTtlDays ?? DEFAULT_SKILL_TTL_DAYS,
      extensionTtlDays: raw.defaults?.extensionTtlDays ?? DEFAULT_EXTENSION_TTL_DAYS,
    },
    records: Array.isArray(raw.records) ? (raw.records as RetentionRecord[]) : [],
  };
}

export async function saveManifest(projectRoot: string, manifest: RetentionManifest) {
  manifest.updatedAt = nowIso();
  await writeYaml(getManifestPath(projectRoot), manifest);
}

async function saveSidecar(record: RetentionRecord) {
  const sidecarRoot = record.state === "quarantined" && record.quarantinePath ? record.quarantinePath : record.rootPath;
  await writeYaml(getSidecarPath(sidecarRoot), record);
}

export async function appendLog(projectRoot: string, entry: Record<string, unknown>) {
  const logPath = getLogPath(projectRoot);
  await mkdir(dirname(logPath), { recursive: true });
  await writeFile(logPath, `${JSON.stringify(entry)}\n`, { flag: "a", encoding: "utf8" });
}

export async function hydrateManifest(projectRoot: string): Promise<RetentionManifest> {
  const manifest = await loadManifest(projectRoot);
  const discoveries = await discoverPackages(projectRoot);
  const byRoot = new Map(manifest.records.map((record) => [normalizeRootPath(record.rootPath), record] as const));

  for (const discovery of discoveries) {
    const rootPath = normalizeRootPath(discovery.rootPath);
    const existing = byRoot.get(rootPath);
    const sidecar = await readYamlIfExists<Partial<RetentionRecord>>(getSidecarPath(rootPath));
    const merged = createRecordFromDiscovery(discovery, getKindDefaults(discovery.kind), {
      ...existing,
      ...sidecar,
      rootPath,
      packageName: discovery.packageName,
      displayName: discovery.displayName,
      kind: discovery.kind,
      originalPackageEntry: sidecar?.originalPackageEntry ?? existing?.originalPackageEntry ?? discovery.entry,
    });

    if (rootPath === SELF_ROOT) {
      merged.pinned = true;
      merged.notes = merged.notes ? `${merged.notes}; self-protected` : "self-protected";
    }

    byRoot.set(rootPath, merged);
  }

  manifest.records = Array.from(byRoot.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
  return manifest;
}

export function isStartupCandidate(record: RetentionRecord, now = nowIso()) {
  return (
    record.state === "active" &&
    !record.pinned &&
    normalizeRootPath(record.rootPath) !== SELF_ROOT &&
    new Date(record.dueAt).getTime() <= new Date(now).getTime()
  );
}

export function compareStartupCandidates(a: RetentionRecord, b: RetentionRecord) {
  const dueDelta = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
  if (dueDelta !== 0) return dueDelta;
  return new Date(a.lastUsedAt).getTime() - new Date(b.lastUsedAt).getTime();
}

export function selectOldestExpiredRecord(records: RetentionRecord[], now = nowIso()) {
  return records
    .filter((record) => isStartupCandidate(record, now))
    .sort(compareStartupCandidates)[0];
}

export function recordReportStatus(record: RetentionRecord, now = nowIso()) {
  if (record.state === "quarantined") return "Q";
  if (record.pinned) return "P";
  if (new Date(record.dueAt).getTime() <= new Date(now).getTime()) return "!";
  return "A";
}

export function selectQuarantinedRecord(records: RetentionRecord[]) {
  return records.filter((record) => record.state === "quarantined").sort((a, b) => a.displayName.localeCompare(b.displayName))[0];
}

export function recordStats(records: RetentionRecord[]): ReportStats {
  const total = records.length;
  const active = records.filter((record) => record.state === "active").length;
  const quarantined = records.filter((record) => record.state === "quarantined").length;
  const due = records.filter((record) => record.state === "active" && !record.pinned && new Date(record.dueAt).getTime() <= Date.now()).length;
  const protectedCount = records.filter((record) => record.pinned || normalizeRootPath(record.rootPath) === SELF_ROOT).length;
  return { total, active, quarantined, due, protected: protectedCount };
}

export function formatReport(manifest: RetentionManifest, now = nowIso()) {
  const stats = recordStats(manifest.records);
  const startupCandidate = selectOldestExpiredRecord(manifest.records, now);
  const lines = [
    `Retention report: ${stats.total} tracked`,
    `active=${stats.active} quarantined=${stats.quarantined} due=${stats.due} protected=${stats.protected}`,
    "status: A=active !=due P=pinned Q=quarantined",
    "",
  ];

  if (startupCandidate) {
    lines.push(`startup candidate (one per launch): ${startupCandidate.displayName}`);
    lines.push("");
  }

  for (const record of manifest.records.sort(compareStartupCandidates)) {
    const status = recordReportStatus(record, now);
    const marker = startupCandidate?.id === record.id ? ">" : " ";
    const root = record.state === "quarantined" && record.quarantinePath ? record.quarantinePath : record.rootPath;
    lines.push(
      `${marker}${status} ${record.displayName} · ${record.kind} · uses=${record.usageCount} · last=${record.lastUsedAt.slice(0, 10)} · due=${record.dueAt.slice(0, 10)} · ${root}`,
    );
  }

  if (manifest.records.length === 0) {
    lines.push("(no local roots tracked)");
  }

  return lines.join("\n");
}

export async function syncRecordUsage(
  manifest: RetentionManifest,
  toolName: string,
  now = nowIso(),
) {
  const lowered = toolName.toLowerCase();
  const record = manifest.records.find((candidate) =>
    packageAliases(candidate).some((alias) => lowered === alias || lowered.startsWith(`${alias}:`) || lowered.startsWith(`${alias}/`)),
  );

  if (!record || record.state !== "active") return undefined;

  record.usageCount += 1;
  record.lastUsedAt = now;
  record.dueAt = addDays(now, record.ttlDays);
  record.state = "active";

  return record;
}

export function applyPin(record: RetentionRecord, pinned: boolean, now = nowIso()) {
  record.pinned = pinned;
  if (pinned) {
    record.state = "active";
    return record;
  }

  record.dueAt = addDays(record.lastUsedAt || now, record.ttlDays);
  return record;
}

async function moveDirectory(source: string, destination: string) {
  await mkdir(dirname(destination), { recursive: true });
  try {
    await rename(source, destination);
  } catch {
    await cp(source, destination, { recursive: true });
    await rm(source, { recursive: true, force: true });
  }
}

async function updateProjectPackages(projectRoot: string, transform: (packages: string[]) => string[]) {
  const settingsPath = getProjectSettingsPath(projectRoot);
  const settings = (await readJsonIfExists<{ packages?: unknown[] }>(settingsPath)) ?? {};
  const packages = Array.isArray(settings.packages)
    ? settings.packages.filter((entry): entry is string => typeof entry === "string")
    : [];
  const nextPackages = transform(packages);
  settings.packages = nextPackages;
  await writeJson(settingsPath, settings);
}

export async function quarantineRecord(projectRoot: string, record: RetentionRecord) {
  const trashDir = getTrashDir(projectRoot);
  const timestamp = nowIso().replace(/[:.]/g, "-");
  const destination = join(trashDir, `${slugify(record.displayName) || slugify(record.packageName)}-${timestamp}`);

  if (normalizeRootPath(record.rootPath) === SELF_ROOT) {
    throw new Error("self-protected roots cannot be quarantined");
  }

  await moveDirectory(record.rootPath, destination);
  await updateProjectPackages(projectRoot, (packages) =>
    packages.filter((entry) => normalizeRootPath(resolvePackageEntry(entry, projectRoot)) !== normalizeRootPath(record.rootPath)),
  );

  record.state = "quarantined";
  record.quarantinePath = destination;
  record.originalPackageEntry = record.originalPackageEntry ?? record.rootPath;
  await saveSidecar(record);
  await appendLog(projectRoot, {
    event: "confirm",
    root: record.rootPath,
    quarantinePath: destination,
    ts: nowIso(),
    status: "quarantined",
    actor: PACKAGE_NAME,
  });

  return record;
}

export async function restoreRecord(projectRoot: string, record: RetentionRecord) {
  if (!record.quarantinePath) {
    throw new Error("record is not quarantined");
  }

  const destination = record.rootPath;
  await moveDirectory(record.quarantinePath, destination);
  await updateProjectPackages(projectRoot, (packages) => {
    const restored = record.originalPackageEntry ?? record.rootPath;
    if (packages.includes(restored)) return packages;
    return [...packages, restored];
  });

  record.state = "active";
  record.quarantinePath = undefined;
  record.lastUsedAt = nowIso();
  record.dueAt = addDays(record.lastUsedAt, record.ttlDays);
  await saveSidecar(record);
  await appendLog(projectRoot, {
    event: "restore",
    root: record.rootPath,
    ts: nowIso(),
    status: "active",
    actor: PACKAGE_NAME,
  });

  return record;
}

export async function purgeRecord(projectRoot: string, record: RetentionRecord) {
  if (record.state !== "quarantined" || !record.quarantinePath) {
    throw new Error("only quarantined records can be purged");
  }

  await rm(record.quarantinePath, { recursive: true, force: true });
  await appendLog(projectRoot, {
    event: "purge",
    root: record.rootPath,
    ts: nowIso(),
    status: "purged",
    actor: PACKAGE_NAME,
  });

  return record;
}

export async function saveManifestAndSidecars(projectRoot: string, manifest: RetentionManifest) {
  await saveManifest(projectRoot, manifest);
  for (const record of manifest.records) {
    await saveSidecar(record);
  }
}

export async function initializeProject(projectRoot: string) {
  const manifest = await hydrateManifest(projectRoot);
  await saveManifestAndSidecars(projectRoot, manifest);
  return manifest;
}

export async function loadProjectRetention(projectRoot: string) {
  return hydrateManifest(projectRoot);
}
