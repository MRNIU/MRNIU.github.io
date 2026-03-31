import { describe, it, expect } from "vitest";
import { extractSemantic } from "../src/semantic.js";

describe("extractSemantic", () => {
  it("extracts 'feat' from conventional commit", () => {
    expect(extractSemantic("feat(mm): implement UEFI memory map parser")).toBe("feat");
  });
  it("extracts 'fix' from conventional commit", () => {
    expect(extractSemantic("fix: resolve null pointer in boot sequence")).toBe("fix");
  });
  it("extracts 'refactor' with scope", () => {
    expect(extractSemantic("refactor(kernel): simplify page table walk")).toBe("refactor");
  });
  it("extracts 'docs'", () => {
    expect(extractSemantic("docs: update README with build instructions")).toBe("docs");
  });
  it("extracts 'test'", () => {
    expect(extractSemantic("test: add unit tests for allocator")).toBe("test");
  });
  it("extracts 'chore'", () => {
    expect(extractSemantic("chore: bump dependencies")).toBe("chore");
  });
  it("detects merge commits", () => {
    expect(extractSemantic("Merge pull request #42 from user/branch")).toBe("merge");
    expect(extractSemantic("Merge branch 'main' into feature")).toBe("merge");
  });
  it("returns null for non-conventional messages", () => {
    expect(extractSemantic("update something")).toBeNull();
    expect(extractSemantic("WIP")).toBeNull();
    expect(extractSemantic("")).toBeNull();
  });
  it("is case-insensitive for conventional prefix", () => {
    expect(extractSemantic("Feat: add new feature")).toBe("feat");
    expect(extractSemantic("FIX(core): bug")).toBe("fix");
  });
});
