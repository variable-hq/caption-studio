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
