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

/* eslint-disable security-node/detect-unhandled-async-errors -- errors anywhere in this function propagate to the top-level `run().catch()` handler; stream errors specifically are wired to `reject` below */
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
  /* eslint-enable security-node/detect-unhandled-async-errors */
}

const DOWNLOAD_MAX_ATTEMPTS = 3;
const DOWNLOAD_RETRY_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadToolWithRetry(url: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= DOWNLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      return await tc.downloadTool(url);
    } catch (err) {
      lastError = err;
      if (attempt < DOWNLOAD_MAX_ATTEMPTS) {
        core.info(
          `Download attempt ${attempt}/${DOWNLOAD_MAX_ATTEMPTS} failed: ${
            err instanceof Error ? err.message : String(err)
          }. Retrying in ${DOWNLOAD_RETRY_DELAY_MS}ms...`
        );
        await sleep(DOWNLOAD_RETRY_DELAY_MS);
      }
    }
  }
  throw lastError;
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

/**
 * Throws unless `target` resolves to a path actually inside `base`. Defense
 * in depth: `toolchainName`/`resolvedVersion` are folded into `installDir`
 * below, and while both are already validated against the YAML database's
 * known keys before this point (resolveToolchain() throws on anything that
 * isn't an exact match), this makes "never write outside the runner's temp
 * dir" an enforced invariant rather than an implicit consequence of that
 * upstream validation.
 */
function assertWithinDir(base: string, target: string): void {
  const resolvedBase = path.resolve(base) + path.sep;
  if (!(path.resolve(target) + path.sep).startsWith(resolvedBase)) {
    throw new Error(`refusing to operate outside ${base}: ${target}`);
  }
}

function tarFlags(archiveName: string): string {
  if (archiveName.endsWith(".tar.xz")) return "xJ";
  if (archiveName.endsWith(".tar.bz2")) return "xj";
  return "xz"; // .tar.gz
}

function findToolchainRoot(installDir: string): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- installDir is checked by assertWithinDir() in run() before this is called
  const entries = fs.readdirSync(installDir).filter((e) => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- installDir is checked by assertWithinDir() in run() before this is called
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

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- binaryPath is derived from the already-validated installDir
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
  useRemoteCache: boolean;
  useLocalCache: boolean;
  localCacheLocation: string | undefined;
  setLdLibraryPath: boolean;
}

export function readInputs(): RunInputs {
  const useLocalCache = core.getInput("use-local-cache") === "true";
  // The location is runner-specific, so a self-hosted runner can set this once in its
  // own environment instead of every workflow repeating it via `with:`.
  const localCacheLocation = useLocalCache
    ? core.getInput("local-cache-location") || process.env.SETUP_GCC_TOOLCHAIN_LOCAL_CACHE_LOCATION || undefined
    : undefined;
  if (useLocalCache && !localCacheLocation) {
    throw new Error(
      "use-local-cache is true but local-cache-location was not provided " +
      "(and SETUP_GCC_TOOLCHAIN_LOCAL_CACHE_LOCATION is not set)."
    );
  }
  return {
    toolchainName: core.getInput("toolchain", { required: true }),
    vendor: core.getInput("vendor") || undefined,
    version: core.getInput("version") || "latest",
    useRemoteCache: core.getInput("use-remote-cache") !== "false",
    useLocalCache,
    localCacheLocation,
    setLdLibraryPath: core.getInput("set-ld-library-path") !== "false",
  };
}

/** Finds the toolchain's runtime shared-library directory (lib64 takes priority over lib), if any. */
function findLibDir(toolchainRoot: string): string | undefined {
  for (const candidate of ["lib64", "lib"]) {
    const dir = path.join(toolchainRoot, candidate);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- toolchainRoot is derived from the already-validated installDir
    if (fs.existsSync(dir)) return dir;
  }
  return undefined;
}

/**
 * Local cache files are keyed by checksum (not by URL basename): the checksum is unique
 * per toolchain/vendor/version, so two unrelated entries whose upstream archives happen to
 * share a filename (e.g. a generic "linux-x64.tar.gz") can't collide or evict one another.
 * The checksum here is only ever used as an opaque, collision-resistant filename component —
 * it is still independently re-verified against the file's actual contents on every read.
 */
function localArchivePathFor(localCacheLocation: string, entry: ToolchainEntry): string {
  const archiveName = path.basename(entry.url);
  const localArchivePath = path.join(localCacheLocation, `${entry.sha256.toLowerCase()}-${archiveName}`);
  assertWithinDir(localCacheLocation, localArchivePath);
  return localArchivePath;
}

/**
 * Fetches the toolchain archive, preferring (in order) a verified local-disk cache entry,
 * then a verified download. The local cache is a directory of raw archives, so an existing
 * checksum from the toolchain database is always re-checked against whatever's on disk —
 * a mismatch (corruption, tampering, stale entry) is treated as a miss and falls back to
 * downloading fresh. Writes into the local cache go through a temp file + atomic rename so
 * concurrent action instances sharing the same directory never observe a partial archive.
 * Local-cache reads/writes are best-effort: a cache directory that's unwritable, full, or
 * otherwise misbehaving only logs a warning — it never fails an install that already has a
 * verified archive in hand.
 */
