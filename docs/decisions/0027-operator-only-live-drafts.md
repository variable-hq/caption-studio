# ADR 0027: operator-only live drafts

Date: 29 October 2026. Status: accepted, implemented in source.

## Decision

**Live drafts** optionally re-transcribe and re-translate the audio already captured in the
current recording window. They are disabled by default, saved in the shared church setup,
and apply immediately without Apply now. They appear only in the controlling operator tab
as an in-progress preview. A newer draft replaces the previous one.

Each draft uses the existing protected inference routes and reserves one ordinary attempt
for transcription and, when needed, one for translation. At most two drafts are allowed
per caption, each needs at least 3 seconds of new audio, and drafts are admitted only when
they cannot consume attempts needed for remaining final captions. This can use up to three
transcription and three translation calls per final caption, and roughly twice the
audio-seconds; the control warns that drafts use more free-tier quota. No server claim or
service ceiling is raised.

The browser re-transcribes the current recording rather than streaming ASR. This reuses the
existing MediaRecorder chunks and provider path without introducing a second transport or
changing the final-output contract. Drafts never enter history, recent translation context,
the output buffer, publication, OBS, or viewer state. Final captions still pass through the
existing end-of-window path. In Dynamic mode, drafts are requested at qualifying pause
candidates rather than fixed offsets. A draft ending in terminal punctuation confirms the
cut; an unfinished clause keeps recording until another pause or the 14-second limit.
When a draft is off or unavailable, Dynamic uses its pause-only cut. This adds no language-
model call.

## Tradeoffs and verification

- Fixed windows schedule at most two drafts: none for 6s, one at 4s for 10s, and two at 4s
  and 8s for 14s. Dynamic schedules at pause candidates, with the same two-draft cap and
  existing future-final attempt admission.
- Drafts are disabled for the rest of a window after any failure, and a provider rejection
  of partial audio disables them for the session with one concise operator message. A
  window-end abort must never delay its final caption.
- Verify synthetic speech with a 14s window, slow provider responses, Pause, quota use,
  viewer/OBS isolation, archive isolation, and partial-audio provider acceptance.

This records the decision to spend bounded additional free-tier quota on a more responsive
operator preview. It extends the quota constraint in [ADR 0002](0002-free-cloud-first-ai.md)
without changing its attempt ceiling, and composes with client-side output pacing
([ADR 0016](0016-client-side-output-buffer.md)) and immutable inference parameters
([ADR 0018](0018-inference-level-as-server-envelope-parameter.md)).
