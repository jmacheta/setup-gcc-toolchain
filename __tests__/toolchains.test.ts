import { describe, it, expect } from "@jest/globals";
import * as path from "path";
import { resolveToolchain, compareVersions } from "../src/toolchains";

const REPO_ROOT = path.join(__dirname, "..");

describe("resolveToolchain", () => {
  it("resolves arm-none-eabi (xpack) on linux-x64", () => {
    const entry = resolveToolchain(REPO_ROOT, "arm-none-eabi", "15.2.1-1.1", "linux-x64");
    expect(entry.url).toContain("arm-none-eabi");
    expect(entry.url).toContain("15.2.1-1.1");
    expect(entry.url).toContain("linux-x64");
    expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("resolves arm-none-eabi (xpack) on linux-arm64", () => {
    const entry = resolveToolchain(REPO_ROOT, "arm-none-eabi", "15.2.1-1.1", "linux-arm64");
    expect(entry.url).toContain("linux-arm64");
    expect(entry.sha256).toHaveLength(64);
  });

  it("resolves arm-none-eabi (xpack) on windows-x64", () => {
    const entry = resolveToolchain(REPO_ROOT, "arm-none-eabi", "15.2.1-1.1", "windows-x64");
    expect(entry.url).toContain("win32-x64");
    expect(entry.sha256).toHaveLength(64);
  });

  it("resolves aarch64-none-elf (xpack) on linux-x64", () => {
    const entry = resolveToolchain(REPO_ROOT, "aarch64-none-elf", "14.2.1-1.1", "linux-x64");
    expect(entry.url).toContain("aarch64-none-elf");
    expect(entry.sha256).toHaveLength(64);
  });

  it("resolves arm-none-eabi (arm official) on linux-x64", () => {
    const entry = resolveToolchain(REPO_ROOT, "arm-none-eabi", "14.2.rel1", "linux-x64");
    expect(entry.url).toContain("arm-gnu-toolchain");
    expect(entry.url).toContain("x86_64-arm-none-eabi");
    expect(entry.sha256).toHaveLength(64);
  });

  it("resolves arm-none-eabi (arm official) on linux-arm64", () => {
    const entry = resolveToolchain(REPO_ROOT, "arm-none-eabi", "14.2.rel1", "linux-arm64");
    expect(entry.url).toContain("aarch64-arm-none-eabi");
    expect(entry.sha256).toHaveLength(64);
  });

  it("resolves arm-none-eabi (arm official) on windows-x64", () => {
    const entry = resolveToolchain(REPO_ROOT, "arm-none-eabi", "14.2.rel1", "windows-x64");
    expect(entry.url).toContain("mingw-w64-x86_64-arm-none-eabi");
    expect(entry.sha256).toHaveLength(64);
  });

  it("resolves arm-none-linux-gnueabihf on linux-x64", () => {
    const entry = resolveToolchain(REPO_ROOT, "arm-none-linux-gnueabihf", "14.2.rel1", "linux-x64");
    expect(entry.url).toContain("arm-none-linux-gnueabihf");
    expect(entry.sha256).toHaveLength(64);
  });

  it("resolves arm-none-linux-gnueabihf on linux-arm64", () => {
    const entry = resolveToolchain(REPO_ROOT, "arm-none-linux-gnueabihf", "14.2.rel1", "linux-arm64");
    expect(entry.url).toContain("aarch64-arm-none-linux-gnueabihf");
    expect(entry.sha256).toHaveLength(64);
  });

  it("resolves arm-none-linux-gnueabihf on windows-x64", () => {
    const entry = resolveToolchain(REPO_ROOT, "arm-none-linux-gnueabihf", "14.2.rel1", "windows-x64");
    expect(entry.url).toContain("mingw-w64-x86_64-arm-none-linux-gnueabihf");
    expect(entry.sha256).toHaveLength(64);
  });

  it("resolves aarch64-none-linux-gnu on linux-x64", () => {
    const entry = resolveToolchain(REPO_ROOT, "aarch64-none-linux-gnu", "14.2.rel1", "linux-x64");
    expect(entry.url).toContain("x86_64-aarch64-none-linux-gnu");
    expect(entry.sha256).toHaveLength(64);
  });

  it("resolves aarch64-none-linux-gnu on linux-arm64", () => {
    const entry = resolveToolchain(REPO_ROOT, "aarch64-none-linux-gnu", "14.2.rel1", "linux-arm64");
    expect(entry.url).toContain("aarch64-aarch64-none-linux-gnu");
    expect(entry.sha256).toHaveLength(64);
  });

  it("resolves aarch64-none-linux-gnu on windows-x64", () => {
    const entry = resolveToolchain(REPO_ROOT, "aarch64-none-linux-gnu", "14.2.rel1", "windows-x64");
    expect(entry.url).toContain("mingw-w64-x86_64-aarch64-none-linux-gnu");
    expect(entry.sha256).toHaveLength(64);
  });

  it("resolves xpack x86_64-gcc on linux-x64", () => {
    const entry = resolveToolchain(REPO_ROOT, "x86_64-gcc", "15.2.0-1", "linux-x64");
    expect(entry.url).toContain("gcc-xpack");
    expect(entry.sha256).toHaveLength(64);
  });

  it("resolves xpack x86_64-gcc on windows-x64", () => {
    const entry = resolveToolchain(REPO_ROOT, "x86_64-gcc", "15.2.0-1", "windows-x64");
    expect(entry.url).toContain("win32-x64");
    expect(entry.sha256).toHaveLength(64);
  });

  it("resolves winlibs x86_64-w64-mingw32-ucrt on windows-x64", () => {
    const entry = resolveToolchain(REPO_ROOT, "x86_64-w64-mingw32-ucrt", "16.1.0", "windows-x64");
    expect(entry.url).toContain("winlibs");
    expect(entry.url).toContain("ucrt");
    expect(entry.sha256).toHaveLength(64);
  });

  it("resolves latest version when version=latest", () => {
    const entry = resolveToolchain(REPO_ROOT, "arm-none-eabi", "latest", "linux-x64");
    expect(entry.url).toBeTruthy();
  });

  it("resolves avr on linux-x64", () => {
    const entry = resolveToolchain(REPO_ROOT, "avr", "14.1.0", "linux-x64");
    expect(entry.url).toBeTruthy();
  });

  it("throws for unsupported platform", () => {
    expect(() =>
      resolveToolchain(REPO_ROOT, "arm-none-eabi", "latest", "windows-arm64" as any)
    ).toThrow(/No toolchain database available/);
  });

  it("resolves arm-none-eabi with explicit xpack vendor", () => {
    const entry = resolveToolchain(REPO_ROOT, "arm-none-eabi", "15.2.1-1.1", "linux-x64", "xpack");
    expect(entry.url).toContain("15.2.1-1.1");
    expect(entry.sha256).toHaveLength(64);
  });

  it("resolves arm-none-eabi with explicit arm vendor", () => {
    const entry = resolveToolchain(REPO_ROOT, "arm-none-eabi", "14.2.rel1", "linux-x64", "arm");
    expect(entry.url).toContain("arm-gnu-toolchain");
    expect(entry.sha256).toHaveLength(64);
  });

  it("throws for unknown vendor", () => {
    expect(() =>
      resolveToolchain(REPO_ROOT, "arm-none-eabi", "latest", "linux-x64", "nonexistent-vendor")
    ).toThrow(/vendor/);
  });

  it("throws for unknown toolchain with helpful message", () => {
    expect(() =>
      resolveToolchain(REPO_ROOT, "nonexistent-gcc", "1.0.0", "linux-x64")
    ).toThrow(/Available:/);
  });

  it("throws for unknown version with available versions list", () => {
    expect(() =>
      resolveToolchain(REPO_ROOT, "arm-none-eabi", "0.0.1", "linux-x64")
    ).toThrow(/Available versions:/);
  });

  it("xtensa-esp-elf not available on windows-x64", () => {
    expect(() =>
      resolveToolchain(REPO_ROOT, "xtensa-esp-elf", "latest", "windows-x64")
    ).toThrow(/not found/);
  });
});

describe("compareVersions", () => {
  it("treats a release suffix as newer than a pure numeric patch", () => {
    expect(compareVersions("14.2.rel1", "14.2.0")).toBeGreaterThan(0);
  });

  it("compares numeric segments by value, not lexicographically", () => {
    expect(compareVersions("9.2.0", "10.1.0")).toBeLessThan(0);
    expect(compareVersions("2.0", "10.0")).toBeLessThan(0);
  });

  it("compares underscore-separated date suffixes numerically", () => {
    expect(compareVersions("13.2.0_20240530", "13.2.0_20240305")).toBeGreaterThan(0);
  });

  it("is reflexive for equal versions", () => {
    expect(compareVersions("15.2.1-1.1", "15.2.1-1.1")).toBe(0);
  });
});
