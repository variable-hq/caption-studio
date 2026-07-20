import { describe, expect, it } from "vitest";

import {
  InvalidRequestBodyError,
  RequestBodyTooLargeError,
  readBoundedText,
  readFormData,
  readJsonObject,
} from "@/http/request-body";

describe("bounded request bodies", () => {
  it("rejects a declared body that exceeds the byte limit", async () => {
    const request = new Request("https://caption.example/api", {
      method: "POST",
      headers: { "content-length": "101" },
      body: "small",
    });

    await expect(readBoundedText(request, 100)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it("rejects received bytes when content length is unavailable", async () => {
    const request = new Request("https://caption.example/api", {
      method: "POST",
      body: "123456",
    });

    await expect(readBoundedText(request, 5)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it("accepts JSON objects and rejects other JSON values", async () => {
    await expect(
      readJsonObject(
        new Request("https://caption.example/api", {
          method: "POST",
          body: JSON.stringify({ action: "clear" }),
        }),
        100,
      ),
    ).resolves.toEqual({ action: "clear" });

    await expect(
      readJsonObject(
        new Request("https://caption.example/api", {
          method: "POST",
          body: JSON.stringify(["clear"]),
        }),
        100,
      ),
    ).rejects.toBeInstanceOf(InvalidRequestBodyError);
  });

  it("parses bounded multipart form data", async () => {
    const form = new FormData();
    form.set("sourceLanguage", "en");
    form.set("audio", new Blob(["audio"]), "caption.webm");
    const request = new Request("https://caption.example/api", {
      method: "POST",
      body: form,
    });

    const parsed = await readFormData(request, 4_096);
    expect(parsed.get("sourceLanguage")).toBe("en");
    expect(parsed.get("audio")).toBeInstanceOf(Blob);
  });
});
