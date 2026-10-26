// Include the minimum supported width, where a previous overflow regression was found.
export const QA_VIEWPORT_WIDTHS = [1920, 1200, 390, 320];

const SETTINGS_LABELS = {
  computer: "This computer",
  languages: "Languages & timing",
  words: "Words",
  look: "Caption look",
  obs: "OBS & links",
  translator: "AI translator",
  summary: "AI summary",
  usage: "Usage",
};

// Opens a top-level screen through its tab, as an operator would.
export async function openScreen(page, name) {
  await page.getByRole("navigation", { name: "Main", exact: true })
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
