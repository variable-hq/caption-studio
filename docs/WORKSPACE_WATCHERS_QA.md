# Workspace watchers QA

20 September 2026, branch `feat/workspace-watchers`, based on `00d7627`. Local checks
only. This record is written for the next agent or reviewer: it states what was
verified, how, and what was not. It is not a production, semantic-quality or
accessibility certificate. No Cloudflare Access tenant, physical phone, OBS instance or
provider key was available, so every check ran against the local Workers runtime with
`CAPTION_LOCAL_AUTH_BYPASS=true`.

## Scope

The branch lets the four operators of one Access workspace follow one live service
without a takeover:

- `POST /api/live/channel/observer` issues one read-only caption-stream credential per
  hashed Access identity;
- the operator dashboard mirrors the running service's public caption, and its source
  transcript when that service saves history;
- `…/experience/pair` needs Access but not the controller, so each operator can pair a
  phone for the same service;
- service start records the starting operator's Access email, and the rail names it.

## Method

| Layer | Command | Result |
| --- | --- | --- |
| Unit, type, lint, build | `npm test`, `npm run typecheck:strict`, `npm run lint`, `npm run build`, `npm run build:cloudflare`, `npm run deploy:check` | 287 tests pass; all clean |
| Worker runtime | `wrangler dev` on the built worker, driven by a Node script over HTTP and WebSocket | 18/18 checks pass |
| Browser | Headless Chromium 1243 through Playwright 1.56, 1440 × 900 | 9/9 checks pass, plus the controller-label check |

The local-auth bypass gives every request the identity `local`, so the runtime pass
proves one identity's credential lifecycle, not four. Per-identity separation, eviction
at nine identities and the 8-credential ceiling are covered by unit tests in
`src/live/caption-room.test.ts` and `src/experience/experience.test.ts` instead.

## What the runtime pass verified

- an idle channel refuses watcher registration with `410 service_inactive`;
- a running service issues a watcher token to an operator holding no controller token,
  and re-registering the same identity replaces that identity's token rather than adding
  one;
- the watcher credential opens `/api/live/viewer`, receives `ready` and then the caption
  the controller published, and carries no source, controller or provider data;
- an unregistered token and a replaced token are both refused;
- replacing the audience link leaves the watcher connected; End closes it and stops
  further registration;
- a watcher pairs its own phone and pauses the service with it, and the pause appears in
  every operator's channel view.

## What the browser pass verified

- the output monitor shows "Live from another operator", then the published caption;
- the status line reads "Watching the service another operator is running" and says when
  a service does not save history;
- the reader-and-phone panel is offered to a watcher with **Pair operator phone**
  enabled;
- the watcher is offered **Take over channel**, never **Start captions**, and takeover
  still needs its second confirmation;
- a controller-side Pause reaches the watcher as "Paused by another operator";
- no uncaught page errors;
- with an injected `controllerLabel` (Access supplies it in production) the rail reads
  "<operator> is running this service".

## Not verified

- Cloudflare Access with four real identities, including the eviction of a ninth;
- physical phones, OBS, Safari, screen readers and the deployed environment;
- watcher source tailing against a service that actually saves history, which needs
  provider keys to produce recognized source;
- semantic caption quality, which this branch does not touch.

## Behaviour changed outside the new feature

Pairing no longer clears the remote-command history; Start does. Remote command IDs and
their 1,400 ceiling are now scoped to one service instead of one pairing, so two paired
phones cannot invalidate each other's dedupe record. One command may still be pending at
a time across all paired phones.
