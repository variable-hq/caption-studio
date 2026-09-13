import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
  title: "Church Live Caption",
  description: "Cloud-hosted multilingual church captions for OBS",
};
export const viewport: Viewport = { themeColor: "#f7f7f5" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
