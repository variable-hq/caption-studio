# ADR 0031: caption wait time as a cap with pause cuts

Date: 1 November 2026. Status: accepted, implemented in source.

## Decision

Each caption wait-time option is a promise about the longest a caption waits, not a fixed
timer:

| Option | Cap | Floor | Required pause |
| --- | --- | --- | --- |
| 6 seconds | 6s | 3s | 500ms |
| 10 seconds | 10s | 5s | 700ms |
| 14 seconds | 14s | 7s | 900ms |
| Dynamic | 14s | 4s | 700ms at the floor, decaying linearly to 200ms at the cap |

The browser samples the microphone RMS every 100ms through the existing policy module. An
option cuts at a pause once its floor has passed and always cuts at its cap. Dynamic keeps
using Live draft punctuation to confirm or hold a cut; the numbered options do not consult
drafts. Dynamic's required pause shrinks as the window grows so a continuous speaker still
gets a natural break before the cap.

All options count speech time per window from the same level samples. Once a service has
heard speech, a window with less than 300ms of speech is not sent unless its peak is not
well below earlier speech or a level sample failed. A skipped window uses no transcription,
translation or reserved attempt.

The per-service request ceiling follows the smallest floor instead of the six-second
minimum: 90 minutes divided by 3 seconds is 1,800 reserved attempts. After a provider
rate-limit or usage-limit response, every floor rises to at least six seconds for the rest
of the service and one status message reports it.

Stored values do not migrate. `recordingWindowMs` keeps accepting 6000, 10000, 14000 and
`"dynamic"`, and the default stays `"dynamic"`. A saved 6, 10 or 14 now cuts at pauses as
well as its cap, which is the intended change.

## Tradeoffs and verification

- Faster options raise the number of requests and the translation tokens carried per spoken
  word, because every call repeats the fixed instructions and context. Transcription
  audio-seconds stay about equal for the same speech, though a provider may meter a minimum
  duration per request. The back-off and silence gating bound the increase; the floors and
  the 1,800-attempt ceiling protect a service.
- Pre-roll is not used: it would only help a cut at the cap, recorder chunks cannot be
  spliced cleanly, and it risks duplicated words. Revisit only if testing shows clipped
  words at the cap that pause cuts do not avoid.
- `src/live/window-policy.ts` owns the cap, floor, pause and decay model, so it is
  deterministic to test; `window-policy.test.ts` covers each option, the floors, the cap,
  the decay, the back-off and the silence gate.
- The floors of 3, 5 and 7 seconds are final. The Dynamic floor of 4 seconds, the pause
  lengths and the decay are starting values to tune with synthetic speech, as ADR 0026's
  thresholds were.
- Manual verification is synthetic speech and pauses in Chrome and Safari: each option
  cuts at a pause after its floor and at its cap for continuous speech, a quiet speaker is
  never skipped, a silent stretch sends no windows or attempts, and a simulated rate-limit
  response raises the floors.

Extended by [ADR 0034](0034-dynamic-pause-adaptation.md): Dynamic measurement, the post-hold pause and retuned pause lengths.
