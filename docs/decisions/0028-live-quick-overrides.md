# ADR 0028: live Quick overrides

Date: 30 October 2026. Status: accepted, implemented in source.

## Decision

Live › Quick fixes offers **Quick override** for four actions: hide a whole caption, fix a
spelling, always translate a word as a chosen value, or help the AI recognise a word. Up to
20 entries live only in the controlling tab's memory. They apply to captions whose
processing starts after the operator adds them; an in-flight caption keeps the rules it
started with. Entries are removable and remain active until removed, including across End
and the next service in the same tab.

Live entries stay outside `TranslationSessionSettings`, so they apply immediately without
**Apply now** and do not change its fingerprint. They precede saved Words for transcription
hints and filtering. For the same canonical spelling, variants are combined and a live
translation takes priority. **Keep in Words** appends the row to the editable Words draft;
the live entry remains active, while the saved row follows **Apply now** and **Save for
everyone**. The UI never accepts raw filter syntax; it compiles the four allowed actions
through the existing Words serializers.

## Tradeoffs and verification

- The list is capped at 20 rows and each value uses the existing 100-character Words bound.
  Duplicate rows with the same action and case-insensitive word replace one another; the
  four live actions exclude masking and arbitrary replacement. At capacity, adding is
  disabled until an entry is removed, so an active hide rule cannot be silently evicted.
- Live rules can affect a caption only after its processing starts, which keeps each
  in-flight inference internally consistent. Edited output-buffer captions use the live
  entries present when the edit is submitted.
- Live entries are not written to operator preferences or logged. Their compiled rules
  accompany the current caption's existing reader payload so the saved reader pass applies
  the same recognition and moderation rules.
- Pure tests cover bounds, deduplication, Unicode normalization, action validation,
  serialization, priority, removal, and the translation-settings fingerprint. Browser QA
  covers the live controls and Keep in Words flow at the required viewports. Synthetic
  speech checks remain a manual rehearsal gate.
