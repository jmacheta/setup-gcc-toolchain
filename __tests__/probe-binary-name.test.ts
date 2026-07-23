import { describe, it, expect } from "@jest/globals";
import { probeBinaryName } from "../src/index.js";

describe("probeBinaryName", () => {
  it("appends -gcc to a bare triplet", () => {
    expect(probeBinaryName("arm-none-eabi")).toBe("arm-none-eabi-gcc");
  });

  it("does not double up -gcc when the toolchain name already ends with it", () => {
    expect(probeBinaryName("x86_64-w64-mingw32-gcc")).toBe("x86_64-w64-mingw32-gcc");
  });

  it("special-cases x86_64-gcc to plain gcc", () => {
    expect(probeBinaryName("x86_64-gcc")).toBe("gcc");
  });
});
