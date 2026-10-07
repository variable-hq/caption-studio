import { openDashboardSection, openTutorial, tutorialFocusReturned } from "./dashboard-qa-helpers.mjs";
// Start `npm run dev -- --hostname 127.0.0.1 --port 3100`. Set CAPTION_QA_TOOLS_DIR to an isolated directory
// containing node_modules/playwright and node_modules/@axe-core/playwright.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const tooling = process.env.CAPTION_QA_TOOLS_DIR;
assert.ok(tooling, "Set CAPTION_QA_TOOLS_DIR to the isolated browser QA installation.");
const { chromium } = await import(pathToFileURL(path.join(tooling, "node_modules/playwright/index.mjs")));
const { default: AxeBuilder } = await import(pathToFileURL(path.join(tooling, "node_modules/@axe-core/playwright/dist/index.mjs")));
const origin = "http://127.0.0.1:3100";
const output = path.resolve("test-results/tutorial");
const preference = "church-live-caption:operator-tutorial:v1";
const results = [];
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function fixture(width, status = "idle", storageBlocked = false, height = width > 500 ? 1080 : 844) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  const mutations = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(({ storageBlocked }) => {
    window.__audioRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      window.__audioRequests++;
      throw new Error("Tutorial must not request audio.");
    };
    if (storageBlocked) Object.defineProperty(window, "localStorage", {
      get() { throw new DOMException("Storage unavailable", "SecurityError"); },
    });
  }, { storageBlocked });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (request.method() !== "GET") {
      if (url.pathname === "/api/live/experience/preferences") return route.fulfill({ json: { version: 1, tutorialDismissed: true } });
      // Registering as a watcher of somebody else's service changes nothing an
      // operator can observe: no controller, no capture, no audience link.
      if (url.pathname === "/api/live/channel/observer") return route.fulfill({ status: 410, json: { error: "Service ended.", code: "service_inactive" } });
      mutations.push(url.pathname);
      return route.fulfill({ status: 400, json: { error: "Unexpected tutorial mutation." } });
    }
    if (url.pathname === "/api/ai/health") return route.fulfill({ json: {
      status: "ready", hosting: "cloudflare", access: { ready: true, provider: "Cloudflare Access" },
      transcription: { ready: true, model: "whisper-large-v3-turbo" },
      translation: { ready: true, model: "openai/gpt-oss-20b" },
    } });
    if (url.pathname === "/api/live/experience/preferences") return route.fulfill({ json: {
      version: 1, theme: "system", sidebarWidth: null, translationSystemPrompt: null, summaryDefaults: null,
      captionStyle: null, translationDefaults: null, tutorialDismissed: false, updatedAt: null,
    } });
    if (url.pathname === "/api/live/experience/usage") return route.fulfill({ json: { records: [], next: null } });
    assert.equal(url.pathname, "/api/live/channel");
    return route.fulfill({ json: {
      channelId: "main", configured: status !== "idle", status, overlayUrl: null, style: null,
      startedAt: null, expiresAt: null, transcriptionRequests: 0, translationRevision: 0,
      llmUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, translationRequests: 0, providerRateLimit: null },
    } });
  });
  await page.goto(origin);
  await page.getByText("Cloud AI configured", { exact: true }).waitFor();
  return { context, page, errors, mutations };
}

async function checkLayout(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Page must reflow.");
  const dialog = page.locator(".tutorialDialog");
  assert.ok(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth), "Dialog must reflow.");
  const targets = await dialog.locator("button:visible, select:visible").evaluateAll((elements) => elements.map((element) => {
    const { width, height } = element.getBoundingClientRect();
    return { text: element.textContent, width, height };
  }));
  assert.deepEqual(targets.filter(({ width, height }) => width < 44 || height < 44), [], "Guide controls meet the product's 44px target.");
  for (const selector of [".tutorialHeader button", ".tutorialFooter button:last-child"]) {
    const box = await page.locator(selector).boundingBox();
    assert.ok(box && box.y >= 0 && box.y + box.height <= page.viewportSize().height, "Exit and navigation stay reachable.");
  }
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  assert.deepEqual(scan.violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) })), []);
}

async function goToStep(page, step) {
  const picker = page.getByRole("combobox", { name: "Tutorial step", exact: true });
  if (await picker.isVisible()) await picker.selectOption(String(step - 1));
  else await page.getByRole("navigation", { name: "Tutorial steps" }).getByRole("button", { name: new RegExp(`^Step ${step}:`) }).click();
}

