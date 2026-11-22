# setup-gcc-toolchain

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-setup--gcc--toolchain-blue?logo=github)](https://github.com/marketplace/actions/setup-gcc-toolchain)
[![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE.txt)

[![CI](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/ci.yml/badge.svg)](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/ci.yml)
[![Weekly](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/weekly.yml/badge.svg)](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/weekly.yml)
[![Monthly](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/monthly.yml/badge.svg)](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/monthly.yml)
[![Maintain Tags](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/maintain_tags.yml/badge.svg)](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/maintain_tags.yml)
[![Codacy Badge](https://app.codacy.com/project/badge/Grade/b52546537c524083bd2dbb646b6bdbef)](https://app.codacy.com/gh/jmacheta/setup-gcc-toolchain/dashboard?branch=main)

A GitHub Action that downloads, verifies, and adds a GCC cross-compilation toolchain to `PATH`. Covers ARM, AArch64, RISC-V, Xtensa (ESP32), AVR, MinGW-w64, and native host GCC, on Linux and Windows runners, plus macOS runners for the bare-metal toolchains (macOS is not tested in CI) — see the [support matrix](#supported-toolchains) below for exact vendor/platform coverage.

## Usage

```yaml
- uses: jmacheta/setup-gcc-toolchain@v2
  with:
    toolchain: arm-none-eabi
    version: "15.2.1-1.1"
```

The toolchain is prepended to `PATH`, so it takes priority over any pre-installed compiler.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `toolchain` | yes | — | Toolchain name (see [Supported toolchains](#supported-toolchains)) |
| `vendor` | no | — | Vendor name, e.g. `xpack` or `arm`. See [Vendor selection](#vendor-selection). |
| `version` | no | `latest` | Version string, or `latest` for the newest available |
| `cache-strategy` | no | `remote` | How to cache the toolchain: `remote`, `local`, `both`, or `none` — see [Caching](#caching) |
| `local-cache-location` | no\* | — (or env var, see [Caching](#caching)) | Directory for the local archive cache. \*Required when `cache-strategy` is `local` or `both` |
| `set-ld-library-path` | no | native only | Prepend the toolchain's `lib64`/`lib` to `LD_LIBRARY_PATH`, so built binaries use its bundled `libstdc++`/`libgcc`. Unset, this happens only for native toolchains (empty `prefix`, e.g. `x86_64-gcc`): a cross toolchain's `lib` holds target libraries that would break host programs. Set `true` or `false` to decide explicitly. |

### Vendor selection

Some toolchain names are provided by more than one vendor (e.g. `arm-none-eabi` is available from both `arm` and `xpack`). Without `vendor`:

- an exact `version` is taken from the vendor that lists it (vendors are searched in database file order); if several vendors list the same version, the action fails and asks for `vendor`;
- `latest` is the highest version across *all* vendors of that toolchain, so the vendor can change when another vendor releases a higher version. Set `vendor` whenever you use `latest` with a toolchain that has several vendors.

```yaml
- uses: jmacheta/setup-gcc-toolchain@v2
  with:
    toolchain: arm-none-eabi
    vendor: xpack          # xPack release
    version: "15.2.1-1.1"
```

### Pinning and reproducibility

`@v2` is a moving tag, and `latest` follows the toolchain database bundled with the action version you run, so either can change the compiler between runs. For reproducible builds pin `version` and `vendor`, and reference the action by a release tag (`@v2.3.0`) or a commit SHA.

### Caching

`cache-strategy` controls how the toolchain is cached across runs:

- **`remote`** (default) — caches the downloaded archive with `actions/cache`, under a key that includes the vendor and the archive's sha256. A restored archive is verified against the database sha256 before it is extracted, like a fresh download; a mismatch falls back to downloading. Works on any runner, including ephemeral GitHub-hosted ones.
- **`local`** — reuses downloaded archives from a directory on the runner's disk instead of re-downloading. Only useful on a persistent self-hosted runner, but skips the network round-trip and `actions/cache` quota entirely. Requires `local-cache-location` (directly, or via `SETUP_GCC_TOOLCHAIN_LOCAL_CACHE_LOCATION`); the checksum from the toolchain database is always re-verified against the on-disk archive, and a mismatch falls back to a fresh download.
- **`both`** — e.g. for a matrix mixing persistent self-hosted and ephemeral hosted runners, where the local cache helps the former and the remote cache is the only option for the latter.
- **`none`** — always download fresh.

`local-cache-location` sets the directory for the local archive cache, and falls back to the `SETUP_GCC_TOOLCHAIN_LOCAL_CACHE_LOCATION` env var if omitted — so a self-hosted runner can set its cache path once instead of every workflow repeating it. Safe for concurrent runners sharing the same local disk: archives are written with an atomic rename, and each run copies the archive into its own `RUNNER_TEMP` before verifying and extracting it, so a later change to the shared file can't slip in. Not guaranteed on a network filesystem (e.g. NFS). The directory is created with mode `0750`; restrict it to the runner user(s).

## Outputs

| Output | Description |
| --- | --- |
| `toolchain-path` | Absolute path to the toolchain root directory |
| `cache-hit` | `true` if the archive was restored from the remote cache (`actions/cache`) and passed sha256 verification; `false` for a download, a local cache hit, or a toolchain already installed by an earlier step of the same job |
| `prefix` | Tool prefix, e.g. `aarch64_be-none-linux-gnu-`, so `${prefix}gcc` is the compiler (empty for `x86_64-gcc`) |
| `gcc-version` | Full GCC version from `<prefix>gcc -dumpfullversion`, e.g. `15.2.1` (empty if the compiler was not found) |

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - id: gcc
        uses: jmacheta/setup-gcc-toolchain@v2
        with:
          toolchain: aarch64_be-none-linux-gnu

      - run: echo "GCC ${{ steps.gcc.outputs.gcc-version }}"
      - run: cmake -B build -DCMAKE_C_COMPILER=${{ steps.gcc.outputs.prefix }}gcc
```

## Errors

- **Unknown toolchain, vendor or version**: the step fails before downloading, listing the toolchains, vendors or versions available on this runner platform.
- **Version offered by several vendors**: the step fails and asks you to set `vendor`.
- **Checksum mismatch**: a corrupt download is deleted and retried (3 attempts); if it still doesn't match the database sha256, the step fails and nothing is installed. A cached archive that doesn't match is discarded and downloaded again. An HTTP 4xx (e.g. a removed upstream file) fails at once, without retries.
- **Missing compiler binary**: if `<prefix>gcc` isn't in the archive's `bin/`, the action only warns and `gcc-version` is empty; a missing `bin/` directory fails the step.
- **Unsupported runner platform** or **`RUNNER_TEMP` not set**: the step fails.

## Supported toolchains

| Toolchain                                                                                                                                                                                                                                                  | Description                                                | Vendors        | Linux x64 | Linux ARM64 | Windows x64 | macOS x64¹ | macOS ARM64¹ |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------- | :-------: | :---------: | :---------: | :---------: | :-----------: |
| [![arm-none-eabi](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/arm-none-eabi.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)                             | ARM bare-metal (Cortex-M/R)                                | `xpack`, `arm` |     ✓     |      ✓      |      ✓      |     ✓      |      ✓       |
| [![aarch64-none-elf](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/aarch64-none-elf.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)                       | AArch64 bare-metal                                         | `xpack`, `arm` |     ✓     |      ✓      |      ✓      |     ✓      |      ✓       |
| [![arm-none-linux-gnueabihf](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/arm-none-linux-gnueabihf.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)       | AArch32 Linux hard-float (glibc)                           | `arm`          |     ✓     |      ✓      |      ✓      |            |              |
| [![aarch64-none-linux-gnu](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/aarch64-none-linux-gnu.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)           | AArch64 Linux (glibc)                                      | `arm`          |     ✓     |      ✓      |      ✓      |            |              |
| [![aarch64_be-none-linux-gnu](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/aarch64_be-none-linux-gnu.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)     | AArch64 big-endian Linux (glibc)                           | `arm`          |     ✓     |             |             |            |              |
| [![riscv-none-elf](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/riscv-none-elf.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)                           | RISC-V bare-metal (RV32/RV64)                              | `xpack`        |     ✓     |      ✓      |      ✓      |     ✓      |      ✓       |
| [![riscv32-buildroot-linux-gnu](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/riscv32-buildroot-linux-gnu.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102) | RISC-V 32-bit Linux (glibc, ilp32d)                        | `bootlin`      |     ✓     |             |             |            |              |
| [![riscv64-buildroot-linux-gnu](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/riscv64-buildroot-linux-gnu.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102) | RISC-V 64-bit Linux (glibc, lp64d)                         | `bootlin`      |     ✓     |             |             |            |              |
| [![x86_64-gcc](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/x86_64-gcc.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)                                   | Native host GCC² (no prefix)                               | `xpack`        |     ✓     |      ✓      |      ✓      |            |              |
| [![x86_64-w64-mingw32-gcc](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/x86_64-w64-mingw32-gcc.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)           | MinGW-w64 x86\_64 cross GCC (Windows target), UCRT runtime | `xpack`        |     ✓     |      ✓      |      ✓      |     ✓      |      ✓       |
| [![xtensa-esp-elf](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/xtensa-esp-elf.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)                           | Xtensa for ESP32/ESP32-S2/S3                               | `espressif`    |     ✓     |      ✓      |      ✓      |     ✓      |      ✓       |
| [![riscv32-esp-elf](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/riscv32-esp-elf.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)                         | RISC-V for ESP32-C/H series                                | `espressif`    |     ✓     |      ✓      |      ✓      |     ✓      |      ✓       |
| [![avr](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/avr.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)                                                 | AVR (ATmega, ATtiny, …)                                    | `zakkemble`    |     ✓     |             |      ✓      |            |              |
| [![x86_64-w64-mingw32-ucrt](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/x86_64-w64-mingw32-ucrt.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)         | MinGW-w64 x86\_64, UCRT *(recommended)*                    | `winlibs`      |           |             |      ✓      |            |              |
| [![x86_64-w64-mingw32-msvcrt](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/x86_64-w64-mingw32-msvcrt.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)     | MinGW-w64 x86\_64, legacy MSVCRT                           | `winlibs`      |           |             |      ✓      |            |              |
| [![i686-w64-mingw32-ucrt](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/i686-w64-mingw32-ucrt.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)             | MinGW-w64 i686 32-bit, UCRT                                | `winlibs`      |           |             |      ✓      |            |              |
| [![i686-w64-mingw32-msvcrt](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/i686-w64-mingw32-msvcrt.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)         | MinGW-w64 i686 32-bit, legacy MSVCRT                       | `winlibs`      |           |             |      ✓      |            |              |

The version badges show the highest version of each toolchain across all vendors and platforms; a given vendor or platform may top out lower.

¹ The macOS databases (`darwin-x64`, `darwin-arm64`) exist but are not tested in CI.
² x86\_64 on x64 runners; on `linux-arm64` it is xPack's native AArch64 host GCC, despite the name.

## Examples

### ARM bare-metal (Cortex-M)

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: jmacheta/setup-gcc-toolchain@v2
        with:
          toolchain: arm-none-eabi
          version: "15.2.1-1.1"

      - run: arm-none-eabi-gcc --version
      - run: make
```

### Latest version with cache disabled

`version` defaults to `latest`, so it can be omitted entirely:

```yaml
- uses: jmacheta/setup-gcc-toolchain@v2
  with:
    toolchain: riscv-none-elf
    cache-strategy: none
```

### ESP32 on Linux ARM64 runner

```yaml
jobs:
  build:
    runs-on: ubuntu-24.04-arm
    steps:
      - uses: actions/checkout@v7

      - uses: jmacheta/setup-gcc-toolchain@v2
        with:
          toolchain: xtensa-esp-elf
          version: "16.1.0_20260609"

      - run: xtensa-esp-elf-gcc --version
```

### Windows — native MinGW build

```yaml
jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v7

      - uses: jmacheta/setup-gcc-toolchain@v2
        with:
          toolchain: x86_64-w64-mingw32-ucrt
          version: "16.1.0"

      - run: x86_64-w64-mingw32-gcc --version
```

### Selecting a specific vendor

When a toolchain is provided by more than one vendor, use the `vendor` input:

```yaml
- uses: jmacheta/setup-gcc-toolchain@v2
  with:
    toolchain: arm-none-eabi
    vendor: arm              # official ARM Ltd release
    version: "14.2.rel1"
```

### Matrix across toolchains

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        toolchain:
          - { name: arm-none-eabi,  version: "15.2.1-1.1" }
          - { name: riscv-none-elf, version: "15.2.0-1" }
          - { name: avr,            version: "14.1.0" }
    steps:
      - uses: actions/checkout@v7

      - uses: jmacheta/setup-gcc-toolchain@v2
        with:
          toolchain: ${{ matrix.toolchain.name }}
          version: ${{ matrix.toolchain.version }}

      - run: make TOOLCHAIN=${{ matrix.toolchain.name }}
```

## Contributing

New toolchain versions and fixes are welcome: see [CONTRIBUTING.md](.github/CONTRIBUTING.md).

## License

[Apache 2.0](LICENSE.txt)
