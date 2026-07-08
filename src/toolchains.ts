import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

export interface ToolchainEntry {
  url: string;
  sha256: string;
}

export interface ToolchainDef {
  description: string;
  versions: Record<string, ToolchainEntry>;
}

export type VendorDef = Record<string, ToolchainDef>;

export type ToolchainDatabase = Record<string, VendorDef>;

export type RunnerPlatform =
  | "linux-x64"
  | "linux-arm64"
  | "windows-x64"
  | "windows-arm64";

export function detectPlatform(): RunnerPlatform {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const os = process.platform === "win32" ? "windows" : "linux";
  return `${os}-${arch}` as RunnerPlatform;
}

const DB_FILES: Partial<Record<RunnerPlatform, string>> = {
  "linux-x64": "toolchains-linux-x64.yml",
  "linux-arm64": "toolchains-linux-arm64.yml",
  "windows-x64": "toolchains-windows-x64.yml",
};

export function loadDatabase(repoRoot: string, platform?: RunnerPlatform): ToolchainDatabase {
  const plat = platform ?? detectPlatform();
  // eslint-disable-next-line security/detect-object-injection -- plat is a closed RunnerPlatform union, not external input
  const dbFile = DB_FILES[plat];
  if (!dbFile) {
    throw new Error(
      `No toolchain database available for runner platform "${plat}".\n` +
      `Supported platforms: ${Object.keys(DB_FILES).join(", ")}`
    );
  }
  const dbPath = path.join(repoRoot, dbFile);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dbFile comes from a fixed, hardcoded map, not external input
  const content = fs.readFileSync(dbPath, "utf8");
  // Restricted schema: the YAML database is trusted repo content, but only
  // plain JSON-shaped values are ever expected — reject custom/unsafe tags.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- this file's own `tsc --noEmit --strict` passes cleanly; js-yaml ships its own types (see @types/js-yaml), Codacy's hosted ESLint just doesn't resolve them
  // nosemgrep: rules.lgpl.javascript.eval.rule-yaml-deserialize -- mitigated: JSON_SCHEMA rejects custom/unsafe YAML tags (no !!js/function etc.), so this cannot deserialize arbitrary types
  return yaml.load(content, { schema: yaml.JSON_SCHEMA }) as ToolchainDatabase;
}

interface VendorMatch {
  vendor: string;
  def: ToolchainDef;
}

function findVendorMatches(db: ToolchainDatabase, toolchainName: string, requestedVendor?: string): VendorMatch[] {
  const matches: VendorMatch[] = [];
  for (const [vendor, vendorDef] of Object.entries(db)) {
    if (toolchainName in vendorDef && (requestedVendor === undefined || vendor === requestedVendor)) {
      // eslint-disable-next-line security/detect-object-injection -- guarded by the `in` check above
      matches.push({ vendor, def: vendorDef[toolchainName] });
    }
  }
  return matches;
}

function throwNoMatches(db: ToolchainDatabase, toolchainName: string, requestedVendor?: string): never {
  if (requestedVendor !== undefined) {
    throw new Error(
      `Toolchain "${toolchainName}" not found for vendor "${requestedVendor}" on this platform.\n` +
      `Available vendors for this toolchain: ${Object.entries(db)
        .filter(([, vd]) => toolchainName in vd)
        .map(([v]) => v)
        .join(", ") || "none"
      }`
    );
  }
  const available = Object.values(db).flatMap((v) => Object.keys(v)).sort();
  throw new Error(
    `Toolchain "${toolchainName}" not found for this platform.\n` +
    `Available: ${available.join(", ")}`
  );
}

function assertNoVersionConflict(matches: VendorMatch[], toolchainName: string, requestedVersion: string): void {
  const providingVendors = matches
    .filter(({ def }) => requestedVersion in def.versions)
    .map(({ vendor }) => vendor);
  if (providingVendors.length > 1) {
    throw new Error(
      `Version "${requestedVersion}" of toolchain "${toolchainName}" is provided by multiple vendors: ${providingVendors.join(", ")}.\n` +
      `Specify a vendor explicitly, e.g. "${providingVendors[0]}/${toolchainName}".`
    );
  }
}

