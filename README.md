# setup-gcc-toolchain

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-setup--gcc--toolchain-blue?logo=github)](https://github.com/marketplace/actions/setup-gcc-toolchain)
[![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE.txt)

[![CI](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/ci.yml/badge.svg)](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/ci.yml)
[![Weekly](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/weekly.yml/badge.svg)](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/weekly.yml)
[![Monthly](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/monthly.yml/badge.svg)](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/monthly.yml)
[![Maintain Tags](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/maintain_tags.yml/badge.svg)](https://github.com/jmacheta/setup-gcc-toolchain/actions/workflows/maintain_tags.yml)

<!-- latest versions pushed to Gist by CI — replace 533dd887be336d666b26bf4179e67102 with your actual Gist ID -->
<!-- Toolchain × host-platform support matrix. Badges show the latest available version. -->
<table>
<thead>
<tr>
  <th>Toolchain</th>
  <th>Latest</th>
  <th>Linux x64</th>
  <th>Linux ARM64</th>
  <th>Windows x64</th>
</tr>
</thead>
<tbody>
<tr>
  <td><code>arm-none-eabi</code></td>
  <td><a href="https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102"><img src="https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/arm-none-eabi.json" alt="arm-none-eabi"/></a></td>
  <td>✓</td><td>✓</td><td>✓</td>
</tr>
<tr>
  <td><code>aarch64-none-elf</code></td>
  <td><a href="https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102"><img src="https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/aarch64-none-elf.json" alt="aarch64-none-elf"/></a></td>
  <td>✓</td><td>✓</td><td>✓</td>
</tr>
<tr>
  <td><code>arm-none-linux-gnueabihf</code></td>
  <td><a href="https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102"><img src="https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/arm-none-linux-gnueabihf.json" alt="arm-none-linux-gnueabihf"/></a></td>
  <td>✓</td><td>✓</td><td>✓</td>
</tr>
<tr>
  <td><code>aarch64-none-linux-gnu</code></td>
  <td><a href="https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102"><img src="https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/aarch64-none-linux-gnu.json" alt="aarch64-none-linux-gnu"/></a></td>
  <td>✓</td><td>✓</td><td>✓</td>
</tr>
<tr>
  <td><code>riscv-none-elf</code></td>
  <td><a href="https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102"><img src="https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/riscv-none-elf.json" alt="riscv-none-elf"/></a></td>
  <td>✓</td><td>✓</td><td>✓</td>
</tr>
<tr>
  <td><code>x86_64-gcc</code></td>
  <td><a href="https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102"><img src="https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/x86_64-gcc.json" alt="x86_64-gcc"/></a></td>
  <td>✓</td><td>✓</td><td>✓</td>
</tr>
<tr>
  <td><code>xtensa-esp-elf</code></td>
  <td><a href="https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102"><img src="https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/xtensa-esp-elf.json" alt="xtensa-esp-elf"/></a></td>
  <td>✓</td><td>✓</td><td></td>
</tr>
<tr>
  <td><code>riscv32-esp-elf</code></td>
  <td><a href="https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102"><img src="https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/riscv32-esp-elf.json" alt="riscv32-esp-elf"/></a></td>
  <td>✓</td><td>✓</td><td></td>
</tr>
<tr>
  <td><code>avr</code></td>
  <td><a href="https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102"><img src="https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/avr.json" alt="avr"/></a></td>
  <td>✓</td><td></td><td>✓</td>
</tr>
<tr>
  <td><code>x86_64-w64-mingw32-ucrt</code></td>
  <td><a href="https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102"><img src="https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/x86_64-w64-mingw32-ucrt.json" alt="x86_64-w64-mingw32-ucrt"/></a></td>
  <td></td><td></td><td>✓</td>
</tr>
<tr>
  <td><code>x86_64-w64-mingw32-msvcrt</code></td>
  <td><a href="https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102"><img src="https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/x86_64-w64-mingw32-msvcrt.json" alt="x86_64-w64-mingw32-msvcrt"/></a></td>
  <td></td><td></td><td>✓</td>
</tr>
<tr>
  <td><code>i686-w64-mingw32-ucrt</code></td>
  <td><a href="https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102"><img src="https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/i686-w64-mingw32-ucrt.json" alt="i686-w64-mingw32-ucrt"/></a></td>
  <td></td><td></td><td>✓</td>
</tr>
<tr>
  <td><code>i686-w64-mingw32-msvcrt</code></td>
  <td><a href="https://gist.github.com/jmacheta/533dd887be336d666b26bf4179e67102"><img src="https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/jmacheta/533dd887be336d666b26bf4179e67102/raw/i686-w64-mingw32-msvcrt.json" alt="i686-w64-mingw32-msvcrt"/></a></td>
  <td></td><td></td><td>✓</td>
</tr>
</tbody>
</table>

Download, verify, and add a GCC cross-compilation toolchain to `PATH` in your GitHub Actions workflow. Supports ARM, AArch64, RISC-V, Xtensa (ESP32), AVR, and native x86\_64 — on Linux and Windows runners.

## Usage

```yaml
- uses: jmacheta/setup-gcc-toolchain@v1
  with:
    toolchain: arm-none-eabi
    version: "15.2.1-1.1"
```

The toolchain is prepended to `PATH`, so it takes priority over any pre-installed compiler.

On Linux, the action also creates triplet-prefixed symlinks for all standard GCC tools (`gcc`, `g++`, `ar`, `ld`, `objcopy`, etc.) if the binaries don't already carry a prefix matching the compiler's reported target triplet. This means a native `x86_64-gcc` toolchain becomes accessible as both `gcc` and `x86_64-linux-gnu-gcc`.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `toolchain` | yes | — | Toolchain name (see [Supported toolchains](#supported-toolchains)) |
| `vendor` | no | — | Vendor name, e.g. `xpack` or `arm`. Required when a toolchain name is offered by multiple vendors and the requested version is ambiguous. |
| `version` | yes | — | Version string, or `latest` for the newest available |
| `enable-cache` | no | `true` | Cache the downloaded archive with `actions/cache` |

### Vendor selection

Some toolchain names are provided by more than one vendor (e.g. `arm-none-eabi` is available from both `arm` and `xpack`). Without specifying `vendor`, the action picks the first match and raises an error if the requested version exists in multiple vendors. Use the `vendor` input to be explicit:

```yaml
- uses: jmacheta/setup-gcc-toolchain@v1
  with:
    toolchain: arm-none-eabi
    vendor: xpack          # xPack release
    version: "15.2.1-1.1"
```

## Outputs

| Output | Description |
| --- | --- |
| `toolchain-path` | Absolute path to the toolchain root directory |
| `cache-hit` | `true` if the toolchain was restored from cache |

## Supported toolchains

### Linux runners (`ubuntu-*`)

| Toolchain | Description | Available vendors | Architectures |
| --- | --- | --- | --- |
| `arm-none-eabi` | ARM bare-metal (Cortex-M/R) | `xpack`, `arm` | x86\_64, ARM64 |
| `aarch64-none-elf` | AArch64 bare-metal | `xpack`, `arm` | x86\_64, ARM64 |
| `arm-none-linux-gnueabihf` | AArch32 Linux hard-float (glibc) | `arm` | x86\_64, ARM64 |
| `aarch64-none-linux-gnu` | AArch64 Linux (glibc) | `arm` | x86\_64, ARM64 |
| `riscv-none-elf` | RISC-V bare-metal (RV32/RV64) | `xpack` | x86\_64, ARM64 |
| `x86_64-gcc` | Native x86\_64 GCC | `xpack` | x86\_64, ARM64 |
| `xtensa-esp-elf` | Xtensa for ESP32/ESP32-S2/S3 | `espressif` | x86\_64, ARM64 |
| `riscv32-esp-elf` | RISC-V for ESP32-C/H series | `espressif` | x86\_64, ARM64 |
| `avr` | AVR (ATmega, ATtiny, …) | `zakkemble` | x86\_64 |

### Windows runners (`windows-*`)

| Toolchain | Description | Available vendors |
| --- | --- | --- |
| `arm-none-eabi` | ARM bare-metal (Cortex-M/R) | `xpack`, `arm` |
| `aarch64-none-elf` | AArch64 bare-metal | `xpack` |
| `riscv-none-elf` | RISC-V bare-metal (RV32/RV64) | `xpack` |
| `x86_64-gcc` | Native x86\_64 GCC | `xpack` |
| `avr` | AVR (ATmega, ATtiny, …) | `zakkemble` |
| `x86_64-w64-mingw32-ucrt` | MinGW-w64 x86\_64, UCRT *(recommended)* | `winlibs` |
| `x86_64-w64-mingw32-msvcrt` | MinGW-w64 x86\_64, legacy MSVCRT | `winlibs` |
| `i686-w64-mingw32-ucrt` | MinGW-w64 i686 32-bit, UCRT | `winlibs` |
| `i686-w64-mingw32-msvcrt` | MinGW-w64 i686 32-bit, legacy MSVCRT | `winlibs` |

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

### Selecting a specific vendor

When a toolchain is provided by more than one vendor, use the `vendor` input:

```yaml
- uses: jmacheta/setup-gcc-toolchain@v1
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
6. On Linux, detects the compiler's target triplet via `gcc -dumpmachine` and creates symlinks for all standard tools (`gcc`, `g++`, `ar`, `as`, `ld`, `nm`, `objcopy`, `objdump`, `ranlib`, `readelf`, `size`, `strings`, `strip`, `gdb`) under the triplet prefix if they don't already exist. This ensures consistent `<triplet>-<tool>` access regardless of how the toolchain packages its binaries.
7. Optionally saves the extracted directory to `actions/cache`.

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
