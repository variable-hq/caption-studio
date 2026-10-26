import { describe, expect, it } from "vitest";

import { STORAGE_MIGRATION_SCRIPT } from "@/live/storage-migration";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  constructor(initial: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initial)) this.values.set(key, value);
  }

  get length() {
    return this.values.size;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  snapshot() {
    return Object.fromEntries(this.values);
  }
}

function runMigration(window: Record<string, unknown>) {
  new Function("window", STORAGE_MIGRATION_SCRIPT)(window);
}

describe("legacy storage key migration", () => {
  it("moves every church-live-caption key in both storages to caption-studio", () => {
    const localStorage = new MemoryStorage({
      "church-live-caption:theme:v1": "dark",
      "church-live-caption:sidebar-width:v1": "240",
      "unrelated": "kept",
    });
    const sessionStorage = new MemoryStorage({
      "church-live-caption:main-controller:v1": "controller",
    });

    runMigration({ localStorage, sessionStorage });

    expect(localStorage.snapshot()).toEqual({
      "caption-studio:theme:v1": "dark",
      "caption-studio:sidebar-width:v1": "240",
      "unrelated": "kept",
    });
    expect(sessionStorage.snapshot()).toEqual({
      "caption-studio:main-controller:v1": "controller",
    });
  });

  it("keeps a value already saved under the new key and drops the legacy one", () => {
    const localStorage = new MemoryStorage({
      "church-live-caption:theme:v1": "dark",
      "caption-studio:theme:v1": "light",
    });

    runMigration({ localStorage, sessionStorage: new MemoryStorage() });

    expect(localStorage.snapshot()).toEqual({ "caption-studio:theme:v1": "light" });
  });

  it("still migrates sessionStorage when localStorage is blocked", () => {
    const sessionStorage = new MemoryStorage({ "church-live-caption:main-viewer:v1": "viewer" });
    const window = { sessionStorage };
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("blocked");
      },
    });

    expect(() => runMigration(window)).not.toThrow();
    expect(sessionStorage.snapshot()).toEqual({ "caption-studio:main-viewer:v1": "viewer" });
  });
});
