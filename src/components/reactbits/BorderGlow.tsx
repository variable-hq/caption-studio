"use client";

/**
 * Adapted from React Bits BorderGlow.
 * Copyright (c) 2026 David Haz.
 * Licensed under the MIT + Commons Clause License Condition v1.0.
 * See THIRD_PARTY_NOTICES.md and https://github.com/DavidHDev/react-bits.
 */

import type { ComponentPropsWithoutRef, CSSProperties } from "react";

import "./BorderGlow.css";

export interface BorderGlowProps extends ComponentPropsWithoutRef<"div"> {
  pending?: boolean;
  glowColor?: string;
  glowColorSecondary?: string;
}

type BorderGlowStyle = CSSProperties & {
  "--rb-border-glow-color": string;
  "--rb-border-glow-color-secondary": string;
};

export function BorderGlow({
  children,
  className,
  pending = false,
  glowColor = "rgba(17, 17, 17, 0.78)",
  glowColorSecondary = "rgba(95, 95, 91, 0.34)",
  style,
  "aria-busy": ariaBusy,
  ...props
}: BorderGlowProps) {
  return (
    <div
      {...props}
      className={["rb-border-glow", className].filter(Boolean).join(" ")}
      data-pending={pending ? "true" : "false"}
      aria-busy={ariaBusy ?? (pending ? true : undefined)}
      style={
        {
          ...style,
          "--rb-border-glow-color": glowColor,
          "--rb-border-glow-color-secondary": glowColorSecondary,
        } as BorderGlowStyle
      }
    >
      {children}
    </div>
  );
}
