"use client";

const ICON_PATHS = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  audio: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8",
  translation: "M3 5h12 M9 2v3 M5 5c0 5 3 9 8 11 M13 5c0 5-4 10-10 12 M14 21l4-11 4 11 M15.5 17h5",
  appearance: "M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3.7 1.5 1.5 0 0 1 1-2.8h2a4 4 0 0 0 4-4C21 6 17 3 12 3z M7 10h.01 M10 7h.01 M15 7h.01 M7 15h.01",
  outputs: "M3 4h18v12H3z M12 16v4 M8 20h8 M8 8l-2 2 2 2 M16 8l2 2-2 2",
  history: "M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h5",
  usage: "M4 3v18h17 M8 17v-5 M13 17V7 M18 17v-8",
  prompt: "M8 4H4v4 M16 4h4v4 M4 16v4h4 M20 16v4h-4 M8 12h8 M12 8v8",
  summary: "M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5 M17 3l1.5 1.5L17 6",
  override: "M4 7h16 M8 7h.01 M4 17h16 M14 17h.01",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  chevronRight: "m9 5 7 7-7 7",
  panel: "M3 4h18v16H3z M15 4v16 M18 8v8",
  close: "M6 6l12 12 M18 6 6 18",
  pause: "M7 4h4v16H7z M13 4h4v16h-4z",
  play: "M6 4l14 8-14 8z",
  edit: "M4 20h4L18 10l-4-4L4 16z M14 4l4 4 M14.5 5.5l4 4",
  trash: "M5 7h14 M9 7V4h6v3 M7 7l1 13h8l1-13 M10 11v6 M14 11v6",
  fastForward: "M4 5l8 7-8 7z M13 5l8 7-8 7z",
  check: "M4 12l5 5L20 6",
} as const;

export function DashboardIcon({ name }: { name: keyof typeof ICON_PATHS }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
