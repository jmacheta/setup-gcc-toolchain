# Contributing

Thank you for considering a contribution! This action is used by embedded developers who rely on it in production CI pipelines, so correctness and reliability matter above all else.

## Ways to contribute

- **Add a new toolchain version** — update the relevant `toolchains-*.yml` database file with the URL and SHA256 checksum.
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

## Adding a toolchain version

- Find the upstream release on the vendor's GitHub releases page.
- Download the archive and compute `sha256sum <archive>`.
- Add an entry to the appropriate `toolchains-<platform>.yml` file under the correct vendor and toolchain key:

   ```yaml
   "15.3.0-1.1":
     url: https://github.com/xpack-dev-tools/arm-none-eabi-gcc-xpack/releases/download/...
     sha256: <64-hex-character checksum>
   ```

- Run `npm run validate` to check structure and `npm run validate:full` to verify URLs.
- Open a PR — CI will run smoke tests against the new entries automatically.

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
