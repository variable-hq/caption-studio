"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { LineSidebar, type LineSidebarItem } from "@/components/reactbits";
import {
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_KEY,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_STEP,
  normalizeSidebarWidth,
  readStoredSidebarWidth,
} from "@/live/theme";

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
  menu: "M4 6h16 M4 12h16 M4 18h16",
  chevronRight: "m9 5 7 7-7 7",
  panel: "M3 4h18v16H3z M15 4v16 M18 8v8",
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

const KEYBOARD_WIDTHS: Record<string, (width: number) => number> = {
  ArrowLeft: (width) => width - SIDEBAR_WIDTH_STEP,
  ArrowRight: (width) => width + SIDEBAR_WIDTH_STEP,
  Home: () => SIDEBAR_WIDTH_MIN,
  End: () => SIDEBAR_WIDTH_MAX,
};

function persistSidebarWidth(width: number) {
  try {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
  } catch {
    // Private mode or blocked storage: the width still applies for this visit.
  }
}

export function DashboardNavigation({ items, activeId, onSelect, tools, channelStatus, width: accountWidth = null, onWidthChange }: {
  items: readonly LineSidebarItem[];
  activeId: string;
  onSelect: (id: string) => void;
  /** Current state of the single reusable channel, shown on the card that opens Overview. */
  channelStatus?: string;
  /** Controls shown under the links in both the desktop rail and the phone drawer. */
  tools?: ReactNode;
  /** Width saved with the operator's account; when it changes it replaces the local width. */
  width?: number | null;
  /** Called whenever the desktop rail width (px) changes, including the cached value on mount. */
  onWidthChange?: (width: number) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const widthChangeRef = useRef(onWidthChange);
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(SIDEBAR_WIDTH_DEFAULT);
  const [resizing, setResizing] = useState(false);
  const [appliedAccountWidth, setAppliedAccountWidth] = useState(accountWidth);
  if (appliedAccountWidth !== accountWidth) {
    // Derived state: a newly loaded account width replaces the cached local width.
    setAppliedAccountWidth(accountWidth);
    if (accountWidth !== null) {
      const clamped = normalizeSidebarWidth(accountWidth);
      setWidth(clamped);
      persistSidebarWidth(clamped);
    }
  }

  useEffect(() => {
    widthChangeRef.current = onWidthChange;
  }, [onWidthChange]);

  useEffect(() => {
    const stored = readStoredSidebarWidth();
    if (stored === SIDEBAR_WIDTH_DEFAULT) return;
    const timeout = window.setTimeout(() => setWidth(stored), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const shell = sidebarRef.current?.closest<HTMLElement>(".dashboardShell");
    shell?.style.setProperty("--sidebar-width", `${width}px`);
    widthChangeRef.current?.(width);
  }, [width]);

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

  const commitWidth = (next: number) => {
    const clamped = normalizeSidebarWidth(next);
    setWidth(clamped);
    persistSidebarWidth(clamped);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const compute = KEYBOARD_WIDTHS[event.key];
    if (!compute) return;
    event.preventDefault();
    commitWidth(compute(width));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
    setResizing(true);
  };

  const dragWidth = (event: PointerEvent<HTMLDivElement>) =>
    drag.current ? normalizeSidebarWidth(drag.current.startWidth + event.clientX - drag.current.startX) : width;

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    setWidth(dragWidth(event));
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    const final = dragWidth(event);
    drag.current = null;
    setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    commitWidth(final);
  };

  const contents = (
    <>
      <div className="dashboardBrand" translate="no">
        <span className="brandMark" aria-hidden="true">CC</span>
        <span>Church Live Caption<small>Operator workspace</small></span>
      </div>
      <a
        className="dashboardChannel"
        href="#workspace=overview"
        aria-current={activeId === "overview" ? "page" : undefined}
        onClick={(event) => {
          event.preventDefault();
          dialogRef.current?.close();
          onSelect("overview");
        }}
      >
        <span aria-hidden="true">M</span>
        <div><strong>Main channel</strong><small>{channelStatus ?? "Reusable OBS channel"}</small></div>
      </a>
      <LineSidebar
        items={items}
        activeId={activeId}
        ariaLabel="Main navigation"
        onActiveChange={(id) => {
          dialogRef.current?.close();
          onSelect(id);
        }}
      />
      {tools ? (
        <div
          className="dashboardNavTools"
          onClick={(event) => {
            // A button chosen from the drawer (for example How to use) closes the drawer first.
            if ((event.target as HTMLElement).closest("button")) dialogRef.current?.close();
          }}
        >
          {tools}
        </div>
      ) : null}
      <div className="dashboardNavFooter">
        <span className="dashboardPrivateDot" aria-hidden="true" />
        <div><strong>Private workspace</strong><p>Share audience links from Live outputs.</p></div>
      </div>
    </>
  );

  return (
    <>
      <aside ref={sidebarRef} className="dashboardSidebar" aria-label="Workspace">{contents}</aside>
      <div
        className="dashboardResizeHandle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize navigation"
        aria-valuemin={SIDEBAR_WIDTH_MIN}
        aria-valuemax={SIDEBAR_WIDTH_MAX}
        aria-valuenow={width}
        tabIndex={0}
        data-resizing={resizing ? "true" : undefined}
        onKeyDown={handleKeyDown}
        onDoubleClick={() => commitWidth(SIDEBAR_WIDTH_DEFAULT)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      />
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
