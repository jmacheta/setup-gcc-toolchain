# setup-gcc-toolchain

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-setup--gcc--toolchain-blue?logo=github)](https://github.com/marketplace/actions/setup-gcc-toolchain)
[![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE.txt)

[![CI](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/ci.yml/badge.svg)](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/ci.yml)
[![Weekly](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/weekly.yml/badge.svg)](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/weekly.yml)
[![Monthly](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/monthly.yml/badge.svg)](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/monthly.yml)
[![Maintain Tags](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/maintain_tags.yml/badge.svg)](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/maintain_tags.yml)

<!-- latest versions pushed to Gist by CI — replace 533dd887be336d666b26bf4179e67102 with your actual Gist ID -->
[![arm-none-eabi](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/arm-none-eabi.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)
[![aarch64-none-elf](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/aarch64-none-elf.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)
[![riscv-none-elf](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/riscv-none-elf.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)
[![x86_64-gcc](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/x86_64-gcc.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)
[![xtensa-esp-elf](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/xtensa-esp-elf.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)
[![riscv32-esp-elf](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/riscv32-esp-elf.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)
[![avr](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/avr.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)
[![x86_64-w64-mingw32-ucrt](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/x86_64-w64-mingw32-ucrt.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)
[![x86_64-w64-mingw32-msvcrt](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/x86_64-w64-mingw32-msvcrt.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)
[![i686-w64-mingw32-ucrt](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/i686-w64-mingw32-ucrt.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)
[![i686-w64-mingw32-msvcrt](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/i686-w64-mingw32-msvcrt.json)](https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102)

Download, verify, and add a GCC cross-compilation toolchain to `PATH` in your GitHub Actions workflow. Supports ARM, AArch64, RISC-V, Xtensa (ESP32), AVR, and native x86\_64 — on Linux and Windows runners.

## Usage

```yaml
- uses: jmacheta/setup-gcc-toolchain@v1
  with:
    toolchain: arm-none-eabi
    version: "15.2.1-1.1"
```

The toolchain is prepended to `PATH`, so it takes priority over any pre-installed compiler.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `toolchain` | yes | — | Toolchain name (see [Supported toolchains](#supported-toolchains)) |
| `version` | yes | — | Version string, or `latest` for the newest available |
| `enable-cache` | no | `true` | Cache the downloaded archive with `actions/cache` |

## Outputs

| Output | Description |
| --- | --- |
| `toolchain-path` | Absolute path to the toolchain root directory |
| `cache-hit` | `true` if the toolchain was restored from cache |

## Supported toolchains

### Linux runners (`ubuntu-*`)

| Toolchain | Description | Vendor | Architectures |
| --- | --- | --- | --- |
| `arm-none-eabi` | ARM bare-metal (Cortex-M/R) | xPack | x86\_64, ARM64 |
| `aarch64-none-elf` | AArch64 bare-metal | xPack | x86\_64, ARM64 |
| `riscv-none-elf` | RISC-V bare-metal (RV32/RV64) | xPack | x86\_64, ARM64 |
| `x86_64-gcc` | Native x86\_64 GCC | xPack | x86\_64, ARM64 |
| `xtensa-esp-elf` | Xtensa for ESP32/ESP32-S2/S3 | Espressif | x86\_64, ARM64 |
| `riscv32-esp-elf` | RISC-V for ESP32-C/H series | Espressif | x86\_64, ARM64 |
| `avr` | AVR (ATmega, ATtiny, …) | ZakKemble | x86\_64 |

### Windows runners (`windows-*`)

| Toolchain | Description | Vendor |
| --- | --- | --- |
| `arm-none-eabi` | ARM bare-metal (Cortex-M/R) | xPack |
| `aarch64-none-elf` | AArch64 bare-metal | xPack |
| `riscv-none-elf` | RISC-V bare-metal (RV32/RV64) | xPack |
| `x86_64-gcc` | Native x86\_64 GCC | xPack |
| `avr` | AVR (ATmega, ATtiny, …) | ZakKemble |
| `x86_64-w64-mingw32-ucrt` | MinGW-w64 x86\_64, UCRT *(recommended)* | WinLibs |
| `x86_64-w64-mingw32-msvcrt` | MinGW-w64 x86\_64, legacy MSVCRT | WinLibs |
| `i686-w64-mingw32-ucrt` | MinGW-w64 i686 32-bit, UCRT | WinLibs |
| `i686-w64-mingw32-msvcrt` | MinGW-w64 i686 32-bit, legacy MSVCRT | WinLibs |

## Examples

### ARM bare-metal (Cortex-M)

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: jmacheta/setup-gcc-toolchain@v1
        with:
          toolchain: arm-none-eabi
          version: "15.2.1-1.1"

      - run: arm-none-eabi-gcc --version
      - run: make
```

### Latest version with cache disabled

```yaml
- uses: jmacheta/setup-gcc-toolchain@v1
  with:
    toolchain: riscv-none-elf
    version: latest
    enable-cache: false
```

### ESP32 on Linux ARM64 runner

```yaml
jobs:
  build:
    runs-on: ubuntu-24.04-arm
    steps:
      - uses: actions/checkout@v4

      - uses: jmacheta/setup-gcc-toolchain@v1
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
      - uses: actions/checkout@v4

      - uses: jmacheta/setup-gcc-toolchain@v1
        with:
          toolchain: x86_64-w64-mingw32-ucrt
          version: "16.1.0"

      - run: x86_64-w64-mingw32-gcc --version
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
          - { name: riscv-none-elf, version: "15.2.1-1.1" }
          - { name: avr,            version: "14.1.0" }
    steps:
      - uses: actions/checkout@v4

      - uses: jmacheta/setup-gcc-toolchain@v1
        with:
          toolchain: ${{ matrix.toolchain.name }}
          version: ${{ matrix.toolchain.version }}

      - run: make TOOLCHAIN=${{ matrix.toolchain.name }}
```

## How it works

1. Reads the toolchain URL and SHA256 from a bundled YAML database, selected by runner OS and architecture.
2. Downloads the archive (`.tar.gz`, `.tar.xz`, or `.zip`).
3. Verifies the SHA256 checksum before extraction.
4. Extracts to `$RUNNER_TEMP/gcc-toolchain/<name>-<version>/`.
5. Prepends the `bin/` directory to `PATH` — takes precedence over any pre-installed compiler.
6. Optionally saves the extracted directory to `actions/cache`.

## Adding new toolchain versions

The toolchain database lives in three YAML files at the repo root:

- `toolchains-linux-x64.yml`
- `toolchains-linux-arm64.yml`
- `toolchains-windows-x64.yml`

Each entry follows the pattern:

```yaml
vendor:
  toolchain-name:
    description: ...
    versions:
      "1.2.3":
        url: https://...
        sha256: <64-char hex>
```

Pull requests adding new versions are welcome.

## License

[Apache 2.0](LICENSE.txt)
