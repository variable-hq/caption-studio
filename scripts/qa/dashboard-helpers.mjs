// Include the minimum supported width, where a previous overflow regression was found.
export const QA_VIEWPORT_WIDTHS = [1920, 1200, 390, 320];

const SETTINGS_LABELS = {
  computer: "System",
  languages: "Language",
  words: "Words",
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
