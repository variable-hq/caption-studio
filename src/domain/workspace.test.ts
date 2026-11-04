import { describe, expect, it } from "vitest";

import { WORKSPACE_NAME, isValidWorkspaceNameInput, normalizeWorkspaceName } from "@/domain/workspace";

describe("workspace name input", () => {
  it("accepts up to 60 characters, counting each code point once", () => {
    expect(isValidWorkspaceNameInput("a".repeat(60))).toBe(true);
    expect(isValidWorkspaceNameInput("a".repeat(61))).toBe(false);
    expect(isValidWorkspaceNameInput("😀".repeat(60))).toBe(true);
    expect(isValidWorkspaceNameInput("😀".repeat(61))).toBe(false);
  });

  it("rejects control characters, including line breaks and tabs inside the name", () => {
    expect(isValidWorkspaceNameInput("Gereja\nSion")).toBe(false);
    expect(isValidWorkspaceNameInput("Gereja\tSion")).toBe(false);
    expect(isValidWorkspaceNameInput("Gereja\u0007Sion")).toBe(false);
    expect(isValidWorkspaceNameInput("Gereja\u009fSion")).toBe(false);
  });

  it("treats empty and whitespace-only text as valid, meaning the default name", () => {
    expect(isValidWorkspaceNameInput("")).toBe(true);
    expect(isValidWorkspaceNameInput("   ")).toBe(true);
    expect(normalizeWorkspaceName("")).toBeNull();
    expect(normalizeWorkspaceName("   ")).toBeNull();
  });
});

describe("normalizeWorkspaceName", () => {
  it("trims the name and keeps its other characters", () => {
    expect(normalizeWorkspaceName("  Gereja Sion ✝  ")).toBe("Gereja Sion ✝");
  });

  it("returns null for absent, non-string or invalid values, so the default name applies", () => {
    expect(normalizeWorkspaceName(undefined)).toBeNull();
    expect(normalizeWorkspaceName(42)).toBeNull();
    expect(normalizeWorkspaceName("a".repeat(61))).toBeNull();
    expect(normalizeWorkspaceName("Gereja\nSion")).toBeNull();
  });

  it("keeps the built-in default name as a constant", () => {
    expect(WORKSPACE_NAME).toBe("BEST Church workspace");
  });
});
