import type { Metadata, Viewport } from "next";
import { Carlito, Inconsolata } from "next/font/google";

import { STORAGE_MIGRATION_SCRIPT } from "@/live/storage-migration";

import "./globals.css";

export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
  title: "Caption Studio",
  description: "Cloud-hosted multilingual live captions for OBS",
};
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
};

// Runs before first paint so an operator who chose Dark does not see a light flash while
// React hydrates and the account preference loads. Accepts only the two literal values;
// storage errors (private mode, blocked storage) leave the OS setting in charge. The
// legacy key migration runs first so the theme read below already sees the new key.
const BOOT_SCRIPT = `${STORAGE_MIGRATION_SCRIPT}try{var t=localStorage.getItem("caption-studio:theme:v1");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

// Calibri is licensed and cannot be shipped, so the stacks in globals.css use it where it is
// installed and fall back to these metric-compatible open fonts. Both are self-hosted at build
// time by next/font, so no page request goes to a font host.
const carlito = Carlito({ weight: ["400", "700"], subsets: ["latin", "latin-ext"], variable: "--font-carlito", display: "swap" });
const inconsolata = Inconsolata({ weight: ["400", "700"], subsets: ["latin", "latin-ext"], variable: "--font-inconsolata", display: "swap" });

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${carlito.variable} ${inconsolata.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
