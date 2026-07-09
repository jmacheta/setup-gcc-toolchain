#!/usr/bin/env node
/**
 * Checks upstream vendors for a GCC release newer than the newest one
 * already in the YAML database, and — where it can confidently resolve the
 * matching asset — patches the database in place with the new entry.
 *
 * Only currently-supported (vendor, toolchain, platform) combinations are
 * ever touched: this never adds a new toolchain or platform, only a newer
 * version of one that's already there.
 *
 * How matching works, per (file, vendor, toolchain):
 *   1. Take the newest version already in the database as a template.
 *   2. Build its filename "skeleton" — every digit run replaced by a
 *      placeholder — e.g. "xpack-arm-none-eabi-gcc-15.2.1-1.1-linux-x64.tar.gz"
 *      -> "xpack-arm-none-eabi-gcc-N-N-linux-x64.tar.gz".
 *   3. Scan upstream releases (GitHub Releases API, or GitLab's generic
 *      package registry for the `arm` vendor) newest-first for an asset
 *      whose skeleton matches exactly.
 *   4. The new version key is read off the matched asset at the same
 *      digit-run position the old key occupied in the old filename — so no
 *      per-vendor tag-parsing rules are needed.
 *   5. SHA256 is read from a sidecar checksum file when the vendor
 *      publishes one (xpack: "<asset>.sha", espressif: a combined
 *      "*-checksum.sha256", zakkemble: "SHA256SUMS", winlibs: "<asset>.sha256")
 *      — falling back to downloading the asset and hashing it. `arm` assets
 *      carry their sha256 directly in the GitLab package_files API response.
 *
 * A release newer than what's known but with no matching asset is reported
 * as "unresolved" rather than silently skipped or guessed.
 *
 * Usage:
 *   node scripts/check-new-versions.mjs [--out <path>] [--dry-run]
 *
 * Exit code is always 0. When run in GitHub Actions ($GITHUB_OUTPUT set),
 * writes `updated=true|false` and `unresolved=true|false`.
 */

import { readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

const DB_FILES = readdirSync(path.join(REPO_ROOT, "toolchains"))
  .filter((name) => /\.ya?ml$/.test(name))
  .sort()
  .map((name) => path.join("toolchains", name));

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outPath = outIdx !== -1 ? args[outIdx + 1] : null;
const dryRun = args.includes("--dry-run");

const GITHUB_RELEASE_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/download\/[^/]+\//;
const ARM_GITLAB_PROJECT_ID = "10698";
const ARM_GITLAB_API = `https://gitlab.arm.com/api/v4/projects/${ARM_GITLAB_PROJECT_ID}`;

// Every URL this script fetches — including ones read back out of GitHub/GitLab
// API responses — must resolve to one of these hosts over HTTPS.
const TRUSTED_HOSTS = new Set(["api.github.com", "github.com", "objects.githubusercontent.com", "gitlab.arm.com"]);

/**
 * Throws unless `url` is a plain https:// URL to one of TRUSTED_HOSTS — no
 * embedded credentials, no non-default port, no other scheme. Callers must
 * call this as its own statement *before* fetching, not inline the fetch
 * call as an argument to it, so the guard reads as an up-front rejection
 * rather than something bolted onto the request expression.
 */
function assertTrustedUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error(`refusing to fetch non-https URL: ${url}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`refusing to fetch URL with embedded credentials: ${url}`);
  }
  if (parsed.port) {
    throw new Error(`refusing to fetch URL with a non-default port: ${url}`);
  }
  if (!TRUSTED_HOSTS.has(parsed.hostname)) {
    throw new Error(`refusing to fetch untrusted host "${parsed.hostname}": ${url}`);
  }
}
const VERSION_RE = /(\d+)\.(\d+)\.(?:rel)?(\d+)/i;
const PRERELEASE_RE = /snapshot|alpha|beta|-rc\d*$/i;
const CHECKSUM_LINE_RE = /^([0-9a-f]{64})\s+\*?(.+?)\s*$/i;

function parseVersion(str) {
  const m = str.match(VERSION_RE);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareVersions(a, b) {
  const [aMajor, aMinor, aPatch] = a;
  const [bMajor, bMinor, bPatch] = b;
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

function basenameOf(url) {
  return url.split("/").pop();
}

function tokenize(name) {
  // eslint-disable-next-line security/detect-unsafe-regex -- digit-only alternatives can't backtrack ambiguously
  return name.split(/(\d+(?:\.\d+)*)/);
}

/** Finds the contiguous run of tokens (starting on a digit run) that concatenates to `key`. */
function locateKeyRange(tokens, key) {
  for (let i = 1; i < tokens.length; i += 2) {
    let acc = "";
    for (let j = i; j < tokens.length; j++) {
      // eslint-disable-next-line security/detect-object-injection -- j is a bounded numeric loop counter, not external input
      acc += tokens[j];
      if (acc === key) return [i, j];
      if (acc.length >= key.length) break;
    }
  }
  return null;
}

/** True if every non-digit segment is identical (only the digit runs may differ). */
function sameSkeleton(a, b) {
  if (a.length !== b.length) return false;
  // eslint-disable-next-line security/detect-object-injection -- k is a bounded numeric loop counter, not external input
  for (let k = 0; k < a.length; k += 2) if (a[k] !== b[k]) return false;
  return true;
}

async function ghApi(url) {
  const headers = { "User-Agent": "setup-gcc-toolchain-version-check" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  assertTrustedUrl(url);
  // nosemgrep: rules.lgpl.javascript.ssrf.rule-node-ssrf -- mitigated by assertTrustedUrl() above (host allowlist, https-only, no credentials/non-default port)
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

// ── Candidate gathering (newest-first release/version lists with assets) ───

const githubCandidateCache = new Map();

async function getGithubCandidates(owner, repo) {
  const key = `${owner}/${repo}`;
  if (githubCandidateCache.has(key)) return githubCandidateCache.get(key);
  const candidates = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await ghApi(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=100&page=${page}`);
    for (const r of batch) {
      if (r.draft || r.prerelease || PRERELEASE_RE.test(r.tag_name)) continue;
      const version = parseVersion(r.tag_name);
      if (!version) continue;
      candidates.push({
        version,
        label: r.tag_name,
        assets: r.assets.map((a) => ({ name: a.name, url: a.browser_download_url })),
      });
    }
    if (batch.length < 100) break;
  }
  candidates.sort((a, b) => compareVersions(b.version, a.version));
  githubCandidateCache.set(key, candidates);
  return candidates;
}

