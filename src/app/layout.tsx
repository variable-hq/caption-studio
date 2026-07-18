import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Church Live Caption",
  description: "Local-first multilingual church captions for OBS",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