function assertNoLatestConflict(matches: VendorMatch[], toolchainName: string): void {
  if (matches.length <= 1) return;
  const topPerVendor = matches.map(({ vendor, def }) => {
    const top = Object.keys(def.versions).sort((a, b) => compareVersions(b, a))[0];
    return { vendor, version: top };
  });
  const topVersion = topPerVendor.reduce((best, cur) =>
    compareVersions(cur.version, best.version) > 0 ? cur : best
  );
  const tied = topPerVendor.filter((v) => v.version === topVersion.version);
  if (tied.length > 1) {
    const vendors = tied.map((v) => v.vendor).join(", ");
    throw new Error(
      `Toolchain "${toolchainName}" latest version "${topVersion.version}" is provided by multiple vendors: ${vendors}.\n` +
      `Specify a vendor explicitly, e.g. "${tied[0].vendor}/${toolchainName}".`
    );
  }
}

function pickLatest(matches: VendorMatch[], toolchainName: string): ToolchainEntry {
  let bestEntry: ToolchainEntry | undefined;
  let bestVersion = "";
  for (const { def } of matches) {
    for (const [ver, entry] of Object.entries(def.versions)) {
      if (!bestVersion || compareVersions(ver, bestVersion) > 0) {
        bestVersion = ver;
        bestEntry = entry;
      }
    }
  }
  if (!bestEntry) {
    throw new Error(`Toolchain "${toolchainName}" has no versions available for this platform.`);
  }
  // The YAML database is cast to ToolchainDatabase without runtime validation,
  // so a malformed entry could still be missing sha256 despite the type.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return { url: bestEntry.url, sha256: bestEntry.sha256 ?? "" };
}

function pickVersion(matches: VendorMatch[], toolchainName: string, requestedVersion: string): ToolchainEntry {
  for (const { def } of matches) {
    if (requestedVersion in def.versions) {
      // eslint-disable-next-line security/detect-object-injection -- guarded by the `in` check above
      const entry = def.versions[requestedVersion];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- see pickLatest
      return { url: entry.url, sha256: entry.sha256 ?? "" };
    }
  }

  const allVersions = [...new Set(matches.flatMap(({ def }) => Object.keys(def.versions)))]
    .sort((a, b) => compareVersions(b, a));
  const vendorNames = matches.map(({ vendor }) => vendor).join(", ");
  throw new Error(
    `Version "${requestedVersion}" not found for toolchain "${toolchainName}" (vendor(s): ${vendorNames}).\n` +
    `Available versions: ${allVersions.join(", ")}`
  );
}

export function resolveToolchain(
  repoRoot: string,
  toolchainName: string,
  requestedVersion: string,
  platform?: RunnerPlatform,
  requestedVendor?: string
): ToolchainEntry {
  const db = loadDatabase(repoRoot, platform);
  const matches = findVendorMatches(db, toolchainName, requestedVendor);
  if (matches.length === 0) throwNoMatches(db, toolchainName, requestedVendor);

  if (requestedVendor === undefined) {
    if (requestedVersion === "latest") {
      assertNoLatestConflict(matches, toolchainName);
    } else {
      assertNoVersionConflict(matches, toolchainName, requestedVersion);
    }
  }

  return requestedVersion === "latest"
    ? pickLatest(matches, toolchainName)
    : pickVersion(matches, toolchainName, requestedVersion);
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.\-_]/);
  const pb = b.split(/[.\-_]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    // eslint-disable-next-line security/detect-object-injection -- i is a bounded numeric loop counter, not external input
    const cmp = compareVersionPart(pa[i] ?? "0", pb[i] ?? "0");
    if (cmp !== 0) return cmp;
  }
  return 0;
}

function compareVersionPart(sa: string, sb: string): number {
  const na = Number(sa);
  const nb = Number(sb);
  const bothNumeric = sa !== "" && sb !== "" && !isNaN(na) && !isNaN(nb);
  if (bothNumeric) return na - nb;
  if (sa === sb) return 0;
  return sa < sb ? -1 : 1;
}
