"use client";

/**
 * Adapted from React Bits SpotlightCard.
 * Copyright (c) 2026 David Haz.
 * Licensed under the MIT + Commons Clause License Condition v1.0.
 * See THIRD_PARTY_NOTICES.md and https://github.com/DavidHDev/react-bits.
 */

import {
  useRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type PointerEvent,
} from "react";

import "./SpotlightCard.css";

export interface SpotlightCardProps
  extends ComponentPropsWithoutRef<"section"> {
  spotlightColor?: string;
  spotlightSize?: number;
}

type SpotlightStyle = CSSProperties & {
  "--rb-spotlight-color": string;
  "--rb-spotlight-size": string;
};

export function SpotlightCard({
  children,
  className,
  spotlightColor = "rgba(17, 17, 17, 0.08)",
  spotlightSize = 360,
  style,
  onPointerMove,
  ...props
}: SpotlightCardProps) {
  const cardRef = useRef<HTMLElement>(null);

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    onPointerMove?.(event);

    if (
      event.defaultPrevented ||
      event.pointerType === "touch" ||
      window.matchMedia(
        "(prefers-reduced-motion: reduce), (pointer: coarse)",
      ).matches
    ) {
      return;
    }

    const card = cardRef.current;
    if (!card) return;

    const bounds = card.getBoundingClientRect();
    card.style.setProperty("--rb-spotlight-x", `${event.clientX - bounds.left}px`);
    card.style.setProperty("--rb-spotlight-y", `${event.clientY - bounds.top}px`);
  };

  return (
    <section
      {...props}
      ref={cardRef}
      className={["rb-spotlight-card", className].filter(Boolean).join(" ")}
      style={
        {
          ...style,
          "--rb-spotlight-color": spotlightColor,
          "--rb-spotlight-size": `${spotlightSize}px`,
        } as SpotlightStyle
      }
      onPointerMove={handlePointerMove}
    >
      {children}
    </section>
  );
}
