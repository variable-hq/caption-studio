# ADR 0020: remove the deferred iOS shell

Date: 25 October 2026. Status: accepted, implemented in source. Supersedes the retention
clause of [ADR 0003](0003-defer-apple-distribution.md).

## Decision

ADR 0003 stopped Apple distribution but kept the `ios/` SwiftUI/`WKWebView` shell as
reversible research. Nothing in the web application, build, deployment or test chain uses
it, and its unsigned evidence predates the current backend, so the owner removed it while
tidying the repository:

- `ios/`, its five `ios:*` npm scripts and its `.gitignore` rules are deleted.
- The browser remains the only client; maintained guides no longer describe a native shell.
- The source stays recoverable from git history (last present at `adc82c5`).
- Building a native app again requires a new owner decision covering cost, publisher,
  signing, privacy, export compliance, testing and distribution.

## Tradeoffs and verification

- Reviving the shell means restoring it from history and revalidating it against the
  current dashboard; nothing is kept current in the meantime.
- Dated evidence (for example `VALIDATION_REPORT.md`) still mentions the iOS builds as
  history and is not edited.
- `npm run validate` passes without the folder.
