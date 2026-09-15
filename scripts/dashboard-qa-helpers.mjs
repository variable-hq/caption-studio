// The same destinations are available in the desktop rail and the mobile drawer.
export async function openDashboardSection(page, name) {
  const service = page.getByRole("dialog", { name: "Service controls", exact: true });
  if (await service.isVisible() && await service.evaluate((el) => el.matches(":modal"))) {
    await closeServicePanel(page);
  }
  const menu = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name, exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.id === "workspace-panel-heading");
}

// The guide launcher lives in the navigation: the rail on desktop, the drawer on phones.
export async function openTutorial(page) {
  const menu = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "How to use", exact: true }).click();
}

// After dismissal focus returns to the rail launcher, or to the menu button on phones.
export async function tutorialFocusReturned(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    return active?.textContent?.trim() === "How to use" || active?.getAttribute("aria-label") === "Open navigation";
  });
}

export async function openServicePanel(page) {
  const toggle = page.getByRole("button", { name: "Service controls", exact: true });
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await page.getByRole("dialog", { name: "Service controls", exact: true }).waitFor();
}

export async function closeServicePanel(page) {
  const close = page.getByRole("button", { name: "Collapse service panel", exact: true });
  if (await close.isVisible()) await close.click();
  await page.getByRole("dialog", { name: "Service controls", exact: true }).waitFor({ state: "hidden" });
}
