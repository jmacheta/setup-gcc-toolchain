/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument --
 * This file's own `tsc --noEmit --strict` passes cleanly: @actions/core, @actions/cache
 * and @actions/tool-cache ship their own .d.ts and are correctly typed here. These rules
 * only fire in Codacy's hosted ESLint run because it doesn't resolve installed
 * node_modules type declarations for third-party packages, so every call into an
 * @actions/* namespace import is seen as `any`/`error`-typed. */
import * as core from "@actions/core";
import * as cache from "@actions/cache";
import * as tc from "@actions/tool-cache";
import * as exec from "@actions/exec";
import * as path from "path";
import * as crypto from "crypto";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { resolveToolchain, ToolchainEntry } from "./toolchains.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// eslint-disable-next-line security-node/detect-unhandled-async-errors -- errors thrown here propagate to the top-level `run().catch()` handler
async function verifyChecksum(
  filePath: string,
  expectedSha256: string
): Promise<void> {
  if (!expectedSha256) {
    throw new Error(
      `No SHA256 checksum available for ${path.basename(filePath)}. ` +
      `This toolchain version cannot be verified. ` +
      `Choose a different version or contribute a checksum via pull request.`
    );
  }

  const hash = crypto.createHash("sha256");
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath comes from tc.downloadTool(), not external input
  const stream = fs.createReadStream(filePath);
  // eslint-disable-next-line security-node/detect-unhandled-async-errors -- stream errors are wired to `reject` below
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  const actual = hash.digest("hex");
  if (actual !== expectedSha256.toLowerCase()) {
    throw new Error(
      `SHA256 mismatch for ${path.basename(filePath)}\n` +
      `  expected: ${expectedSha256}\n` +
      `  actual:   ${actual}`
    );
  }
}

function assertSupportedScheme(url: string): void {
  let scheme: string;
  try {
    scheme = new URL(url).protocol;
  } catch {
    throw new Error(`Toolchain URL is not a valid URL: ${url}`);
  }
  if (scheme !== "http:" && scheme !== "https:") {
    throw new Error(
      `Unsupported URL scheme "${scheme}" in toolchain database. ` +
      `Only http:// and https:// downloads are supported: ${url}`
    );
  }
}

function tarFlags(archiveName: string): string {
  if (archiveName.endsWith(".tar.xz")) return "xJ";
  if (archiveName.endsWith(".tar.bz2")) return "xj";
  return "xz"; // .tar.gz
}

function findToolchainRoot(installDir: string): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- installDir is built from RUNNER_TEMP, not external input
  const entries = fs.readdirSync(installDir).filter((e) => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- installDir is built from RUNNER_TEMP, not external input
    const stat = fs.statSync(path.join(installDir, e));
    return stat.isDirectory();
  });
  return entries.length === 1 ? path.join(installDir, entries[0]) : installDir;
}

async function verifyOnPath(binPath: string, toolchainName: string): Promise<void> {
  // Derive a sensible binary name to probe: use the triplet prefix if present,
  // otherwise plain "gcc". For winlibs mingw the binary is e.g. x86_64-w64-mingw32-gcc.
  const probe = toolchainName === "x86_64-gcc" ? "gcc" : `${toolchainName}-gcc`;

  const ext = process.platform === "win32" ? ".exe" : "";
  const binaryPath = path.join(binPath, probe + ext);

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- binaryPath is built from binPath, not external input
  if (!fs.existsSync(binaryPath)) {
    // Non-fatal: log a warning but don't fail — binary name may differ
    core.warning(
      `Expected binary not found at ${binaryPath}. ` +
      `Verify the toolchain name or check the archive contents.`
    );
    return;
  }

  let output = "";
  await exec.exec(`"${binaryPath}"`, ["--version"], {
    silent: true,
    ignoreReturnCode: true,
    listeners: { stdout: (d) => { output += d.toString(); } },
  });
  core.info(`Verified: ${output.split("\n")[0].trim()}`);
}

interface RunInputs {
  toolchainName: string;
  vendor: string | undefined;
  version: string;
  enableCache: boolean;
}

function readInputs(): RunInputs {
  return {
    toolchainName: core.getInput("toolchain", { required: true }),
    vendor: core.getInput("vendor") || undefined,
    version: core.getInput("version") || "latest",
    enableCache: core.getInput("enable-cache") !== "false",
  };
}

/** Downloads (or restores from cache), verifies and extracts the toolchain into installDir. Returns whether the cache was hit. */
async function installToolchain(
  entry: ToolchainEntry,
  installDir: string,
  cacheKey: string,
  enableCache: boolean
): Promise<boolean> {
  if (enableCache) {
    const restoredKey = await cache.restoreCache([installDir], cacheKey);
    if (restoredKey !== undefined) {
      core.info(`Restored from cache: ${restoredKey}`);
      return true;
    }
  }

  const archiveName = path.basename(entry.url);
  core.info(`Downloading ${archiveName}...`);
  const archivePath = await tc.downloadTool(entry.url);

  core.info("Verifying SHA256...");
  await verifyChecksum(archivePath, entry.sha256);

  core.info(`Extracting to ${installDir}...`);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- installDir is built from RUNNER_TEMP, not external input
  fs.mkdirSync(installDir, { recursive: true });

  if (archiveName.endsWith(".zip")) {
    await tc.extractZip(archivePath, installDir);
  } else {
    await tc.extractTar(archivePath, installDir, tarFlags(archiveName));
  }

  if (enableCache) {
    core.info("Saving to cache...");
    await cache.saveCache([installDir], cacheKey);
  }
  return false;
}

async function run(): Promise<void> {
  const { toolchainName, vendor, version, enableCache } = readInputs();

  const repoRoot = path.join(__dirname, "..");
  const entry = resolveToolchain(repoRoot, toolchainName, version, undefined, vendor);

  const resolvedVersion = version === "latest"
    ? path.basename(entry.url).match(/[\d.]+[-_][\d.]+/)?.[0] ?? version
    : version;

  core.info(`Toolchain: ${toolchainName} @ ${resolvedVersion}`);
  core.info(`URL: ${entry.url}`);
  assertSupportedScheme(entry.url);

  const installDir = path.join(
    process.env.RUNNER_TEMP ?? "/tmp",
    "gcc-toolchain",
    `${toolchainName}-${resolvedVersion}`
  );
  const cacheKey = `setup-gcc-toolchain-v1-${toolchainName}-${resolvedVersion}-${process.platform}-${process.arch}`;

  const cacheHit = await installToolchain(entry, installDir, cacheKey, enableCache);

  const toolchainRoot = findToolchainRoot(installDir);
  const binPath = path.join(toolchainRoot, "bin");

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- binPath is built from RUNNER_TEMP, not external input
  if (!fs.existsSync(binPath)) {
    throw new Error(`bin/ not found under ${installDir}. Archive layout may be unexpected.`);
  }

  // Prepend to PATH so this toolchain takes priority over any pre-installed one
  core.addPath(binPath);

  core.setOutput("toolchain-path", toolchainRoot);
  core.setOutput("cache-hit", String(cacheHit));

  core.info(`Added to PATH (first position): ${binPath}`);

  await verifyOnPath(binPath, toolchainName);
}

run().catch((err: unknown) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