async function gitlabApi(url) {
  assertTrustedUrl(url);
  // nosemgrep: rules.lgpl.javascript.ssrf.rule-node-ssrf -- mitigated by assertTrustedUrl() above (host allowlist, https-only, no credentials/non-default port)
  const res = await fetch(url, { headers: { "User-Agent": "setup-gcc-toolchain-version-check" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

let armCandidatesPromise = null;

async function getArmCandidates() {
  if (!armCandidatesPromise) {
    armCandidatesPromise = (async () => {
      const packages = await gitlabApi(`${ARM_GITLAB_API}/packages?package_type=generic&per_page=100`);
      const candidates = [];
      for (const pkg of packages) {
        if (pkg.name !== "gnu-toolchain" || pkg.status !== "default") continue;
        const version = parseVersion(pkg.version);
        if (!version) continue;
        const files = await gitlabApi(`${ARM_GITLAB_API}/packages/${pkg.id}/package_files?per_page=100`);
        const assets = files
          .filter((f) => /\.(?:tar\.xz|zip)$/.test(f.file_name))
          .map((f) => ({
            name: f.file_name,
            url: `${ARM_GITLAB_API}/packages/generic/gnu-toolchain/${pkg.version}/${f.file_name}`,
            sha256: f.file_sha256,
          }));
        candidates.push({ version, label: pkg.version, assets });
      }
      candidates.sort((a, b) => compareVersions(b.version, a.version));
      return candidates;
    })();
  }
  return armCandidatesPromise;
}

// ── Matching ─────────────────────────────────────────────────────────────────

function findMatch(oldUrl, oldKey, minVersion, candidates) {
  const oldTokens = tokenize(basenameOf(oldUrl));
  const range = locateKeyRange(oldTokens, oldKey);
  if (!range) return { matched: false, reason: `could not locate "${oldKey}" in ${basenameOf(oldUrl)}` };

  let sawNewer = null;
  for (const cand of candidates) {
    if (compareVersions(cand.version, minVersion) <= 0) continue;
    if (!sawNewer) sawNewer = cand.label;
    for (const asset of cand.assets) {
      const newTokens = tokenize(asset.name);
      if (!sameSkeleton(oldTokens, newTokens)) continue;
      const newKey = newTokens.slice(range[0], range[1] + 1).join("");
      return { matched: true, newKey, asset, release: cand };
    }
  }
  return { matched: false, sawNewer };
}

// ── Checksum resolution ──────────────────────────────────────────────────────

async function fetchText(url) {
  assertTrustedUrl(url);
  // nosemgrep: rules.lgpl.javascript.ssrf.rule-node-ssrf -- mitigated by assertTrustedUrl() above
  const res = await fetch(url, { headers: { "User-Agent": "setup-gcc-toolchain-version-check" } });
  if (!res.ok) return null;
  return res.text();
}

function findHashForFile(sumsText, targetFilename) {
  for (const line of sumsText.split("\n")) {
    const m = line.match(CHECKSUM_LINE_RE);
    if (m && m[2] === targetFilename) return m[1].toLowerCase();
  }
  return null;
}

async function downloadAndHash(url) {
  assertTrustedUrl(url);
  // nosemgrep: rules.lgpl.javascript.ssrf.rule-node-ssrf -- mitigated by assertTrustedUrl() above
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return createHash("sha256").update(buf).digest("hex");
}

async function resolveSha256(asset, siblingAssets) {
  if (asset.sha256) return asset.sha256.toLowerCase();
  const sidecarNames = [`${asset.name}.sha256`, `${asset.name}.sha`];
  for (const name of sidecarNames) {
    const sidecar = siblingAssets.find((a) => a.name === name);
    if (!sidecar) continue;
    const text = await fetchText(sidecar.url);
    if (text) {
      const trimmed = text.trim();
      if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
      const hash = findHashForFile(text, asset.name);
      if (hash) return hash;
    }
  }
  const combined = siblingAssets.find((a) => /^SHA256SUMS$/i.test(a.name) || /checksum\.sha256$/i.test(a.name));
  if (combined) {
    const text = await fetchText(combined.url);
    if (text) {
      const hash = findHashForFile(text, asset.name);
      if (hash) return hash;
    }
  }
  return downloadAndHash(asset.url);
}

// ── YAML text surgery (keeps formatting/comments intact — no full re-dump) ──

function insertVersion(text, vendor, toolchain, newKey, url, sha256) {
  const lines = text.split("\n");
  const vendorLine = lines.findIndex((l) => l === `${vendor}:`);
  if (vendorLine === -1) throw new Error(`vendor "${vendor}" not found`);

  let toolchainLine = -1;
  for (let i = vendorLine + 1; i < lines.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- i is a bounded numeric loop counter, not external input
    if (/^[A-Za-z]/.test(lines[i])) break;
    // eslint-disable-next-line security/detect-object-injection -- i is a bounded numeric loop counter, not external input
    if (lines[i] === `  ${toolchain}:`) {
      toolchainLine = i;
      break;
    }
  }
  if (toolchainLine === -1) throw new Error(`toolchain "${toolchain}" not found under vendor "${vendor}"`);

  let versionsLine = -1;
  for (let i = toolchainLine + 1; i < lines.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- i is a bounded numeric loop counter, not external input
    if (lines[i] === "    versions:") {
      versionsLine = i;
      break;
    }
    // eslint-disable-next-line security/detect-object-injection -- i is a bounded numeric loop counter, not external input
    if (/^ {2}\S/.test(lines[i])) break;
  }
  if (versionsLine === -1) throw new Error(`"versions:" not found under "${vendor}.${toolchain}"`);

  lines.splice(versionsLine + 1, 0, `      "${newKey}":`, `        url: ${url}`, `        sha256: ${sha256}`);
  return lines.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────

const applied = []; // { file, vendor, toolchain, oldKey, newKey, url }
const unresolved = []; // { vendor, toolchain, oldKey, sawNewer, reason }

for (const file of DB_FILES) {
  const filePath = path.join(REPO_ROOT, file);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath is built from a fixed, hardcoded list, not external input
  let text = readFileSync(filePath, "utf8");
  // nosemgrep: rules.lgpl.javascript.eval.rule-yaml-deserialize -- js-yaml 4+ load() is the safe function (safeLoad/safeDump were removed because the old unsafe constructors need an explicit opt-in Schema); JSON_SCHEMA further restricts to plain JSON-shaped values
  const db = yaml.load(text, { schema: yaml.JSON_SCHEMA });
  let fileChanged = false;

  for (const [vendor, toolchains] of Object.entries(db)) {
    if (vendor === "platform") continue;
    for (const [toolchain, def] of Object.entries(toolchains)) {
      const entries = Object.entries(def.versions ?? {})
        .map(([key, entry]) => ({ key, version: parseVersion(key), url: entry.url }))
        .filter((e) => e.version);
      if (entries.length === 0) continue;
      entries.sort((a, b) => compareVersions(b.version, a.version));
      const current = entries[0];

      let candidates;
      try {
        if (vendor === "arm") {
          candidates = await getArmCandidates();
        } else {
          const m = current.url.match(GITHUB_RELEASE_RE);
          if (!m) continue; // not a vendor we know how to check upstream
          candidates = await getGithubCandidates(m[1], m[2]);
        }
      } catch (err) {
        console.error(`WARN: could not fetch candidates for ${vendor}/${toolchain}: ${err.message}`);
        continue;
      }

      const result = findMatch(current.url, current.key, current.version, candidates);
      if (result.matched) {
        applied.push({ file, vendor, toolchain, oldKey: current.key, newKey: result.newKey, url: result.asset.url });
        if (!dryRun) {
          let sha256;
          try {
            sha256 = await resolveSha256(result.asset, result.release.assets);
          } catch (err) {
            applied.pop();
            unresolved.push({ vendor, toolchain, oldKey: current.key, sawNewer: result.newKey, reason: `checksum: ${err.message}` });
            continue;
          }
          text = insertVersion(text, vendor, toolchain, result.newKey, result.asset.url, sha256);
          fileChanged = true;
        }
      } else if (result.sawNewer) {
        unresolved.push({ vendor, toolchain, oldKey: current.key, sawNewer: result.sawNewer, reason: result.reason ?? "no asset matched the known filename shape" });
      }
    }
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath is built from a fixed, hardcoded list, not external input
  if (fileChanged) writeFileSync(filePath, text);
}

// ── Report ──────────────────────────────────────────────────────────────────

const lines = [];
if (applied.length > 0) {
  lines.push("Auto-updated in this PR:\n");
  for (const a of applied) lines.push(`- **${a.vendor}/${a.toolchain}** (${a.file}): ${a.oldKey} -> ${a.newKey}`);
  lines.push("");
}
if (unresolved.length > 0) {
  lines.push("Detected but needs manual review (no confident asset match):\n");
  for (const u of unresolved) {
    lines.push(`- **${u.vendor}/${u.toolchain}**: have ${u.oldKey}, saw ${u.sawNewer ?? "?"} — ${u.reason}`);
  }
  lines.push("");
}
if (lines.length === 0) lines.push("No new upstream toolchain versions found.");

const report = lines.join("\n") + "\n";
console.log(report);
// eslint-disable-next-line security/detect-non-literal-fs-filename -- outPath is an operator-supplied CLI flag, not external input
if (outPath) writeFileSync(outPath, report);
if (process.env.GITHUB_OUTPUT) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- GITHUB_OUTPUT is set by the CI runner itself
  appendFileSync(process.env.GITHUB_OUTPUT, `updated=${applied.length > 0}\n`);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- GITHUB_OUTPUT is set by the CI runner itself
  appendFileSync(process.env.GITHUB_OUTPUT, `unresolved=${unresolved.length > 0}\n`);
}
