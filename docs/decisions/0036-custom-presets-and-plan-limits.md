# ADR 0036: Custom presets and plan limits

Date: 4 November 2026. Status: accepted; it extends [ADR 0035](0035-workspace-presets.md) to a workspace's own presets and adds the plan limit that bounds how many there are.

## Decision

- A workspace's custom presets are `PresetDefinition`s with an id `custom:<uuid>`, validated by the same `normalizePreset()` as built-ins. They are stored once for the workspace in the `workspace:presets` record of the `OperatorPreferences` object (`src/experience/custom-presets.ts`), served by the `presets` route, and changed only through create, update, delete and import commands. The server assigns every new id.
- A custom preset carries names, terms, a description and starting defaults only. It has no transcription prefix, translation rule, summary framing or message overrides; `normalizePreset()` rejects those fields on a `custom:` id. Its summary focus and starter Terms are operator-set defaults, not model context: the summary focus is copied into the operator's summary settings when applied, and the server never reads them.
- An imported preset's summary focus and starter Terms are held (`modelTextAllowed: false`) until an operator allows them for that preset. A preset written in the editor is allowed from the start.
- A session started with a custom format takes its terms from the stored record at start (`readWorkspaceCustomPresets()` in `caption-room.ts`), never from request text, and keeps them in its snapshot. Deleting a preset never changes a session that used it. A format id that no longer resolves is General.
- Deviation from the plan, recorded here: the plan said the server resolves a custom preset's summary guidance from storage and tests that. It does not. A custom preset's summary focus is copied into the operator's summary settings when applied, and the summary request carries the operator's chosen focus like any other. The server never reads it, so no test asserts server-side resolution. Held imported text is enforced by the screens: `effectiveCustomPreset()` removes it from what they offer until allowed.
- A running session that names a custom format this tab does not hold triggers one reload of the workspace's presets per id. A saved transcript does not reload: its tag reads "Custom format" until the presets next load on this tab. A format that still does not resolve is shown as "Custom format" on Live, which reads its wording as General; the audience reader and viewer keep the session's own terms from its snapshot.
- The plan limit comes from one Worker variable, `WORKSPACE_PLAN`, through `presetLimits()` (`src/experience/entitlements.ts`): `free` allows no custom presets, and an unset or unknown plan allows 5. Built-in formats are never limited. The server enforces the limit on create and on import, from the variable, never from the request. A lowered limit blocks creation only; edits and deletes stay allowed.

## Tradeoffs and verification

- The record is one object shared by the workspace, so two operators saving at once are serialized by the object's transaction; each command is applied to the stored record, not to a copy the client sent.
- Keeping the server's model text limited to built-ins means a custom preset cannot add model instructions, at the cost of operators who want model context using the session's Live note or the summary focus default.
- A held import is shown and saved only after an explicit allowance, which costs one extra step on import; it keeps text from a file out of model requests until someone reads it.
- Verified by unit tests of the command rules, the route and the setup file, and by the operator browser suite at four widths (create, edit, delete, locked and full plans, chooser and Start bar lists).
