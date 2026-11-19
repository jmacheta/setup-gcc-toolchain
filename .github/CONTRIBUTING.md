# Contributing

Thank you for considering a contribution! This action is used by embedded developers who rely on it in production CI pipelines, so correctness and reliability matter above all else.

## Ways to contribute

- **Add a new toolchain version** — update the relevant `toolchains/<platform>.yml` database files with the URL and SHA256 checksum (see below).
- **Add a new toolchain variant** — open an issue first to discuss scope before writing code.
- **Fix a bug** — please include a failing test case (or a clear reproduction in CI smoke tests).
- **Improve documentation** — typos, better examples, clearer wording are always welcome.

## Development setup

```bash
npm ci
npm run typecheck   # static checks
npm test            # unit tests
npm run validate    # validate YAML database structure (no network)
npm run validate:full  # also verify that all URLs are reachable
```

## The toolchain database

Every `*.yml` file directly under [`toolchains/`](../toolchains/) is a database. The runner platform it serves is its top-level `platform:` field (`linux-x64`, `linux-arm64`, `windows-x64`, `windows-arm64`, `darwin-x64`, `darwin-arm64`), not its file name. Below that: vendor, toolchain, versions.

```yaml
platform: linux-x64

xpack:
  arm-none-eabi:
    description: ARM bare-metal (Cortex-M/R)
    # prefix: x86_64-w64-mingw32-  (optional: only when the binaries aren't <toolchain>-gcc)
    versions:
      "15.2.1-1.1":
        url: https://github.com/xpack-dev-tools/arm-none-eabi-gcc-xpack/releases/download/v15.2.1-1.1/...
        sha256: <64 lowercase hex characters>
```

Version keys are the vendor's own release names, without tag prefixes such as `v` or `esp-`:

| Vendor | Key | Example |
| --- | --- | --- |
| `xpack` | GCC version and xPack release | `15.2.1-1.1`, `15.2.0-1` |
| `arm` | Arm release name | `14.2.rel1` |
| `espressif` | GCC version and date | `14.2.0_20241119` |
| `zakkemble` | GCC version | `14.1.0` |
| `winlibs` | GCC version | `16.1.0` |
| `bootlin` | Bootlin release | `stable-2025.08-1` |

`latest` picks the highest key (dot, dash and underscore separate parts; digits compare as numbers), so keep keys of one toolchain comparable.

## Automatic updates

[`check-new-versions.yml`](workflows/check-new-versions.yml) runs weekly. It looks for newer releases of toolchains hosted on GitHub Releases (xPack, Espressif, ZakKemble, WinLibs) and Arm's GitLab, adds the matching entries with the vendor's published sha256, runs `npm run validate`, `npm run typecheck` and `npm test`, and opens or updates a pull request plus a tracking issue. Releases it can't match are listed in the issue for manual review. Toolchains it can't check (Bootlin, and any other host) are listed as "manual update": add their versions by hand.

The bot's pull request is created with `GITHUB_TOKEN`, which by GitHub's design starts no `pull_request` workflows, so the bot starts `ci.yml` on its branch with `workflow_dispatch` instead. A personal access token or GitHub App token in the workflow would make PR CI run normally; the repository deliberately keeps no such secret.

## Adding a toolchain version

1. Find the release on the vendor's site.
2. Get its sha256, preferably from the vendor: a sidecar file (xPack `<asset>.sha`, WinLibs `<asset>.sha256`), a combined list (Espressif `*-checksum.sha256`, ZakKemble `SHA256SUMS`, Bootlin `<name>.sha256` next to the tarball) or the API (Arm's GitLab package files carry `file_sha256`). Only if the vendor publishes none, download the archive and hash it yourself: `sha256sum <archive>` (Linux), `shasum -a 256 <archive>` (macOS), `(Get-FileHash <archive> -Algorithm SHA256).Hash.ToLower()` (Windows PowerShell).
3. Add the entry to every `toolchains/<platform>.yml` the vendor publishes it for, newest first.
4. Run `npm run validate`, and `npm run validate:full` to check the URLs.

Pull request CI checks the database structure and runs the unit tests and a few smoke installs; it does not install every new entry. Add a row to a smoke matrix (`ci.yml`, or `weekly.yml`/`monthly.yml`) if a version needs its own check.

## Adding a toolchain

Open an issue first. Then:

- the database entries (above), with `prefix:` if the binaries aren't named `<toolchain>-gcc` (the action derives `<toolchain>-` otherwise; `x86_64-gcc` is special-cased to no prefix);
- a row in the README's support matrix, with a badge;
- the toolchain in the `toolchain` input description in `action.yml` if it is a common one;
- a smoke row in `ci.yml` (and `weekly.yml`) checking `<prefix>gcc --version`;
- `npm run build` if `src/` changed, and commit `dist/index.js` (CI fails if it differs).

## Pull request checklist

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run validate` passes
- [ ] `dist/index.js` is rebuilt (`npm run build`) and committed if source changed
- [ ] New toolchain versions include a SHA256 checksum (PRs without checksums will not be merged)

## Commit style

Use short imperative sentences: `add arm-none-eabi 15.3.0`, `fix cache key collision on Windows`. No ticket numbers required.

## Reporting issues

Open a GitHub issue. Include:

- the workflow step that failed (copy the full action log)
- the runner OS and architecture
- the toolchain name and version you requested
