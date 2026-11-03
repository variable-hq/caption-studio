# ADR 0034: Dynamic pause measurement, tuning and adaptation

Date: 3 November 2026. Status: accepted for Phase 1 (measurement, replay harness, post-hold pause and retuning, landing in three PRs); Phase 2 (per-capture learning) is conditional and not yet decided.

## Context

Dynamic (ADR 0031) cuts a window at a pause once its 4 second floor has passed, and always at its 14 second cap. The required silence decays linearly from 700 ms at the floor to 200 ms at the cap (`requiredPauseMs`, `src/live/window-policy.ts`; `RECORDING_WINDOW_POLICIES.dynamic`, `src/live/contracts.ts`). Three findings shape this ADR.

- **One curve for every speaker.** A 450 ms sentence break qualifies only after about 9 seconds, while an 800 ms hesitation qualifies at the floor and relies on the draft to hold it.
- **The held-draft trap.** A pause candidate runs at most one draft per recorder window (`canDraft`, `MAX_DRAFTS_PER_CAPTION` in `src/live/live-drafts.ts`; the draft count resets in `beginWindow` in `src/live/use-live-drafts.ts`). After a draft is held at a hesitation, the next candidate in the same window has no draft and cuts on the pause alone at the decayed requirement, so a second hesitation of the same length can cut mid-clause.
- **No measurement.** Technical details (`liveScreen`, `src/app/page.tsx`) shows delay, filtered segments, dropped chunks and call counts, but nothing about how windows end or how long they wait. Cut pauses are also censored: a cut fires when silence reaches the threshold, so the silence seen at the cut equals the policy, not the speaker. Learning from cut pauses would learn the policy itself.

Transcript segments carry no timing, so sentence structure is observable only at a pause candidate, through the draft's terminal punctuation (`draftEndsWithTerminalPunctuation`). Whether that punctuation is reliable for short clips, and for Indonesian, is unverified and must be measured.

## Decision

Phase 1 changes Dynamic's pause timing in three steps. Each step is a separate change with its own evidence, and the numbered options are unaffected throughout.

### Measurement

- `src/live/cut-metrics.ts` counts, for each window sent for transcription, how it ended: `sentence` (a draft confirmed the pause), `pause` (a pause cut without a confirming draft) or `limit` (the cap). It also counts held drafts and keeps a histogram of window lengths in 100 ms bins from 0 to 14 seconds, 141 integers in total. The median and 90th percentile are read from the histogram, so they are exact to 100 ms with constant memory.
- Windows skipped by the speech gate are not counted. Numbered options report only `pause` and `limit`.
- The counters live in the controlling tab's live state, like `transcriptionRequests`. They are kept through Pause, Resume, Clear and Apply now, reset at session start and end, and are zero after a reload. They are never stored, sent or logged.
- Technical details shows five rows after "Audio chunks dropped": cuts at a sentence end, cuts at a pause, cuts at the wait limit, unfinished sentences held, and caption wait (typical and longest 10%).

### Replay harness

`src/live/dynamic-replay.ts` is imported only by tests. It builds labelled synthetic RMS traces at 100 ms (speech, sentence-end pauses and mid-clause pauses), runs them through the real `nextWindowDecision`, `dynamicPauseAction`, `requiredPauseMs` and `dynamicDraftResult`, and reports cut latency from each labelled sentence end, mid-sentence finals, held drafts and transcription and translation calls per minute. The draft is a mock driven by a punctuation error model whose error sequence is deterministic: the i-th candidate of a kind (from 0) is wrong when `floor((i + 1) × rate) > floor(i × rate)`. Later phases reuse the harness to compare changes on identical traces.

### Post-hold pause

After a Dynamic draft is held, the length of the held silence run is known once speech resumes. For the rest of that window, the required pause is at least that length plus 100 ms, capped at 1,500 ms (`withHeldPause`, `src/live/window-policy.ts`). It raises the pause values only, never the floor or cap. The cap still always cuts. Numbered options never hold, so they are unaffected, and the next window starts from the normal bounds. This closes the held-draft trap without an extra call and without state across windows.

### Retuning

After the measurement and post-hold pause have been checked on synthetic rehearsal recordings, Dynamic's `pauseMs` is chosen from {500, 600, 700, 800} and `pauseAtCapMs` from {200, 300}, with the floor and cap unchanged. The rule: on the replay traces and the rehearsal recordings, take the pair with the lowest median cut latency from a sentence end such that no trace has more mid-sentence finals than the current values (700, 200) and total calls per minute rise by at most 20%. Ties and no improvement keep the current values. The result is recorded here whether or not the constants change.

### Phase 2 (conditional)

Per-capture learning of each speaker's sentence pause is deferred. It proceeds only if the replay and rehearsal evidence after retuning shows a rhythm that no single pair of constants serves, and if imperfect punctuation is shown not to cause extra mid-clause cuts at the measured error rates. The go decision and its evidence will be appended here when it is made.

## Tradeoffs and verification

- **Measurement before tuning.** Cut-time data from one speaker is not enough to pick constants. The replay harness and the rehearsals on synthetic speech in Chrome and Safari, in English and Indonesian, provide the comparison. Rehearsal results are recorded as dated evidence, never in maintained guides.
- **Post-hold pause costs time.** Windows after a held draft may wait longer, at most to the cap. Calls stay level or fall slightly, because fewer windows end on a mid-clause pause.
- **Retuning is bounded.** The selection rule limits mid-sentence finals and the call-rate increase, and a tie keeps the current values, so a tuning change cannot trade a regression for a speed-up.
- **No new provider call.** Metrics and the harness add no call. Counters are numbers in the controlling tab's memory and appear in no request, log or stored record.
- **Manual checks.** Synthetic speech and pauses in Chrome and Safari confirm what the replay predicts: each cut row matches the labelled recording, and the held-draft case cuts later after the post-hold pause. Native-speaker review covers the five new Indonesian strings.
