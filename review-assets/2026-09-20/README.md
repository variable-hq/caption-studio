# Operator dashboard, before and after the 20 September 2026 design pass

Synthetic local captures from headless Chromium through Playwright, taken against
`npm run dev` with mocked API responses. They contain no real credential, service link
or sermon content.

| File | What it shows |
| --- | --- |
| `before-overview-desktop.png` / `after-overview-desktop.png` | Service overview at 1440 px, light theme |
| `before-outputs-dark.png` / `after-outputs-dark.png` | Live outputs at 1440 px, dark theme |
| `before-overview-phone.png` / `after-overview-phone.png` | Service overview at 390 px, light theme |

The fixed status bar is painted once at its viewport position in a full-page capture, so
it appears to overlap content in the taller images. It does not overlap in the running
app: `.dashboardContent` reserves `--dashboard-status-bar-height` at the end of its
padding, which was verified separately by scrolling to the end of the page at 1440 and
390 px.
