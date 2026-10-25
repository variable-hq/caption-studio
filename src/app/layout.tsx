import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
  title: "Caption Studio",
  description: "Cloud-hosted multilingual church captions for OBS",
};
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
};

// Runs before first paint so an operator who chose Dark does not see a light flash while
// React hydrates and the account preference loads. Accepts only the two literal values;
// storage errors (private mode, blocked storage) leave the OS setting in charge.
const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("church-live-caption:theme:v1");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
