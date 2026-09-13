// The same destinations are available in the desktop rail and the mobile drawer.
export async function openDashboardSection(page, name) {
  const menu = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name, exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.id === "workspace-panel-heading");
}
