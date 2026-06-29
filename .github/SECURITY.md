# Security policy

## Supported versions

Only the latest release on the `main` branch is actively maintained.

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please email **janmacheta [at] gmail [dot] com** with the subject line `[security] setup-gcc-toolchain`. Include:

- A description of the vulnerability
- Steps to reproduce
- Potential impact

You will receive a response within 5 business days. If the issue is confirmed, a fix will be released as quickly as possible and credited to the reporter (unless you prefer to remain anonymous).

## Scope

This action downloads toolchain archives from third-party vendors (xPack, Espressif, ZakKemble, WinLibs) and verifies their SHA256 checksums before use. A vulnerability in the supply chain of those vendors is outside the scope of this project's security policy — please report those issues directly to the respective vendors.
