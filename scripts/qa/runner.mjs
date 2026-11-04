import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

// Loaded here so an invalid CAPTION_QA_PORT prints one line and exits, instead of an import stack trace.
let QA_ORIGIN;
let QA_PORT;
try {
  ({ QA_ORIGIN, QA_PORT } = await import("./dashboard-helpers.mjs"));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const tooling = path.resolve(process.env.CAPTION_QA_TOOLS_DIR || path.join(os.tmpdir(), "caption-studio-ui-qa"));
const env = { ...process.env, CAPTION_QA_TOOLS_DIR: tooling };
let server;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env, ...options });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed (${signal || `exit ${code}`}).`));
    });
  });
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next dev server exited early (${server.exitCode}).`);
    try {
      await fetch(QA_ORIGIN, { signal: AbortSignal.timeout(1_000) });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Next dev server did not respond within 30 seconds: ${lastError?.message || "timeout"}`);
}

try {
  const portInUse = await fetch(QA_ORIGIN, { signal: AbortSignal.timeout(1_000) }).then(() => true, () => false);
  if (portInUse) throw new Error(`Port ${QA_PORT} is already in use; set CAPTION_QA_PORT to a free port.`);
  server = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(QA_PORT)], {
    stdio: "inherit",
    env,
    detached: process.platform !== "win32",
    shell: process.platform === "win32",
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("spawn", resolve);
  });
  await waitForServer();

  const bootstrap = spawnSync(process.execPath, ["scripts/qa/bootstrap.mjs"], { stdio: "inherit", env });
  if (bootstrap.error) throw bootstrap.error;
  if (bootstrap.status !== 0) throw new Error(`QA bootstrap failed (exit ${bootstrap.status}).`);

  const outcomes = await Promise.allSettled(
    ["qa:operator", "qa:experience"].map((script) => run("npm", ["run", script], { shell: process.platform === "win32" })),
  );
  const failures = outcomes.flatMap((outcome) => (outcome.status === "rejected" ? [outcome.reason.message] : []));
  if (failures.length) throw new Error(failures.join("\n"));
} finally {
  if (server) {
    try {
      if (process.platform === "win32") {
        if (server.exitCode === null) server.kill();
      } else process.kill(-server.pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
}
