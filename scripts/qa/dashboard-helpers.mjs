// Include the minimum supported width, where a previous overflow regression was found.
export const QA_VIEWPORT_WIDTHS = [1920, 1200, 390, 320];

export const CAPTION_WAIT_TIME_LABELS = [
  '6 seconds: quickest, may break mid-sentence',
  '10 seconds: balanced',
  '14 seconds: fuller sentences',
  'Dynamic: adapts to the speaker, up to 14 seconds',
];

const SETTINGS_LABELS = {
  computer: "System",
  presets: "Presets",
  languages: "Language",
  words: "Terms",
  look: "Output",
  obs: "OBS & links",
  translator: "Translation",
  summary: "Summary",
  usage: "Usage",
};

// Opens a top-level screen through its tab, as an operator would.
export async function openScreen(page, name) {
  await page.locator(".operatorTabs")
    .getByRole("link", { name, exact: true }).click();
  await page.waitForFunction((label) => {
    const current = document.querySelector('.operatorTab[aria-current="page"]');
    return current?.textContent?.trim() === label;
  }, name);
}

// Opens a Settings section through the Settings tab and the section list.
export async function openSettings(page, section) {
  await openScreen(page, "Settings");
  await page.getByRole("navigation", { name: "Settings sections", exact: true })
    .getByRole("link", { name: SETTINGS_LABELS[section], exact: true }).click();
  await page.getByRole("heading", { name: SETTINGS_LABELS[section], exact: true }).waitFor();
}

export const SETTINGS_SECTIONS = Object.keys(SETTINGS_LABELS);

// Browser QA runs its own dev server on CAPTION_QA_PORT (default 3100) so two runs can share a machine.
function parseQaPort(value) {
  if (value === undefined || value === "") return 3100;
  const port = Number(value);
  if (!/^\d{1,5}$/.test(value) || port < 1 || port > 65535) throw new Error("CAPTION_QA_PORT must be a port number from 1 to 65535.");
  return port;
}
export const QA_PORT = parseQaPort(process.env.CAPTION_QA_PORT);
export const QA_ORIGIN = `http://127.0.0.1:${QA_PORT}`;

// Screenshots are evidence for a human reviewer, so they are written only when CAPTION_QA_SHOTS=1.
// Failure screenshots are written by each suite regardless.
const QA_SHOTS = process.env.CAPTION_QA_SHOTS === "1";
export const captureScreenshot = (target, options) => (QA_SHOTS ? target.screenshot(options) : undefined);

// Axe runs at the desktop and the narrowest width; the other widths keep the overflow and wording checks.
export const AXE_WIDTHS = [1200, 320];
