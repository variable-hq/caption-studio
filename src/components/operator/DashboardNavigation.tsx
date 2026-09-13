"use client";

import { useEffect, useRef, useState } from "react";
import { LineSidebar, type LineSidebarItem } from "@/components/reactbits";

const ICON_PATHS = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  audio: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8",
  translation: "M3 5h12 M9 2v3 M5 5c0 5 3 9 8 11 M13 5c0 5-4 10-10 12 M14 21l4-11 4 11 M15.5 17h5",
  appearance: "M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3.7 1.5 1.5 0 0 1 1-2.8h2a4 4 0 0 0 4-4C21 6 17 3 12 3z M7 10h.01 M10 7h.01 M15 7h.01 M7 15h.01",
  outputs: "M3 4h18v12H3z M12 16v4 M8 20h8 M8 8l-2 2 2 2 M16 8l2 2-2 2",
  history: "M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h5",
  usage: "M4 3v18h17 M8 17v-5 M13 17V7 M18 17v-8",
  prompt: "M8 4H4v4 M16 4h4v4 M4 16v4h4 M20 16v4h-4 M8 12h8 M12 8v8",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  close: "M6 6l12 12 M18 6 6 18",
} as const;

export function DashboardIcon({ name }: { name: keyof typeof ICON_PATHS }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

export function DashboardNavigation({ items, activeId, onSelect }: {
  items: readonly LineSidebarItem[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 981px)");
    const closeOnDesktop = () => {
      if (!desktop.matches || !dialogRef.current?.open) return;
      dialogRef.current.close();
      sidebarRef.current?.querySelector<HTMLAnchorElement>('[aria-current="page"]')?.focus();
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const contents = (
    <>
      <div className="dashboardBrand" translate="no">
        <span className="brandMark" aria-hidden="true">CC</span>
        <span>Church Live Caption<small>Operator workspace</small></span>
      </div>
      <div className="dashboardChannel">
        <span aria-hidden="true">M</span>
        <div><strong>Main channel</strong><small>Church workspace</small></div>
      </div>
      <LineSidebar
        items={items}
        activeId={activeId}
        ariaLabel="Main navigation"
        onActiveChange={(id) => {
          dialogRef.current?.close();
          onSelect(id);
        }}
      />
      <div className="dashboardNavFooter">
        <span className="dashboardPrivateDot" aria-hidden="true" />
        <div><strong>Private workspace</strong><p>Share audience links from Live outputs.</p></div>
      </div>
    </>
  );

  return (
    <>
      <aside ref={sidebarRef} className="dashboardSidebar" aria-label="Workspace">{contents}</aside>
      <button
        className="dashboardMenuButton secondaryButton"
        type="button"
        aria-label="Open navigation"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="dashboard-navigation"
        onClick={() => { dialogRef.current?.showModal(); setOpen(true); }}
      >
        <DashboardIcon name="menu" />
      </button>
      <dialog
        ref={dialogRef}
        id="dashboard-navigation"
        className="dashboardDrawer"
        aria-label="Workspace navigation"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const box = event.currentTarget.getBoundingClientRect();
          if (event.clientX < box.left || event.clientX > box.right ||
              event.clientY < box.top || event.clientY > box.bottom) {
            event.currentTarget.close();
          }
        }}
      >
        <button className="dashboardDrawerClose secondaryButton" type="button"
          aria-label="Close navigation" onClick={() => dialogRef.current?.close()}>
          <DashboardIcon name="close" />
        </button>
        {contents}
      </dialog>
    </>
  );
}
