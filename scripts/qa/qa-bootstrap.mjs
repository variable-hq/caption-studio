import os from "node:os";
import path from "node:path";
import { access, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const tooling = path.resolve(process.env.CAPTION_QA_TOOLS_DIR || path.join(os.tmpdir(), "church-caption-ui-qa"));
await mkdir(tooling, { recursive: true });

try {
  await import(pathToFileURL(path.join(tooling, "node_modules/playwright/index.mjs")));
} catch {
  const result = await new Promise((resolve, reject) => {
    const child = spawn("npm", ["install", "--no-save", "playwright", "@axe-core/playwright"], {
      cwd: tooling,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
  if (result !== 0) throw new Error(`QA tooling installation failed (npm exited ${result}).`);
}

const { chromium } = await import(pathToFileURL(path.join(tooling, "node_modules/playwright/index.mjs")));
try {
  await access(chromium.executablePath());
} catch {
  const result = await new Promise((resolve, reject) => {
    const child = spawn("npx", ["playwright", "install", "chromium"], {
      cwd: tooling,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
  if (result !== 0) throw new Error(`Chromium installation failed (npx exited ${result}).`);
}

console.log(tooling);
