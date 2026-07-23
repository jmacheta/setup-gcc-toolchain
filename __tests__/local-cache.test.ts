import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import type { ToolchainEntry } from "../src/toolchains.js";

function sha256Of(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

const downloadToolMock = jest.fn<() => Promise<string>>();
const extractZipMock = jest.fn();
const extractTarMock = jest.fn();

jest.unstable_mockModule("@actions/tool-cache", () => ({
  downloadTool: downloadToolMock,
  extractZip: extractZipMock,
  extractTar: extractTarMock,
}));

const restoreCacheMock = jest.fn<() => Promise<string | undefined>>(async () => undefined);
const saveCacheMock = jest.fn<() => Promise<number>>(async () => 0);

jest.unstable_mockModule("@actions/cache", () => ({
  restoreCache: restoreCacheMock,
  saveCache: saveCacheMock,
}));

const { fetchArchive, installToolchain, readInputs } = await import("../src/index.js");

const inputEnvKeys = (name: string): string => `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;

describe("fetchArchive (local cache)", () => {
  let localCacheLocation: string;
  let downloadedPath: string;

  beforeEach(() => {
    localCacheLocation = fs.mkdtempSync(path.join(os.tmpdir(), "local-cache-"));
    downloadedPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "download-")), "toolchain-1.0.0.tar.gz");
    downloadToolMock.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(localCacheLocation, { recursive: true, force: true });
    fs.rmSync(path.dirname(downloadedPath), { recursive: true, force: true });
  });

  it("uses the local cache entry without downloading when its checksum matches", async () => {
    const genuineSha256 = crypto.createHash("sha256").update("genuine archive contents").digest("hex");
    const cachedArchivePath = path.join(localCacheLocation, `${genuineSha256}-toolchain-1.0.0.tar.gz`);
    fs.writeFileSync(cachedArchivePath, "genuine archive contents");
    const entry: ToolchainEntry = {
      url: "https://example.com/dist/toolchain-1.0.0.tar.gz",
      sha256: genuineSha256,
    };

    const result = await fetchArchive(entry, true, localCacheLocation);

    expect(result).toBe(cachedArchivePath);
    expect(downloadToolMock).not.toHaveBeenCalled();
  });

  it("falls back to downloading when the local cache entry fails checksum verification", async () => {
    fs.writeFileSync(downloadedPath, "genuine archive contents");
    const entry: ToolchainEntry = {
      url: "https://example.com/dist/toolchain-1.0.0.tar.gz",
      sha256: sha256Of(downloadedPath),
    };
    const cachedArchivePath = path.join(localCacheLocation, `${entry.sha256}-toolchain-1.0.0.tar.gz`);
    fs.writeFileSync(cachedArchivePath, "corrupted / tampered contents");
    downloadToolMock.mockResolvedValue(downloadedPath);

    const result = await fetchArchive(entry, true, localCacheLocation);

    expect(downloadToolMock).toHaveBeenCalledTimes(1);
    expect(result).toBe(downloadedPath);
    // the corrupt entry must have been replaced with the freshly verified download
    expect(fs.readFileSync(cachedArchivePath, "utf8")).toBe("genuine archive contents");
  });

  it("rejects a download whose checksum doesn't match the toolchain database entry", async () => {
    fs.writeFileSync(downloadedPath, "genuine archive contents");
    const entry: ToolchainEntry = {
      url: "https://example.com/dist/toolchain-1.0.0.tar.gz",
      sha256: "0".repeat(64),
    };
    downloadToolMock.mockResolvedValue(downloadedPath);

    await expect(fetchArchive(entry, true, localCacheLocation)).rejects.toThrow(/SHA256 mismatch/);
  });

  it("never trusts a cached entry when the database has no checksum for it", async () => {
    const cachedArchivePath = path.join(localCacheLocation, "-toolchain-1.0.0.tar.gz");
    fs.writeFileSync(cachedArchivePath, "anything at all");
    fs.writeFileSync(downloadedPath, "anything at all, freshly downloaded");
    downloadToolMock.mockResolvedValue(downloadedPath);
    const entry: ToolchainEntry = { url: "https://example.com/dist/toolchain-1.0.0.tar.gz", sha256: "" };

    // No checksum to verify against means the archive can never be trusted — the cached
    // entry is rejected, and the fresh download that follows fails the same way.
    await expect(fetchArchive(entry, true, localCacheLocation)).rejects.toThrow(/No SHA256 checksum available/);
    expect(downloadToolMock).toHaveBeenCalledTimes(1);
  });

  it("populates the local cache atomically, leaving no temp file behind", async () => {
    fs.writeFileSync(downloadedPath, "genuine archive contents");
    const entry: ToolchainEntry = {
      url: "https://example.com/dist/toolchain-1.0.0.tar.gz",
      sha256: sha256Of(downloadedPath),
    };
    downloadToolMock.mockResolvedValue(downloadedPath);

    await fetchArchive(entry, true, localCacheLocation);

    const entries = fs.readdirSync(localCacheLocation);
    expect(entries).toEqual([`${entry.sha256}-toolchain-1.0.0.tar.gz`]);
  });

  it("downloads without touching the filesystem cache when useLocalCache is false", async () => {
    fs.writeFileSync(downloadedPath, "genuine archive contents");
    const entry: ToolchainEntry = {
      url: "https://example.com/dist/toolchain-1.0.0.tar.gz",
      sha256: sha256Of(downloadedPath),
    };
    downloadToolMock.mockResolvedValue(downloadedPath);

    const result = await fetchArchive(entry, false, undefined);

    expect(result).toBe(downloadedPath);
    expect(fs.readdirSync(localCacheLocation)).toEqual([]);
  });

  it("does not let two entries with the same upstream filename collide in the cache", async () => {
    fs.writeFileSync(downloadedPath, "toolchain A contents");
    const entryA: ToolchainEntry = {
      url: "https://vendor-a.example.com/dist/linux-x64.tar.gz",
      sha256: sha256Of(downloadedPath),
    };
    downloadToolMock.mockResolvedValueOnce(downloadedPath);
    const resultA = await fetchArchive(entryA, true, localCacheLocation);
    expect(fs.readFileSync(resultA, "utf8")).toBe("toolchain A contents");

    const downloadedPathB = path.join(path.dirname(downloadedPath), "b", "linux-x64.tar.gz");
    fs.mkdirSync(path.dirname(downloadedPathB), { recursive: true });
    fs.writeFileSync(downloadedPathB, "toolchain B contents");
    const entryB: ToolchainEntry = {
      url: "https://vendor-b.example.com/dist/linux-x64.tar.gz",
      sha256: sha256Of(downloadedPathB),
    };
    downloadToolMock.mockResolvedValueOnce(downloadedPathB);
    const resultB = await fetchArchive(entryB, true, localCacheLocation);
    expect(fs.readFileSync(resultB, "utf8")).toBe("toolchain B contents");

    // Both survive independently in the cache directory — neither one evicted the other.
    expect(downloadToolMock).toHaveBeenCalledTimes(2);
    expect(fs.readFileSync(path.join(localCacheLocation, `${entryA.sha256}-linux-x64.tar.gz`), "utf8"))
      .toBe("toolchain A contents");
    expect(fs.readFileSync(path.join(localCacheLocation, `${entryB.sha256}-linux-x64.tar.gz`), "utf8"))
      .toBe("toolchain B contents");
  });

  it("still returns the verified download when the local cache directory can't be created", async () => {
    // A regular file sitting where the cache directory should be — deterministically makes
    // mkdirSync(..., {recursive:true}) fail (ENOTDIR/EEXIST) without relying on permission
    // bits, which can be unreliable to test under a root-running CI container.
    const brokenLocation = path.join(os.tmpdir(), `broken-local-cache-${process.pid}`);
    fs.writeFileSync(brokenLocation, "a file, not a directory");
    try {
      fs.writeFileSync(downloadedPath, "genuine archive contents");
      const entry: ToolchainEntry = {
        url: "https://example.com/dist/toolchain-1.0.0.tar.gz",
        sha256: sha256Of(downloadedPath),
      };
      downloadToolMock.mockResolvedValue(downloadedPath);

      const result = await fetchArchive(entry, true, brokenLocation);

      expect(result).toBe(downloadedPath);
      expect(fs.existsSync(downloadedPath)).toBe(true);
    } finally {
      fs.rmSync(brokenLocation, { force: true });
    }
  });

  it("still falls back to a fresh download when a stale cache entry can't be deleted", async () => {
    fs.writeFileSync(downloadedPath, "genuine archive contents");
    const entry: ToolchainEntry = {
      url: "https://example.com/dist/toolchain-1.0.0.tar.gz",
      sha256: sha256Of(downloadedPath),
    };
    // A directory where the cached archive should be: verifyChecksum's read stream fails
    // (EISDIR) same as a corrupt file would, but the subsequent non-recursive rmSync also
    // fails (EISDIR) — deterministically exercising the "cleanup itself failed" path.
    const cachedArchivePath = path.join(localCacheLocation, `${entry.sha256}-toolchain-1.0.0.tar.gz`);
    fs.mkdirSync(cachedArchivePath);
    downloadToolMock.mockResolvedValue(downloadedPath);

    const result = await fetchArchive(entry, true, localCacheLocation);

    expect(result).toBe(downloadedPath);
    expect(downloadToolMock).toHaveBeenCalledTimes(1);
  });
});

describe("installToolchain (remote cache)", () => {
  let installDir: string;

  beforeEach(() => {
    installDir = fs.mkdtempSync(path.join(os.tmpdir(), "install-dir-"));
    restoreCacheMock.mockReset().mockResolvedValue(undefined);
    saveCacheMock.mockReset().mockResolvedValue(0);
    downloadToolMock.mockReset();
    extractZipMock.mockReset();
    extractTarMock.mockReset();
  });

  afterEach(() => {
    fs.rmSync(installDir, { recursive: true, force: true });
  });

  it("on a remote cache hit, skips downloading, extracting, and re-uploading", async () => {
    restoreCacheMock.mockResolvedValue("some-cache-key");
    const entry: ToolchainEntry = { url: "https://example.com/dist/toolchain-1.0.0.tar.gz", sha256: "irrelevant" };

    const cacheHit = await installToolchain(entry, installDir, "cache-key", true, false, undefined);

    expect(cacheHit).toBe(true);
    expect(downloadToolMock).not.toHaveBeenCalled();
    expect(extractTarMock).not.toHaveBeenCalled();
    expect(saveCacheMock).not.toHaveBeenCalled();
  });

  it("on a remote cache miss, downloads, extracts, and uploads to the remote cache", async () => {
    const downloadedPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "download-")), "toolchain-1.0.0.tar.gz");
    fs.writeFileSync(downloadedPath, "genuine archive contents");
    const entry: ToolchainEntry = {
      url: "https://example.com/dist/toolchain-1.0.0.tar.gz",
      sha256: crypto.createHash("sha256").update("genuine archive contents").digest("hex"),
    };
    downloadToolMock.mockResolvedValue(downloadedPath);

    try {
      const cacheHit = await installToolchain(entry, installDir, "cache-key", true, false, undefined);

      expect(cacheHit).toBe(false);
      expect(downloadToolMock).toHaveBeenCalledTimes(1);
      expect(extractTarMock).toHaveBeenCalledTimes(1);
      expect(saveCacheMock).toHaveBeenCalledTimes(1);
    } finally {
      fs.rmSync(path.dirname(downloadedPath), { recursive: true, force: true });
    }
  });

  it("never touches the remote cache when useRemoteCache is false", async () => {
    const downloadedPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "download-")), "toolchain-1.0.0.tar.gz");
    fs.writeFileSync(downloadedPath, "genuine archive contents");
    const entry: ToolchainEntry = {
      url: "https://example.com/dist/toolchain-1.0.0.tar.gz",
      sha256: crypto.createHash("sha256").update("genuine archive contents").digest("hex"),
    };
    downloadToolMock.mockResolvedValue(downloadedPath);

    try {
      const cacheHit = await installToolchain(entry, installDir, "cache-key", false, false, undefined);

      expect(cacheHit).toBe(false);
      expect(restoreCacheMock).not.toHaveBeenCalled();
      expect(saveCacheMock).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(path.dirname(downloadedPath), { recursive: true, force: true });
    }
  });
});

describe("installToolchain (local cache)", () => {
  let installDir: string;
  let localCacheLocation: string;

  beforeEach(() => {
    installDir = fs.mkdtempSync(path.join(os.tmpdir(), "install-dir-"));
    localCacheLocation = fs.mkdtempSync(path.join(os.tmpdir(), "local-cache-"));
    restoreCacheMock.mockReset().mockResolvedValue(undefined);
    saveCacheMock.mockReset().mockResolvedValue(0);
    downloadToolMock.mockReset();
    extractZipMock.mockReset();
    extractTarMock.mockReset();
  });

  afterEach(() => {
    fs.rmSync(installDir, { recursive: true, force: true });
    fs.rmSync(localCacheLocation, { recursive: true, force: true });
  });

  it("on a local cache hit, skips downloading but still extracts (the archive cache holds no extracted output)", async () => {
    const entry: ToolchainEntry = {
      url: "https://example.com/dist/toolchain-1.0.0.tar.gz",
      sha256: crypto.createHash("sha256").update("genuine archive contents").digest("hex"),
    };
    fs.writeFileSync(path.join(localCacheLocation, `${entry.sha256}-toolchain-1.0.0.tar.gz`), "genuine archive contents");

    const cacheHit = await installToolchain(entry, installDir, "cache-key", false, true, localCacheLocation);

    expect(downloadToolMock).not.toHaveBeenCalled();
    expect(extractTarMock).toHaveBeenCalledTimes(1);
    // installToolchain's cacheHit output only reflects a *remote* actions/cache restore —
    // a local archive-cache hit still re-extracts, so it isn't reported as a cache hit here.
    expect(cacheHit).toBe(false);
  });

  it("on a local cache miss, downloads, extracts, and saves into the local cache", async () => {
    const downloadedPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "download-")), "toolchain-1.0.0.tar.gz");
    fs.writeFileSync(downloadedPath, "genuine archive contents");
    const entry: ToolchainEntry = {
      url: "https://example.com/dist/toolchain-1.0.0.tar.gz",
      sha256: crypto.createHash("sha256").update("genuine archive contents").digest("hex"),
    };
    downloadToolMock.mockResolvedValue(downloadedPath);

    try {
      const cacheHit = await installToolchain(entry, installDir, "cache-key", false, true, localCacheLocation);

      expect(cacheHit).toBe(false);
      expect(downloadToolMock).toHaveBeenCalledTimes(1);
      expect(extractTarMock).toHaveBeenCalledTimes(1);
      expect(fs.readdirSync(localCacheLocation)).toEqual([`${entry.sha256}-toolchain-1.0.0.tar.gz`]);
      expect(restoreCacheMock).not.toHaveBeenCalled();
      expect(saveCacheMock).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(path.dirname(downloadedPath), { recursive: true, force: true });
    }
  });

  it("never touches the local cache directory when useLocalCache is false", async () => {
    const downloadedPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "download-")), "toolchain-1.0.0.tar.gz");
    fs.writeFileSync(downloadedPath, "genuine archive contents");
    const entry: ToolchainEntry = {
      url: "https://example.com/dist/toolchain-1.0.0.tar.gz",
      sha256: crypto.createHash("sha256").update("genuine archive contents").digest("hex"),
    };
    downloadToolMock.mockResolvedValue(downloadedPath);

    try {
      await installToolchain(entry, installDir, "cache-key", false, false, undefined);
      expect(fs.readdirSync(localCacheLocation)).toEqual([]);
    } finally {
      fs.rmSync(path.dirname(downloadedPath), { recursive: true, force: true });
    }
  });
});

describe("readInputs (cache-strategy resolution)", () => {
  const managedKeys = [
    inputEnvKeys("toolchain"),
    inputEnvKeys("cache-strategy"),
    inputEnvKeys("local-cache-location"),
    inputEnvKeys("vendor"),
    inputEnvKeys("version"),
    inputEnvKeys("set-ld-library-path"),
    "SETUP_GCC_TOOLCHAIN_LOCAL_CACHE_LOCATION",
  ];
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of managedKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env[inputEnvKeys("toolchain")] = "arm-none-eabi";
  });

  afterEach(() => {
    for (const key of managedKeys) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it("defaults to remote-only when cache-strategy is omitted", () => {
    const result = readInputs();
    expect(result.useRemoteCache).toBe(true);
    expect(result.useLocalCache).toBe(false);
    expect(result.localCacheLocation).toBeUndefined();
  });

  it("rejects an unrecognized cache-strategy value", () => {
    process.env[inputEnvKeys("cache-strategy")] = "bogus";
    expect(() => readInputs()).toThrow(/cache-strategy must be one of/);
  });

  it('"none" disables both caches', () => {
    process.env[inputEnvKeys("cache-strategy")] = "none";
    const result = readInputs();
    expect(result.useRemoteCache).toBe(false);
    expect(result.useLocalCache).toBe(false);
  });

  it('"remote" enables only the remote cache', () => {
    process.env[inputEnvKeys("cache-strategy")] = "remote";
    const result = readInputs();
    expect(result.useRemoteCache).toBe(true);
    expect(result.useLocalCache).toBe(false);
  });

  it('"local" enables only the local cache and requires a location', () => {
    process.env[inputEnvKeys("cache-strategy")] = "local";
    expect(() => readInputs()).toThrow(/local-cache-location/);

    process.env[inputEnvKeys("local-cache-location")] = "/some/cache";
    const result = readInputs();
    expect(result.useRemoteCache).toBe(false);
    expect(result.useLocalCache).toBe(true);
    expect(result.localCacheLocation).toBe("/some/cache");
  });

  it('"both" enables both caches', () => {
    process.env[inputEnvKeys("cache-strategy")] = "both";
    process.env[inputEnvKeys("local-cache-location")] = "/some/cache";
    const result = readInputs();
    expect(result.useRemoteCache).toBe(true);
    expect(result.useLocalCache).toBe(true);
  });

  it("prefers the explicit local-cache-location input over the environment variable", () => {
    process.env[inputEnvKeys("cache-strategy")] = "local";
    process.env[inputEnvKeys("local-cache-location")] = "/explicit/from-input";
    process.env.SETUP_GCC_TOOLCHAIN_LOCAL_CACHE_LOCATION = "/from/env";

    expect(readInputs().localCacheLocation).toBe("/explicit/from-input");
  });

  it("falls back to the environment variable when local-cache-location is omitted", () => {
    process.env[inputEnvKeys("cache-strategy")] = "local";
    process.env.SETUP_GCC_TOOLCHAIN_LOCAL_CACHE_LOCATION = "/from/env";

    expect(readInputs().localCacheLocation).toBe("/from/env");
  });
});
