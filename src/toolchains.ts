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

export interface VendorDef {
  [toolchain: string]: ToolchainDef;
}

export interface ToolchainDatabase {
  [vendor: string]: VendorDef;
}

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
  const dbFile = DB_FILES[plat];
  if (!dbFile) {
    throw new Error(
      `No toolchain database available for runner platform "${plat}".\n` +
      `Supported platforms: ${Object.keys(DB_FILES).join(", ")}`
    );
  }
  const dbPath = path.join(repoRoot, dbFile);
  const content = fs.readFileSync(dbPath, "utf8");
  return yaml.load(content) as ToolchainDatabase;
}

export function resolveToolchain(
  repoRoot: string,
  toolchainName: string,
  requestedVersion: string,
  platform?: RunnerPlatform,
  requestedVendor?: string
): ToolchainEntry {
  const db = loadDatabase(repoRoot, platform);

  // Collect matching vendor defs, filtered by vendor if specified
  const matches: { vendor: string; def: ToolchainDef }[] = [];
  for (const [vendor, vendorDef] of Object.entries(db)) {
    if (toolchainName in vendorDef) {
      if (requestedVendor === undefined || vendor === requestedVendor) {
        matches.push({ vendor, def: vendorDef[toolchainName] });
      }
    }
  }

  if (matches.length === 0) {
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

  // For a specific version, check for conflicts across vendors when no vendor was specified
  if (requestedVendor === undefined && requestedVersion !== "latest") {
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

  // For "latest" with no vendor, check for conflict at the top version across vendors
  if (requestedVendor === undefined && requestedVersion === "latest" && matches.length > 1) {
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

  // Resolve: for "latest" pick highest version across all matching vendors
  if (requestedVersion === "latest") {
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
    return { url: bestEntry!.url, sha256: bestEntry!.sha256 ?? "" };
  }

  for (const { def } of matches) {
    if (requestedVersion in def.versions) {
      const entry = def.versions[requestedVersion];
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

export function compareVersions(a: string, b: string): number {
  const splitVer = (v: string) => v.split(/[.\-_]/);
  const pa = splitVer(a);
  const pb = splitVer(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const sa = pa[i] ?? "0";
    const sb = pb[i] ?? "0";
    const na = Number(sa);
    const nb = Number(sb);
    const bothNumeric = sa !== "" && sb !== "" && !isNaN(na) && !isNaN(nb);
    if (bothNumeric) {
      if (na !== nb) return na - nb;
    } else if (sa !== sb) {
      return sa < sb ? -1 : 1;
    }
  }
  return 0;
}
