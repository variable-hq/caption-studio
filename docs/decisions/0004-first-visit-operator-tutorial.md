# First-visit operator tutorial

Date: 12 September 2026. Status: implemented and merged. Current deployment evidence
is in [Deployment](../DEPLOYMENT.md); the original local UI results remain dated evidence.

## Decision

Use a six-step native modal dialog to explain audio input, translation, separate-computer
OBS setup, audience sharing, and live controls. Provide Skip, Escape, Back/Next, direct
step selection, and an always-available **How to use** launcher in the navigation rail
and phone drawer. Phones use a labelled
native step selector; desktop uses a step list. Automatically open only
after channel loading settles and no active service is known. The tutorial teaches the
workflow without changing settings, requesting microphone access, or calling service APIs.

Remember dismissal in this browser using `church-live-caption:operator-tutorial:v1` with
the sole value `dismissed`. Write it on Skip, Escape, completion, or a section shortcut. This is authorized by
the requested first-visit behavior; no identity, tutorial history, captions, terminology,
or credentials are stored. Clearing site data resets it. Storage failure leaves the guide
usable but allows it to reappear on reload. Manual replay is always available.

Each step can close the guide and open its related dashboard panel. Focus moves to the
panel heading. This navigation performs no setup or service action. Reopening the guide
returns to the same topic while the page remains loaded; no progress history is persisted.
The audience step's shortcut always opens Live outputs, where the mobile viewer link
is shared.

## Tradeoffs and verification

The preference belongs to a browser profile rather than an individual operator. Another
operator on the same profile can use **How to use**; a different browser may show the
guide again. Native dialog behavior supplies modal interaction and keyboard handling
without a tour dependency. The guide does not assert successful setup or certification.

The [browser check](../../scripts/tutorial-qa.mjs) verifies all steps, responsive layout,
keyboard behavior, dismissal/replay, storage failure, active-service suppression,
unchanged language selections, and absence of audio/service-control requests. See the
[validation report](../VALIDATION_REPORT.md) for local results and remaining deployment gates.
