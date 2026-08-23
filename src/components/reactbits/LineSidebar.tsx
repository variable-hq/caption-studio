"use client";

/**
 * Adapted from React Bits LineSidebar.
 * Copyright (c) 2026 David Haz.
 * Licensed under the MIT + Commons Clause License Condition v1.0.
 * See THIRD_PARTY_NOTICES.md and https://github.com/DavidHDev/react-bits.
 */

import { useRef, type KeyboardEvent, type ReactNode } from "react";

import "./LineSidebar.css";

export interface LineSidebarItem {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface LineSidebarProps {
  items: readonly LineSidebarItem[];
  activeId: string | null;
  onActiveChange?: (id: string, item: LineSidebarItem) => void;
  ariaLabel?: string;
  className?: string;
  showIndex?: boolean;
}

function classNames(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function LineSidebar({
  items,
  activeId,
  onActiveChange,
  ariaLabel = "Dashboard sections",
  className,
  showIndex = true,
}: LineSidebarProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusEnabledItem = (currentIndex: number, direction: 1 | -1) => {
    if (items.length < 2) return;

    for (let offset = 1; offset <= items.length; offset += 1) {
      const nextIndex =
        (currentIndex + direction * offset + items.length) % items.length;
      if (!items[nextIndex]?.disabled) {
        buttonRefs.current[nextIndex]?.focus();
        return;
      }
    }
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      focusEnabledItem(index, 1);
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      focusEnabledItem(index, -1);
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const direction = event.key === "Home" ? 1 : -1;
      const startingIndex = event.key === "Home" ? -1 : items.length;
      focusEnabledItem(startingIndex, direction);
    }
  };

  return (
    <nav
      className={classNames("rb-line-sidebar", className)}
      aria-label={ariaLabel}
    >
      <ol className="rb-line-sidebar__list">
        {items.map((item, index) => {
          const isActive = item.id === activeId;

          return (
            <li className="rb-line-sidebar__item" key={item.id}>
              <button
                ref={(element) => {
                  buttonRefs.current[index] = element;
                }}
                type="button"
                className="rb-line-sidebar__button"
                aria-current={isActive ? "step" : undefined}
                data-active={isActive ? "true" : "false"}
                disabled={item.disabled}
                onClick={() => onActiveChange?.(item.id, item)}
                onKeyDown={(event) => handleKeyDown(event, index)}
              >
                <span className="rb-line-sidebar__marker" aria-hidden="true" />
                {showIndex ? (
                  <span className="rb-line-sidebar__index" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                ) : null}
                <span className="rb-line-sidebar__copy">
                  <span className="rb-line-sidebar__label">{item.label}</span>
                  {item.description ? (
                    <span className="rb-line-sidebar__description">
                      {item.description}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
