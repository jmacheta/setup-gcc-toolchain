import { describe, it, expect } from "@jest/globals";
import { toolchainPrefix } from "../src/index.js";

describe("toolchainPrefix", () => {
  it("appends a dash to a bare triplet", () => {
    expect(toolchainPrefix("arm-none-eabi")).toBe("arm-none-eabi-");
  });

  it("strips gcc when the toolchain name already ends with -gcc", () => {
    expect(toolchainPrefix("x86_64-w64-mingw32-gcc")).toBe("x86_64-w64-mingw32-");
  });

  it("special-cases x86_64-gcc to no prefix", () => {
    expect(toolchainPrefix("x86_64-gcc")).toBe("");
  });
});
