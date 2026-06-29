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
  platform?: RunnerPlatform
): ToolchainEntry {
  const db = loadDatabase(repoRoot, platform);

  let foundDef: ToolchainDef | undefined;
  let foundVendor: string | undefined;

  for (const [vendor, vendorDef] of Object.entries(db)) {
    if (toolchainName in vendorDef) {
      foundDef = vendorDef[toolchainName];
      foundVendor = vendor;
      break;
    }
  }

  if (!foundDef) {
    const available = Object.values(db)
      .flatMap((v) => Object.keys(v))
      .sort();
    throw new Error(
      `Toolchain "${toolchainName}" not found for this platform.\n` +
        `Available: ${available.join(", ")}`
    );
  }

  const versions = foundDef.versions;
  const sortedVersions = Object.keys(versions).sort((a, b) =>
    compareVersions(b, a)
  );

  const version =
    requestedVersion === "latest" ? sortedVersions[0] : requestedVersion;

  if (!(version in versions)) {
    throw new Error(
      `Version "${requestedVersion}" not found for toolchain "${toolchainName}" (vendor: ${foundVendor}).\n` +
        `Available versions: ${sortedVersions.join(", ")}`
    );
  }

  const entry = versions[version];
  return { url: entry.url, sha256: entry.sha256 ?? "" };
}

function compareVersions(a: string, b: string): number {
  const splitVer = (v: string) =>
    v.split(/[.\-]/).map((p) => (isNaN(Number(p)) ? p : Number(p)));
  const pa = splitVer(a);
  const pb = splitVer(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}
