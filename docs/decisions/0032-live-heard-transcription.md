# ADR 0032: Live Heard transcription in Dynamic mode

Date: 2 November 2026. Status: accepted, implemented in source.

## Decision

In Dynamic mode the controller's Heard pane now fills in as the speaker pauses. At the
first qualifying pause candidate the browser transcribes the window so far without
translating, and shows that source text as in-progress in Heard using the muted colour
token. Only the controlling tab sees it, there is no screen-reader announcement, and the
final's source text replaces it. Numbered wait options run no drafts.

If the draft ends in terminal punctuation it confirms the cut, and the final reuses the
draft's transcription instead of transcribing again: the same post-processing applies
(dropped segments, approved recognition variants and language detection) and only the
translation runs. If the draft ends mid-clause, recording continues through that silence as
before, the draft stays in Heard until replaced, and the final transcribes the whole window
normally.

Reuse requires the controller token, translation revision, session settings, Quick
overrides/Terms and Live note to be unchanged since the snapshot, and the same silence run.
Speech resuming, Pause, Clear, takeover, an aborted draft or a rejected provider request
each force a normal final. Attempt accounting is unchanged: the draft reserves and claims
transcription for its attempt, and a reused final claims translation for the same attempt
number, so a confirmed caption still counts as one attempt against the 1,800 ceiling. A
rate-limit, usage-limit or partial-audio rejection stops drafts for the rest of the
service silently; finals keep their pause-only cuts.

Live drafts stops being a user-visible feature. The switch, the saved
`liveDraftsEnabled` default, the separate preview block and the `live.drafts*` /
`liveDraft.*` strings are removed, and old stored values are ignored. This supersedes
[ADR 0027](0027-operator-only-live-drafts.md).

## Tradeoffs and verification

- Translation calls do not change. A confirming draft adds no transcription call and no
  audio-seconds, because it becomes the final. A mid-clause draft costs at most one extra
  transcription call and one extra pass over that window's audio, so the worst case is
  roughly 2x transcription and Dynamic's usual case is about 1x.
- Drafts still run only when the remaining attempt budget covers the finals still needed,
  so a service cannot starve captions for previews.
- `src/live/live-heard.ts` owns the display and reuse rules, so they are deterministic to
  test; `live-heard.test.ts` covers the draft/final precedence and every reuse condition.
  `caption-inference.test.ts` proves the transcription stage makes no translation call and
  that composing both stages matches the previous final path. `live-drafts.test.ts` covers
  the one-draft cap, attempt headroom and session guards.
- `src/live/window-policy.ts` keeps the existing terminal-punctuation confirmation and
  hold behavior. Fixed windows no longer schedule drafts.
- Manual verification remains synthetic speech in Chrome and Safari, Dynamic mode: Heard
  fills in at the first pause and is replaced by the final, a confirmed cut publishes with
  one transcription call in Settings › Usage, and an unfinished clause still cuts sensibly.