try {
  for (const width of [1920, 1200, 390, 320]) {
    const { context, page, errors, mutations } = await fixture(width);
    const dialog = page.locator(".tutorialDialog");
    await dialog.waitFor({ state: "visible" });
    assert.equal(await page.locator(":focus").getAttribute("id"), "tutorial-heading");
    for (let step = 1; step <= 6; step++) {
      if (step > 1) await goToStep(page, step);
      assert.equal(await page.locator(":focus").getAttribute("id"), "tutorial-heading");
      assert.equal(await dialog.locator('[aria-current="step"]').count(), 1);
      assert.match(await dialog.locator('[aria-current="step"]').getAttribute("aria-label"), new RegExp(`^Step ${step}:`));
      await checkLayout(page);
      if (step <= 2 || step === 4) await page.screenshot({ path: path.join(output, `step-${step}-${width}.png`) });
    }
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("heading", { name: "Start captions and invite viewers" }).waitFor();
    await page.getByRole("button", { name: "Next step", exact: true }).click();
    // Native modal keeps Tab and Shift+Tab away from the dashboard.
    for (let index = 0; index < 14; index++) {
      await page.keyboard.press(index < 7 ? "Tab" : "Shift+Tab");
      const focus = await page.evaluate(() => ({
        inDialog: Boolean(document.activeElement?.closest(".tutorialDialog")),
        documentFocused: document.hasFocus(),
        element: document.activeElement?.tagName,
      }));
      assert.ok(focus.inDialog || !focus.documentFocused, JSON.stringify(focus));
    }
    await page.getByRole("button", { name: "Go to dashboard", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.ok(await tutorialFocusReturned(page), "Focus returns to the guide launcher or the navigation menu.");
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), preference), "dismissed");
    await page.reload();
    await page.getByText("Main channel · Idle", { exact: true }).waitFor();
    assert.equal(await dialog.isVisible(), false);
    await openDashboardSection(page, "Translation");
    assert.equal(await page.getByTestId("source-language").inputValue(), "en");
    assert.equal(await page.getByTestId("target-language").inputValue(), "id");
    await page.getByTestId("source-language").selectOption("id");
    await page.getByTestId("target-language").selectOption("en");
    await openTutorial(page);
    await page.getByRole("heading", { name: "Your first live translation" }).waitFor();
    // A guide shortcut only opens a panel. Replay returns to the same topic.
    const shortcuts = [
      [2, "Open Audio input", "Audio input"],
      [3, "Open Translation", "Languages, timing and terminology"],
      [4, "Open Appearance", "Caption appearance"],
      [5, "Open audience outputs", "Live outputs"],
      [6, "Open AI usage", "Consumption and limits"],
    ];
    for (const [step, action, heading] of shortcuts) {
      await goToStep(page, step);
      await page.getByRole("button", { name: action, exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement?.id === "workspace-panel-heading");
      assert.equal(await page.locator(":focus").innerText(), heading);
      await openTutorial(page);
      assert.match(await dialog.locator('[aria-current="step"]').getAttribute("aria-label"), new RegExp(`^Step ${step}:`));
    }
    await page.getByRole("button", { name: "Skip tutorial", exact: true }).click();
    await openTutorial(page);
    await page.keyboard.press("Escape");
    await openTutorial(page);
    assert.equal(await dialog.isVisible(), true);
    assert.equal(await page.locator(":focus").getAttribute("id"), "tutorial-heading");
    await page.keyboard.press("Escape");
    assert.ok(await tutorialFocusReturned(page), "Focus returns to the guide launcher or the navigation menu.");
    await openDashboardSection(page, "Translation");
    assert.equal(await page.getByTestId("source-language").inputValue(), "id");
    assert.equal(await page.getByTestId("target-language").inputValue(), "en");
    assert.equal(await page.evaluate(() => window.__audioRequests), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(mutations, []);
    results.push({ width, sixSteps: true, focusAndReplay: true, sectionShortcuts: true, lastTopicRetained: true, dismissalPersists: true, axeViolations: 0, audioRequests: 0, mutations: 0 });
    await context.close();
    console.log(`Tutorial passes at ${width}px.`);
  }
  for (const status of ["live", "paused"]) {
    const { context, page, errors, mutations } = await fixture(1200, status);
    await page.getByText(`Main channel · ${status === "live" ? "Live" : "Paused"}`, { exact: true }).waitFor();
    assert.equal(await page.locator(".tutorialDialog").isVisible(), false);
    await openTutorial(page);
    await page.locator(".tutorialServiceNote").waitFor();
    await page.keyboard.press("Escape");
    assert.deepEqual(errors, []);
    assert.deepEqual(mutations, []);
    results.push({ status, automaticOpeningSuppressed: true, manualGuideWarnsServiceContinues: true, mutations: 0 });
    await context.close();
  }
  const { context, page, errors, mutations } = await fixture(568, "idle", true, 320);
  await page.locator(".tutorialDialog").waitFor({ state: "visible" });
  await checkLayout(page);
  await page.getByRole("button", { name: "Skip tutorial", exact: true }).click();
  await page.reload();
  await page.locator(".tutorialDialog").waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  assert.deepEqual(mutations, []);
  results.push({ storageUnavailable: "Guide remains usable; reappears after reload", shortLandscape: "568 × 320 passes" });
  await context.close();
  const enlarged = await fixture(390);
  await enlarged.page.locator(".tutorialDialog").waitFor({ state: "visible" });
  await enlarged.page.evaluate(() => {
    const sizes = [...document.querySelectorAll(".tutorialDialog, .tutorialDialog *")].map((element) => [element, parseFloat(getComputedStyle(element).fontSize)]);
    for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
  });
  await enlarged.page.addStyleTag({ content: ".tutorialDialog * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } .tutorialDialog p { margin-bottom: 2em !important; }" });
  for (let step = 1; step <= 6; step++) {
    await goToStep(enlarged.page, step);
    await checkLayout(enlarged.page);
    const lastInstruction = enlarged.page.locator(".tutorialInstructions li").last();
    await lastInstruction.scrollIntoViewIfNeeded();
    const box = await lastInstruction.boundingBox();
    const footer = await enlarged.page.locator(".tutorialFooter").boundingBox();
    assert.ok(box.y + box.height <= footer.y, "The last instruction can be read above the footer.");
  }
  await enlarged.page.screenshot({ path: path.join(output, "enlarged-text-390.png") });
  await enlarged.page.keyboard.press("Escape");
  assert.deepEqual(enlarged.errors, []);
  assert.deepEqual(enlarged.mutations, []);
  results.push({ enlargedText: "200% computed font sizes plus WCAG text spacing at 390px, all six steps", actualBrowserZoom: "Not tested" });
  await enlarged.context.close();
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2) + "\n");
} finally {
  await browser.close();
}
