#!/usr/bin/env node
/**
 * Reads toolchain YAML databases and updates a GitHub Gist with shields.io
 * endpoint JSON files — one file per toolchain.
 *
 * Each Gist file is named "<toolchain>.json" and contains:
 *   { "schemaVersion": 1, "label": "<toolchain>", "message": "<version>", "color": "informational" }
 *
 * Usage:
 *   GIST_ID=<id> GIST_TOKEN=<pat> node scripts/update-version-badges.mjs
 *
 * Required env vars:
 *   GIST_ID    — ID of an existing public Gist
 *   GIST_TOKEN — GitHub PAT with the "gist" scope
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

const GIST_ID    = process.env.GIST_ID;
const GIST_TOKEN = process.env.GIST_TOKEN;

if (!GIST_ID || !GIST_TOKEN) {
  console.error("GIST_ID and GIST_TOKEN env vars are required");
  process.exit(1);
}

const DB_FILES = [
  path.join(REPO_ROOT, "toolchains-linux-x64.yml"),
  path.join(REPO_ROOT, "toolchains-linux-arm64.yml"),
  path.join(REPO_ROOT, "toolchains-windows-x64.yml"),
];

function compareVersions(a, b) {
  const split = (v) => v.split(/[.\-_]/).map((p) => (isNaN(Number(p)) ? p : Number(p)));
  const pa = split(a);
  const pb = split(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

// toolchain -> latest version string
const latest = {};

for (const file of DB_FILES) {
  const db = yaml.load(readFileSync(file, "utf8"));
  for (const vendorDef of Object.values(db)) {
    for (const [toolchain, tcDef] of Object.entries(vendorDef)) {
      const versions = Object.keys(tcDef.versions ?? {});
      if (versions.length === 0) continue;
      const top = versions.sort((a, b) => compareVersions(b, a))[0];
      if (!latest[toolchain] || compareVersions(top, latest[toolchain]) > 0) {
        latest[toolchain] = top;
      }
    }
  }
}

// Build Gist files payload
const files = {};
for (const [toolchain, version] of Object.entries(latest)) {
  files[`${toolchain}.json`] = {
    content: JSON.stringify({
      schemaVersion: 1,
      label: toolchain,
      message: version,
      color: "informational",
    }),
  };
}

console.log(`Updating Gist ${GIST_ID} with ${Object.keys(files).length} toolchains...`);

const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${GIST_TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  },
  body: JSON.stringify({ files }),
});

if (!res.ok) {
  const body = await res.text();
  console.error(`GitHub API error ${res.status}: ${body}`);
  process.exit(1);
}

const gist = await res.json();
console.log(`Done. Gist URL: ${gist.html_url}`);
