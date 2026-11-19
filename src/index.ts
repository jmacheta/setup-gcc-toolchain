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
import { fileURLToPath, pathToFileURL } from "url";
import { resolveToolchain, ToolchainEntry } from "./toolchains.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* eslint-disable security-node/detect-unhandled-async-errors -- errors anywhere in this function propagate to the top-level `run().catch()` handler; stream errors specifically are wired to `reject` below */
async function verifyChecksum(
  filePath: string,
  expectedSha256: string
): Promise<void> {
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

/** HTTP 4xx (except 408/429) won't get better on retry; tool-cache's HTTPError carries the status. */
function isClientError(err: unknown): boolean {
  const status = (err as { httpStatusCode?: number } | undefined)?.httpStatusCode;
  return status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/** Downloads and verifies the archive, retrying both network failures and corrupt (checksum-mismatched) downloads. */
async function downloadVerifiedWithRetry(entry: ToolchainEntry): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= DOWNLOAD_MAX_ATTEMPTS; attempt++) {
    let archivePath: string | undefined;
    try {
      archivePath = await tc.downloadTool(entry.url);
      core.info("🔒 Verifying SHA256...");
      await verifyChecksum(archivePath, entry.sha256);
      return archivePath;
    } catch (err) {
      lastError = err;
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- archivePath comes from tc.downloadTool()
      if (archivePath !== undefined) fs.rmSync(archivePath, { force: true });
      if (isClientError(err)) break;
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

/** RUNNER_TEMP, which every GitHub Actions job (hosted or self-hosted) sets. */
function runnerTemp(): string {
  const dir = process.env.RUNNER_TEMP;
  if (!dir) throw new Error("RUNNER_TEMP is not set; this action must run inside a GitHub Actions job.");
  return dir;
}

/**
 * Derives the tool prefix (what goes before "gcc") from the toolchain name. Most names
 * are a bare triplet (arm-none-eabi -> "arm-none-eabi-"); a few (x86_64-w64-mingw32-gcc)
 * already are the full binary name; "x86_64-gcc" means no prefix at all. Names that
 * don't follow the binaries (winlibs) set `prefix:` in the database instead.
 */
export function toolchainPrefix(toolchainName: string): string {
  if (toolchainName === "x86_64-gcc") return "";
  return toolchainName.endsWith("-gcc") ? toolchainName.slice(0, -"gcc".length) : `${toolchainName}-`;
}

/** Checks `<prefix>gcc` runs and returns its full version, or "" if the binary isn't there. */
async function verifyOnPath(binPath: string, prefix: string): Promise<string> {
  const ext = process.platform === "win32" ? ".exe" : "";
  const binaryPath = path.join(binPath, `${prefix}gcc${ext}`);

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- binaryPath is derived from the already-validated installDir
  if (!fs.existsSync(binaryPath)) {
    // Non-fatal: log a warning but don't fail — binary name may differ
    core.warning(
      `Expected binary not found at ${binaryPath}. ` +
      `Verify the toolchain name or check the archive contents.`
    );
    return "";
  }

  const run = async (args: string[]): Promise<string> => {
    let output = "";
    await exec.exec(`"${binaryPath}"`, args, {
      silent: true,
      ignoreReturnCode: true,
      listeners: { stdout: (d) => { output += d.toString(); } },
    });
    return output;
  };
  core.info(`✅ Verified: ${(await run(["--version"])).split("\n")[0].trim()}`);
  // -dumpversion as well: GCC < 7 has no -dumpfullversion and answers this pair with -dumpversion.
  return (await run(["-dumpfullversion", "-dumpversion"])).trim();
}

interface RunInputs {
  toolchainName: string;
  vendor: string | undefined;
  version: string;
  useRemoteCache: boolean;
  useLocalCache: boolean;
  localCacheLocation: string | undefined;
  /** undefined when not set: then only native toolchains (empty prefix) get LD_LIBRARY_PATH. */
  setLdLibraryPath: boolean | undefined;
}

const CACHE_STRATEGIES = ["none", "local", "remote", "both"] as const;
type CacheStrategy = (typeof CACHE_STRATEGIES)[number];

function readCacheStrategy(): CacheStrategy {
  const raw = core.getInput("cache-strategy") || "remote";
  if (!(CACHE_STRATEGIES as readonly string[]).includes(raw)) {
    throw new Error(`cache-strategy must be one of: ${CACHE_STRATEGIES.join(", ")} (got "${raw}")`);
  }
  return raw as CacheStrategy;
}

export function readInputs(): RunInputs {
  const cacheStrategy = readCacheStrategy();
  const useRemoteCache = cacheStrategy === "remote" || cacheStrategy === "both";
  const useLocalCache = cacheStrategy === "local" || cacheStrategy === "both";

  // The location is runner-specific, so a self-hosted runner can set this once in its
  // own environment instead of every workflow repeating it via `with:`.
  const localCacheLocation = useLocalCache
    ? core.getInput("local-cache-location") || process.env.SETUP_GCC_TOOLCHAIN_LOCAL_CACHE_LOCATION || undefined
    : undefined;
  if (useLocalCache && !localCacheLocation) {
    throw new Error(
      `cache-strategy is "${cacheStrategy}" but local-cache-location was not provided ` +
      "(and SETUP_GCC_TOOLCHAIN_LOCAL_CACHE_LOCATION is not set)."
    );
  }

  return {
    toolchainName: core.getInput("toolchain", { required: true }),
    vendor: core.getInput("vendor") || undefined,
    version: core.getInput("version") || "latest",
    useRemoteCache,
    useLocalCache,
    localCacheLocation,
    setLdLibraryPath: core.getInput("set-ld-library-path") === "" ? undefined : core.getBooleanInput("set-ld-library-path"),
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
 * Returns a private, verified copy of the cached archive if a cache entry exists and passes
 * checksum verification, `undefined` on a cache miss. The copy (in RUNNER_TEMP) is what gets
 * verified and extracted, so a shared cache file changed after the check is never used.
 * A failed/unreadable entry is treated as a miss and best-effort deleted — deletion failure
 * only logs a warning, since falling back to a fresh download is always safe.
 */
async function tryLocalCache(
  entry: ToolchainEntry,
  archiveName: string,
  localCacheLocation: string
): Promise<string | undefined> {
  const localArchivePath = localArchivePathFor(localCacheLocation, entry);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- localArchivePath is derived from validated localCacheLocation + basename(url)
  if (!fs.existsSync(localArchivePath)) return undefined;

  core.info(`💾 Found ${archiveName} in cache, verifying...`);
  const privateCopy = path.join(fs.mkdtempSync(path.join(runnerTemp(), "setup-gcc-toolchain-")), archiveName);
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- both paths are derived from validated directories
    fs.copyFileSync(localArchivePath, privateCopy);
    await verifyChecksum(privateCopy, entry.sha256);
    core.info("✅ Cache checksum OK.");
    return privateCopy;
  } catch (err) {
    core.warning(
      `Cache entry failed checksum verification, re-downloading: ${
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
    return undefined;
  }
}

/**
 * Saves a freshly downloaded, already-verified archive into the local cache via a
 * temp file + atomic rename, so concurrent action instances sharing the same directory
 * never observe a partial archive. Best-effort: saving is an optimization, not a
 * correctness requirement, so a disk-full/read-only/permission failure here only logs
 * a warning — it never fails an install that already has a verified archive in hand.
 */
function saveToLocalCache(entry: ToolchainEntry, archivePath: string, localCacheLocation: string): void {
  try {
    const localArchivePath = localArchivePathFor(localCacheLocation, entry);
    const tmpPath = `${localArchivePath}.${crypto.randomUUID()}.tmp`;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- localCacheLocation is a validated input
    fs.mkdirSync(localCacheLocation, { recursive: true, mode: 0o750 });
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- archivePath comes from tc.downloadTool(), tmpPath is derived from validated localCacheLocation
    fs.copyFileSync(archivePath, tmpPath);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- tmpPath/localArchivePath are derived from validated localCacheLocation; rename is atomic on the same filesystem
    fs.renameSync(tmpPath, localArchivePath);
    core.info(`💾 Cached archive: ${localArchivePath}`);
  } catch (err) {
    core.warning(
      `Could not save to local cache (continuing without it): ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

/**
 * Fetches the toolchain archive, preferring (in order) a verified local-disk cache entry,
 * then a verified download. The local cache is a directory of raw archives, so an existing
 * checksum from the toolchain database is always re-checked against whatever's on disk —
 * a mismatch (corruption, tampering, stale entry) is treated as a miss and falls back to
 * downloading fresh.
 */
export async function fetchArchive(
  entry: ToolchainEntry,
  useLocalCache: boolean,
  localCacheLocation: string | undefined
): Promise<string> {
  const archiveName = path.basename(entry.url);
  if (!entry.sha256) {
    throw new Error(
      `No SHA256 checksum available for ${archiveName}. ` +
      `This toolchain version cannot be verified. ` +
      `Choose a different version or contribute a checksum via pull request.`
    );
  }

  if (useLocalCache && localCacheLocation !== undefined) {
    const cached = await tryLocalCache(entry, archiveName, localCacheLocation);
    if (cached !== undefined) return cached;
  }

  core.info(`⬇️ Downloading ${archiveName}...`);
  const archivePath = await downloadVerifiedWithRetry(entry);

  if (useLocalCache && localCacheLocation !== undefined) {
    saveToLocalCache(entry, archivePath, localCacheLocation);
  }

  return archivePath;
}

function isAlreadyInstalled(installDir: string): boolean {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- installDir was checked by assertWithinDir() in run() before this is called
  return fs.existsSync(installDir) && fs.readdirSync(installDir).length > 0;
}

/**
 * Gets the archive from the remote cache (re-verified), the local cache or a download, and
 * extracts it into installDir. The remote cache holds the archive, not the extracted tree, so
 * a restored entry is checked against the database sha256 like any other. Returns whether a
 * verified remote cache entry was used.
 */
export async function installToolchain(
  entry: ToolchainEntry,
  installDir: string,
  cacheKey: string,
  useRemoteCache: boolean,
  useLocalCache: boolean,
  localCacheLocation: string | undefined
): Promise<boolean> {
  if (isAlreadyInstalled(installDir)) {
    // Installed by an earlier step of this job; not a cache hit, and not re-verified.
    core.info(`✅ Already installed at ${installDir}, skipping download.`);
    return false;
  }

  const archiveName = path.basename(entry.url);
  const remoteArchiveDir = `${installDir}-archive`;
  let archivePath: string | undefined;
  if (useRemoteCache) {
    const restoredKey = await cache.restoreCache([remoteArchiveDir], cacheKey);
    if (restoredKey !== undefined) {
      core.info(`♻️ Restored from remote cache: ${restoredKey}`);
      archivePath = await tryLocalCache(entry, archiveName, remoteArchiveDir);
    }
  }
  const cacheHit = archivePath !== undefined;
  archivePath ??= await fetchArchive(entry, useLocalCache, localCacheLocation);

  // Extract into a private, uniquely-named temp dir and move it into place with a single
  // atomic rename — the same temp-file + rename pattern saveToLocalCache uses above, applied
  // to the whole install directory. This is what makes two concurrent invocations of this
  // action for the same toolchain/version (e.g. parallel jobs on a shared self-hosted runner)
  // safe: each extracts to its own tempInstallDir, so neither ever observes the other's
  // partially-written files, and rename() is atomic so exactly one of them ends up at
  // installDir. The loser's rename fails because installDir already exists non-empty; it
  // just discards its own (redundant but harmless) copy.
  const tempInstallDir = `${installDir}.${crypto.randomUUID()}.tmp`;
  core.startGroup(`Extracting ${archiveName}`);
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- tempInstallDir is derived from the already-validated installDir
    fs.mkdirSync(tempInstallDir, { recursive: true });
    if (archiveName.endsWith(".zip")) {
      await tc.extractZip(archivePath, tempInstallDir);
    } else {
      await tc.extractTar(archivePath, tempInstallDir, tarFlags(archiveName));
    }
  } finally {
    core.endGroup();
  }

  try {
    // installDir must not already exist for the rename below to behave identically on POSIX
    // and Windows (POSIX allows renaming onto an empty dir; Windows rejects it outright even
    // when empty). It can only be empty here (isAlreadyInstalled already ruled out non-empty),
    // so removing it first is safe — unless a concurrent run just populated it, in which case
    // this throws ENOTEMPTY and falls into the concurrent-install handling below.
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- installDir was checked by assertWithinDir() in run() before this is called
    if (fs.existsSync(installDir)) fs.rmdirSync(installDir);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- both paths are derived from the already-validated installDir
    fs.renameSync(tempInstallDir, installDir);
    core.info(`📂 Installed to ${installDir}`);
  } catch (err) {
    if (!isAlreadyInstalled(installDir)) throw err;
    core.info(`✅ ${installDir} was installed concurrently by another run, discarding our own copy.`);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- tempInstallDir is derived from the already-validated installDir
    fs.rmSync(tempInstallDir, { recursive: true, force: true });
  }

  if (useRemoteCache && !cacheHit) {
    core.info("☁️ Saving to remote cache...");
    try {
      saveToLocalCache(entry, archivePath, remoteArchiveDir);
      await cache.saveCache([remoteArchiveDir], cacheKey);
    } catch (err) {
      // Non-fatal: the cache key may already be reserved by another run with the same
      // toolchain/version/platform (e.g. this action invoked twice in one job, or two
      // concurrent jobs on the same self-hosted runner) — the install itself already
      // succeeded, so don't fail the step over an optimization.
      core.warning(
        `Could not save to remote cache (continuing without it): ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }
  return cacheHit;
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

  const resolvedVersion = entry.version;

  core.info(`📦 Toolchain: ${toolchainName} @ ${resolvedVersion}`);
  core.info(`🔗 URL: ${entry.url}`);
  assertSupportedScheme(entry.url);

  // vendor and sha256 in both: two entries of the same name and version never share a directory
  // or a cache entry, and a database checksum change invalidates the cached archive.
  const sha256 = entry.sha256.toLowerCase();
  const tempDir = runnerTemp();
  const installDir = path.join(
    tempDir,
    "gcc-toolchain",
    `${entry.vendor}-${toolchainName}-${resolvedVersion}-${sha256.slice(0, 12)}`
  );
  assertWithinDir(tempDir, installDir);
  const cacheKey =
    `setup-gcc-toolchain-v2-${entry.vendor}-${toolchainName}-${resolvedVersion}-${sha256}-${process.platform}-${process.arch}`;

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

  const prefix = entry.prefix ?? toolchainPrefix(toolchainName);
  core.setOutput("toolchain-path", toolchainRoot);
  core.setOutput("cache-hit", String(cacheHit));
  core.setOutput("prefix", prefix);

  core.info(`🛣️ Added to PATH (first position): ${binPath}`);

  if (setLdLibraryPath ?? prefix === "") {
    const libDir = findLibDir(toolchainRoot);
    if (libDir !== undefined) {
      const existing = process.env.LD_LIBRARY_PATH;
      core.exportVariable("LD_LIBRARY_PATH", existing ? `${libDir}:${existing}` : libDir);
      core.info(`🔗 Prepended to LD_LIBRARY_PATH: ${libDir}`);
    }
  }

  core.setOutput("gcc-version", await verifyOnPath(binPath, prefix));

  // cacheHit only ever reflects a verified *remote* actions/cache restore (see installToolchain) —
  // stating it unconditionally would contradict a local-cache hit already logged above.
  const cacheNote = useRemoteCache ? ` (remote cache ${cacheHit ? "hit" : "miss"})` : "";
  core.info(`🎉 ${toolchainName} ${resolvedVersion} ready${cacheNote}.`);
}

// Guards against side effects when this module is imported by tests rather than executed directly.
// pathToFileURL (not a raw `file://` template) is required for this to work on Windows, where
// process.argv[1] is a backslash path ("C:\...") that doesn't already look like a file:// URI.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  run().catch((err: unknown) => {
    core.setFailed(err instanceof Error ? err.message : String(err));
  });
}