export async function fetchArchive(
  entry: ToolchainEntry,
  useLocalCache: boolean,
  localCacheLocation: string | undefined
): Promise<string> {
  const archiveName = path.basename(entry.url);

  if (useLocalCache && localCacheLocation !== undefined) {
    const localArchivePath = localArchivePathFor(localCacheLocation, entry);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- localArchivePath is derived from validated localCacheLocation + basename(url)
    if (fs.existsSync(localArchivePath)) {
      core.info(`Found ${archiveName} in local cache, verifying...`);
      try {
        await verifyChecksum(localArchivePath, entry.sha256);
        core.info("Local cache checksum OK.");
        return localArchivePath;
      } catch (err) {
        core.warning(
          `Local cache entry failed checksum verification, re-downloading: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        try {
          // eslint-disable-next-line security/detect-non-literal-fs-filename -- localArchivePath is derived from validated localCacheLocation + basename(url)
          fs.rmSync(localArchivePath, { force: true });
        } catch (rmErr) {
          core.warning(
            `Could not remove stale local cache entry (continuing anyway): ${
              rmErr instanceof Error ? rmErr.message : String(rmErr)
            }`
          );
        }
      }
    }
  }

  core.info(`Downloading ${archiveName}...`);
  const archivePath = await downloadToolWithRetry(entry.url);

  core.info("Verifying SHA256...");
  await verifyChecksum(archivePath, entry.sha256);

  if (useLocalCache && localCacheLocation !== undefined) {
    try {
      const localArchivePath = localArchivePathFor(localCacheLocation, entry);
      const tmpPath = `${localArchivePath}.${process.pid}.tmp`;
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- localCacheLocation is a validated input
      fs.mkdirSync(localCacheLocation, { recursive: true });
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- archivePath comes from tc.downloadTool(), tmpPath is derived from validated localCacheLocation
      fs.copyFileSync(archivePath, tmpPath);
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- tmpPath/localArchivePath are derived from validated localCacheLocation; rename is atomic on the same filesystem
      fs.renameSync(tmpPath, localArchivePath);
      core.info(`Saved to local cache: ${localArchivePath}`);
    } catch (err) {
      // Saving to the local cache is an optimization, not a correctness requirement —
      // we already have a verified archive, so a disk-full/read-only/permission failure
      // here shouldn't fail the whole install.
      core.warning(
        `Could not save to local cache (continuing without it): ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return archivePath;
}

/** Restores from remote cache, or downloads (via the local cache when enabled) and extracts into installDir. Returns whether a cache was hit. */
async function installToolchain(
  entry: ToolchainEntry,
  installDir: string,
  cacheKey: string,
  useRemoteCache: boolean,
  useLocalCache: boolean,
  localCacheLocation: string | undefined
): Promise<boolean> {
  if (useRemoteCache) {
    const restoredKey = await cache.restoreCache([installDir], cacheKey);
    if (restoredKey !== undefined) {
      core.info(`Restored from cache: ${restoredKey}`);
      return true;
    }
  }

  const archivePath = await fetchArchive(entry, useLocalCache, localCacheLocation);
  const archiveName = path.basename(entry.url);

  core.info(`Extracting to ${installDir}...`);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- installDir was just checked by assertWithinDir() above
  fs.mkdirSync(installDir, { recursive: true });

  if (archiveName.endsWith(".zip")) {
    await tc.extractZip(archivePath, installDir);
  } else {
    await tc.extractTar(archivePath, installDir, tarFlags(archiveName));
  }

  if (useRemoteCache) {
    core.info("Saving to remote cache...");
    await cache.saveCache([installDir], cacheKey);
  }
  return false;
}

async function run(): Promise<void> {
  const {
    toolchainName,
    vendor,
    version,
    useRemoteCache,
    useLocalCache,
    localCacheLocation,
    setLdLibraryPath,
  } = readInputs();

  const repoRoot = path.join(__dirname, "..");
  const entry = resolveToolchain(repoRoot, toolchainName, version, undefined, vendor);

  const resolvedVersion = version === "latest"
    ? path.basename(entry.url).match(/[\d.]+[-_][\d.]+/)?.[0] ?? version
    : version;

  core.info(`Toolchain: ${toolchainName} @ ${resolvedVersion}`);
  core.info(`URL: ${entry.url}`);
  assertSupportedScheme(entry.url);

  const runnerTemp = process.env.RUNNER_TEMP ?? "/tmp";
  const installDir = path.join(runnerTemp, "gcc-toolchain", `${toolchainName}-${resolvedVersion}`);
  assertWithinDir(runnerTemp, installDir);
  const cacheKey = `setup-gcc-toolchain-v1-${toolchainName}-${resolvedVersion}-${process.platform}-${process.arch}`;

  const cacheHit = await installToolchain(
    entry,
    installDir,
    cacheKey,
    useRemoteCache,
    useLocalCache,
    localCacheLocation
  );

  const toolchainRoot = findToolchainRoot(installDir);
  const binPath = path.join(toolchainRoot, "bin");

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- binPath is derived from the already-validated installDir
  if (!fs.existsSync(binPath)) {
    throw new Error(`bin/ not found under ${installDir}. Archive layout may be unexpected.`);
  }

  // Prepend to PATH so this toolchain takes priority over any pre-installed one
  core.addPath(binPath);

  core.setOutput("toolchain-path", toolchainRoot);
  core.setOutput("cache-hit", String(cacheHit));

  core.info(`Added to PATH (first position): ${binPath}`);

  if (setLdLibraryPath) {
    const libDir = findLibDir(toolchainRoot);
    if (libDir !== undefined) {
      const existing = process.env.LD_LIBRARY_PATH;
      core.exportVariable("LD_LIBRARY_PATH", existing ? `${libDir}:${existing}` : libDir);
      core.info(`Prepended to LD_LIBRARY_PATH: ${libDir}`);
    }
  }

  await verifyOnPath(binPath, toolchainName);
}

// Guards against side effects when this module is imported by tests rather than executed directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err: unknown) => {
    core.setFailed(err instanceof Error ? err.message : String(err));
  });
}
