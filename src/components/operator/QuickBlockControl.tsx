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
          Hide any caption containing a word
          <input
            name="quickBlockTerm"
            autoComplete="off"
            value={term}
            maxLength={MAX_QUICK_BLOCK_TERM_CHARS}
            disabled={disabled}
            aria-describedby={helpId}
            placeholder="e.g. a name that shouldn’t appear…"
            onChange={(event) => setTerm(event.target.value)}
          />
        </label>
        <button className="primaryButton" type="submit" disabled={disabled || !term.trim()}>
          Hide captions with it
        </button>
      </form>
      <p className="privacyNote" id={helpId}>
        Hides the whole caption straight away whenever this word is said. To hide only the
        word, add it under Settings › Words.
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
