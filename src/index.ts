import * as core from "@actions/core";
import * as cache from "@actions/cache";
import * as tc from "@actions/tool-cache";
import * as exec from "@actions/exec";
import * as path from "path";
import * as crypto from "crypto";
import * as fs from "fs";
import { resolveToolchain } from "./toolchains";

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
}

function tarFlags(archiveName: string): string {
  if (archiveName.endsWith(".tar.xz")) return "xJ";
  if (archiveName.endsWith(".tar.bz2")) return "xj";
  return "xz"; // .tar.gz
}

function findToolchainRoot(installDir: string): string {
  const entries = fs.readdirSync(installDir).filter((e) => {
    const stat = fs.statSync(path.join(installDir, e));
    return stat.isDirectory();
  });
  return entries.length === 1 ? path.join(installDir, entries[0]) : installDir;
}

const GCC_TOOLS = [
  "gcc", "g++", "cpp", "ar", "as", "ld", "nm",
  "objcopy", "objdump", "ranlib", "readelf", "size", "strings", "strip", "gdb",
];

async function runDumpMachine(gccPath: string): Promise<string | undefined> {
  let output = "";
  const code = await exec.exec(`"${gccPath}"`, ["-dumpmachine"], {
    silent: true,
    ignoreReturnCode: true,
    listeners: { stdout: (d) => { output += d.toString(); } },
  });
  if (code !== 0) return undefined;
  return output.trim() || undefined;
}

async function createTripletSymlinks(binPath: string): Promise<void> {
  const ext = process.platform === "win32" ? ".exe" : "";

  // Find the gcc binary — either bare "gcc" or prefixed "<triplet>-gcc"
  let gccBin: string | undefined;
  let existingPrefix: string | undefined;

  const bare = path.join(binPath, "gcc" + ext);
  if (fs.existsSync(bare)) {
    gccBin = bare;
    existingPrefix = "";
  } else {
    const entry = fs.readdirSync(binPath).find((f) => f.endsWith("-gcc" + ext));
    if (entry) {
      gccBin = path.join(binPath, entry);
      existingPrefix = entry.slice(0, -("-gcc" + ext).length);
    }
  }

  if (!gccBin) return;

  const triplet = await runDumpMachine(gccBin);
  if (!triplet) return;

  // No symlinks needed when the binary prefix already matches the triplet
  if (existingPrefix === triplet) return;

  let created = 0;
  for (const tool of GCC_TOOLS) {
    const src = path.join(binPath, (existingPrefix ? `${existingPrefix}-` : "") + tool + ext);
    const dest = path.join(binPath, `${triplet}-${tool}${ext}`);

    if (!fs.existsSync(src)) continue;
    if (fs.existsSync(dest)) continue;

    fs.symlinkSync(src, dest);
    created++;
  }

  if (created > 0) {
    core.info(`Created ${created} symlink(s) with triplet prefix "${triplet}"`);
  }
}

async function verifyOnPath(binPath: string, toolchainName: string): Promise<void> {
  // Derive a sensible binary name to probe: use the triplet prefix if present,
  // otherwise plain "gcc". For winlibs mingw the binary is e.g. x86_64-w64-mingw32-gcc.
  const probe = toolchainName.includes("w64-mingw32")
    ? `${toolchainName}-gcc`
    : toolchainName === "x86_64-gcc" || toolchainName === "avr"
    ? "gcc"
    : `${toolchainName}-gcc`;

  const ext = process.platform === "win32" ? ".exe" : "";
  const binaryPath = path.join(binPath, probe + ext);

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

async function run(): Promise<void> {
  const toolchainName = core.getInput("toolchain", { required: true });
  const vendor = core.getInput("vendor") || undefined;
  const version = core.getInput("version", { required: true });
  const enableCache = core.getInput("enable-cache") !== "false";

  const repoRoot = path.join(__dirname, "..");
  const entry = resolveToolchain(repoRoot, toolchainName, version, undefined, vendor);

  const resolvedVersion = version === "latest"
    ? path.basename(entry.url).match(/[\d.]+[-_][\d.]+/)?.[0] ?? version
    : version;

  core.info(`Toolchain: ${toolchainName} @ ${resolvedVersion}`);
  core.info(`URL: ${entry.url}`);

  const archiveName = path.basename(entry.url);
  const installDir = path.join(
    process.env["RUNNER_TEMP"] ?? "/tmp",
    "gcc-toolchain",
    `${toolchainName}-${resolvedVersion}`
  );
  const cacheKey = `setup-gcc-toolchain-v1-${toolchainName}-${resolvedVersion}-${process.platform}-${process.arch}`;

  let cacheHit = false;

  if (enableCache) {
    const restoredKey = await cache.restoreCache([installDir], cacheKey);
    cacheHit = restoredKey !== undefined;
    if (cacheHit) {
      core.info(`Restored from cache: ${restoredKey}`);
    }
  }

  if (!cacheHit) {
    core.info(`Downloading ${archiveName}...`);
    const archivePath = await tc.downloadTool(entry.url);

    core.info("Verifying SHA256...");
    await verifyChecksum(archivePath, entry.sha256);

    core.info(`Extracting to ${installDir}...`);
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
  }

  const toolchainRoot = findToolchainRoot(installDir);
  const binPath = path.join(toolchainRoot, "bin");

  if (!fs.existsSync(binPath)) {
    throw new Error(`bin/ not found under ${installDir}. Archive layout may be unexpected.`);
  }

  // Prepend to PATH so this toolchain takes priority over any pre-installed one
  core.addPath(binPath);

  core.setOutput("toolchain-path", toolchainRoot);
  core.setOutput("cache-hit", String(cacheHit));

  core.info(`Added to PATH (first position): ${binPath}`);

  if (process.platform !== "win32") {
    await createTripletSymlinks(binPath);
  }

  await verifyOnPath(binPath, toolchainName);
}

run().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
