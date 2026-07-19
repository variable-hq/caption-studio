# Validation report — 20 July 2026

## Decision

The prototype is ready for a controlled stakeholder test using synthetic or explicitly
approved audio. It is not approved for an unattended live service or production rollout.

## Scope and environment

The production Worker at <https://church-live-caption.lukas-ka.workers.dev/> was tested
through its deployed UI and public OBS overlay paths on 20 July 2026. The test exercised
English source to Indonesian output with virtual synthetic audio. The exact deployed Git
revision could not be independently read from Cloudflare during this check, so this
report does not claim revision provenance.

## Live smoke-test results

| Check | Result | Evidence or qualification |
| --- | --- | --- |
| Cloud readiness | Pass | Dashboard reported Cloud AI configured. |
| Session creation | Pass | A new authenticated 90-minute session was created. |
| Audio-to-caption loop | Pass | 47 public captions were produced in 3m 12s with 0 skipped chunks. |
| Translation path | Pass | English source reached Indonesian public output. |
| Biblical prompting | Observed only | Biblical terms appeared, but virtual input quality was unsuitable for acceptance scoring. |
| Processing latency | Observed | Dashboard values were approximately 550–890 ms after each four-second chunk. |
| Style propagation | Pass | 72px serif, right/top alignment, and fully transparent highlight reached the overlay. |
| Reconnect/state restore | Pass | Reload restored the latest public caption and current style. |
| Session revocation | Pass | Ending cleared the room and made the prior URL unusable after retry handling. |
| Dashboard/API Access | Pass | Unauthenticated dashboard and protected POST routes redirected to Access. |
| OBS route boundary | Pass | Overlay document remained public; malformed session request returned 400. |
| Browser errors | Pass | No page console errors were observed in the exercised flow. |

Only the latest moderated public caption was exposed to the overlay. The source preview
remained in the operator UI. No production configuration was changed by the test.

## Code and build QA

The stakeholder-readiness branch adds deterministic audio-device selection tests and
clarifies the processing-latency metric. Final QA on 20 July 2026 produced:

| Gate | Result |
| --- | --- |
| Unit tests | Pass — 7 files, 26 tests |
| TypeScript | Pass, including unused local/parameter checks |
| ESLint | Pass |
| Next.js production build | Pass |
| OpenNext Cloudflare bundle | Pass |
| Local preview smoke | Pass — dashboard 200, overlay 200, malformed overlay session 400 |
| Dependency audit | Pass — 0 known vulnerabilities |
| Whitespace/error diff check | Pass |

The local preview emits the documented warning that the internal Durable Object cannot
run in the same local Worker configuration. Durable Object behavior was therefore
validated against the deployed environment, not the local preview.

## Not validated

- quality for every supported source/target language, accent, or Chinese script;
- theological correctness or representative biblical-name/reference accuracy;
- a complete 90-minute wall-clock session or session-expiry alarm;
- the intended physical microphone/audio interface and actual OBS streaming computer;
- device loss, long network loss, Access expiry, Groq quota/model outage, or Worker
  exhaustion;
- account-wide Cloudflare/Groq usage under concurrent applications; or
- archives and AI summaries, which are not implemented.

Follow [the stakeholder test guide](STAKEHOLDER_TEST_GUIDE.md) for the next controlled
test. A pilot go/no-go decision still needs owner-approved accuracy, latency, recovery,
privacy, and Free-plan thresholds.
