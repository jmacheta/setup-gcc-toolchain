#!/usr/bin/env node
/**
 * Validates the toolchain YAML database files.
 *
 * Checks performed:
 *   - YAML parses without errors
 *   - Every version entry has a non-empty `url` and `sha256`
 *   - `sha256` is exactly 64 lowercase hex characters
 *   - URL points to a reachable host (HTTP HEAD, follows redirects)
 *
 * Usage:
 *   node scripts/validate-toolchains.mjs [--no-network] [--file <path>]
 *
 * Flags:
 *   --no-network   Skip URL reachability checks (structure + sha256 only)
 *   --file <path>  Validate a single file instead of all three defaults
 *   --concurrency  Max parallel HEAD requests (default: 20)
 */

import { readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:https";
import https from "node:https";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

const SHA256_RE = /^[0-9a-f]{64}$/;

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const noNetwork = args.includes("--no-network");
const fileIdx = args.indexOf("--file");
const singleFile = fileIdx !== -1 ? args[fileIdx + 1] : null;
const concurrencyIdx = args.indexOf("--concurrency");
const concurrency = concurrencyIdx !== -1 ? parseInt(args[concurrencyIdx + 1], 10) : 20;

const DB_FILES = singleFile
  ? [singleFile]
  : [
      path.join(REPO_ROOT, "toolchains-linux-x64.yml"),
      path.join(REPO_ROOT, "toolchains-linux-arm64.yml"),
      path.join(REPO_ROOT, "toolchains-windows-x64.yml"),
    ];

// ── Helpers ───────────────────────────────────────────────────────────────────

function red(s) { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }
function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function dim(s) { return `\x1b[2m${s}\x1b[0m`; }

/** HEAD request following up to 5 redirects. Returns {ok, status, finalUrl}. */
function headRequest(url, redirectsLeft = 5) {
  return new Promise((resolve) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.request(url, { method: "HEAD", timeout: 15000 }, (res) => {
      const { statusCode, headers } = res;
      res.resume();
      if (statusCode >= 300 && statusCode < 400 && headers.location && redirectsLeft > 0) {
        const next = new URL(headers.location, url).href;
        resolve(headRequest(next, redirectsLeft - 1));
      } else {
        resolve({ ok: statusCode < 400, status: statusCode, finalUrl: url });
      }
    });
    req.on("error", (e) => resolve({ ok: false, status: 0, error: e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, status: 0, error: "timeout" }); });
    req.end();
  });
}

/** Run tasks with bounded concurrency. tasks: array of () => Promise */
async function pool(tasks, limit) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

// ── Validation ────────────────────────────────────────────────────────────────

let totalErrors = 0;
let totalWarnings = 0;
let totalVersions = 0;

function error(msg) {
  console.error(`  ${red("✗")} ${msg}`);
  totalErrors++;
}

function warn(msg) {
  console.warn(`  ${yellow("⚠")} ${msg}`);
  totalWarnings++;
}

function validateStructure(db, filePath) {
  const issues = [];
  const urlEntries = []; // {path, url, sha256}

  if (typeof db !== "object" || db === null) {
    error(`Root is not a YAML mapping in ${filePath}`);
    return urlEntries;
  }

  for (const [vendor, vendorDef] of Object.entries(db)) {
    if (typeof vendorDef !== "object" || vendorDef === null) {
      error(`${vendor}: expected object`);
      continue;
    }
    for (const [toolchain, tcDef] of Object.entries(vendorDef)) {
      const location = `${vendor}/${toolchain}`;
      if (typeof tcDef !== "object" || !tcDef.versions) {
        error(`${location}: missing 'versions'`);
        continue;
      }
      for (const [version, entry] of Object.entries(tcDef.versions)) {
        totalVersions++;
        const loc = `${location}@${version}`;

        if (!entry || typeof entry !== "object") {
          error(`${loc}: entry is not an object`);
          continue;
        }

        const { url, sha256 } = entry;

        if (!url || typeof url !== "string") {
          error(`${loc}: missing or empty 'url'`);
        } else if (!/^https?:\/\//.test(url)) {
          error(`${loc}: url does not start with http(s): ${url}`);
        }

        if (!sha256 || typeof sha256 !== "string") {
          warn(`${loc}: missing sha256 — entry cannot be used in action`);
        } else if (!SHA256_RE.test(sha256)) {
          error(`${loc}: sha256 is not 64 hex chars: "${sha256}"`);
        }

        if (url) urlEntries.push({ loc, url, sha256: sha256 ?? "" });
      }
    }
  }

  return urlEntries;
}

async function validateFile(filePath) {
  const shortName = path.basename(filePath);
  console.log(`\n${dim("─".repeat(60))}`);
  console.log(`Validating ${shortName}`);

  let db;
  try {
    const content = readFileSync(filePath, "utf8");
    db = yaml.load(content);
  } catch (e) {
    error(`Failed to parse YAML: ${e.message}`);
    return;
  }

  const urlEntries = validateStructure(db, filePath);

  if (noNetwork) {
    console.log(dim(`  (skipping ${urlEntries.length} URL checks — --no-network)`));
    return;
  }

  // Only check entries that have a URL and sha256 (others already warned above)
  const toCheck = urlEntries.filter((e) => e.url);
  if (toCheck.length === 0) return;

  process.stdout.write(`  Checking ${toCheck.length} URLs`);

  let checked = 0;
  const tasks = toCheck.map((entry) => async () => {
    const result = await headRequest(entry.url);
    checked++;
    if (checked % 10 === 0 || checked === toCheck.length) {
      process.stdout.write(`\r  Checking ${toCheck.length} URLs — ${checked}/${toCheck.length}`);
    }
    return { entry, result };
  });

  const results = await pool(tasks, concurrency);
  process.stdout.write("\n");

  for (const { entry, result } of results) {
    if (!result.ok) {
      error(
        `${entry.loc}: URL unreachable ` +
          (result.error ? `(${result.error})` : `(HTTP ${result.status})`) +
          `\n      ${entry.url}`
      );
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`Toolchain database validator`);
console.log(`Mode: ${noNetwork ? "structure + sha256 only" : "structure + sha256 + URL reachability"}`);
if (!noNetwork) console.log(`Concurrency: ${concurrency} parallel HEAD requests`);

for (const file of DB_FILES) {
  await validateFile(file);
}

console.log(`\n${dim("─".repeat(60))}`);
console.log(`Scanned ${totalVersions} versions across ${DB_FILES.length} file(s)`);

if (totalErrors > 0 || totalWarnings > 0) {
  if (totalErrors > 0) console.log(red(`${totalErrors} error(s)`));
  if (totalWarnings > 0) console.log(yellow(`${totalWarnings} warning(s) (missing sha256 — entries exist but action will refuse to install them)`));
}

if (totalErrors === 0) {
  console.log(green(`\nAll checks passed${totalWarnings > 0 ? " (with warnings)" : ""}.`));
  process.exit(0);
} else {
  console.log(red(`\nValidation failed.`));
  process.exit(1);
}
