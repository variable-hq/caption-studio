"use client";

import { useId, useState } from "react";

import { MAX_QUICK_BLOCK_TERM_CHARS, type QuickBlockEntry } from "@/live/quick-block";

interface QuickBlockControlProps {
  entries: readonly QuickBlockEntry[];
  onAdd: (term: string) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

/**
 * Emergency control: blocks a word from the public caption within one caption cycle,
 * bypassing the slower settings-refresh flow. See src/live/quick-block.ts for why.
 */
export function QuickBlockControl({
  entries,
  onAdd,
  onRemove,
  disabled = false,
}: QuickBlockControlProps) {
  const [term, setTerm] = useState("");
  const helpId = useId();

  return (
    <div className="quickBlockControl">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!term.trim()) return;
          onAdd(term);
          setTerm("");
        }}
      >
        <label>
          Quick block
          <input
            name="quickBlockTerm"
            autoComplete="off"
            value={term}
            maxLength={MAX_QUICK_BLOCK_TERM_CHARS}
            disabled={disabled}
            aria-describedby={helpId}
            placeholder="Word to block now…"
            onChange={(event) => setTerm(event.target.value)}
          />
        </label>
        <button className="primaryButton" type="submit" disabled={disabled || !term.trim()}>
          Block now
        </button>
      </form>
      <p className="privacyNote" id={helpId}>
        Hides the whole caption immediately if this word is said again, without a settings
        refresh. For ongoing masking or a milder response, use the public caption filter instead.
      </p>
      {entries.length > 0 && (
        <ul className="quickBlockList">
          {entries.map((entry) => (
            <li key={entry.id}>
              <span>{entry.term}</span>
              <button
                className="textButton"
                type="button"
                disabled={disabled}
                onClick={() => onRemove(entry.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
