"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { DashboardIcon } from "./DashboardNavigation";

/** One control surface: docked on wide screens, modal on smaller screens. */
export function ServicePanel({ open, onOpenChange, triggerRef, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    if (!dialog) return;
    const desktop = window.matchMedia("(min-width: 1280px)");
    const previousOverflow = document.body.style.overflow;
    if (desktop.matches) dialog.show();
    else {
      dialog.showModal();
      document.body.style.overflow = "hidden";
    }
    headingRef.current?.focus({ preventScroll: true });

    // Close at the dock/modal boundary rather than leaving an invisible modal behind.
    const onResize = () => onOpenChange(false);
    desktop.addEventListener("change", onResize);
    return () => {
      desktop.removeEventListener("change", onResize);
      const focusInside = dialog.contains(document.activeElement);
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (focusInside) trigger?.focus({ preventScroll: true });
    };
  }, [open, onOpenChange, triggerRef]);

  return (
    <dialog
      ref={dialogRef}
      id="service-panel"
      className="servicePanel"
      aria-labelledby="service-panel-heading"
      onCancel={(event) => { event.preventDefault(); onOpenChange(false); }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          onOpenChange(false);
        }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right ||
            event.clientY < box.top || event.clientY > box.bottom) onOpenChange(false);
      }}
    >
      <header className="servicePanelHeader">
        <div>
          <p className="eyebrow">Main channel</p>
          <h2 id="service-panel-heading" ref={headingRef} tabIndex={-1}>Service controls</h2>
        </div>
        <button type="button" className="secondaryButton" aria-label="Collapse service panel"
          onClick={() => onOpenChange(false)}><DashboardIcon name="close" /></button>
      </header>
      <div className="servicePanelBody">{children}</div>
    </dialog>
  );
}
