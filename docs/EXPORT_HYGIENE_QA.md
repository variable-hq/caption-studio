# Export hygiene QA

14 September 2026. Source baseline: merged `cf8b8c0` (PR #32). This extends the
13 September [file and dependency audit](CLEANUP_DEPLOY_QA.md#file-and-dependency-audit),
which established file reachability but not export minimality.

## Method

Every `export` in non-test `src/**` and `custom-worker.ts` (187 statements) was checked
word-wise against `src/`, `scripts/` and `custom-worker.ts`, excluding tests and the
defining line, then re-checked with comments and strings stripped. Next.js route and
page entry points, the Worker default export and the Durable Object classes named in
`wrangler.jsonc` count as live. Six stylesheets (226 class selectors) were checked
against JSX. Knip was run as a cross-check; its unused-file report for
`open-next.config.ts` and the five QA scripts is a known false positive because OpenNext
and documented manual procedures load them.

## Changes

| Item | Disposition |
| --- | --- |
| `isValidTranslationSystemPrompt` in `src/ai/translation-prompt.ts` | Removed; no production caller. Its two assertions duplicated the `normalizeTranslationSystemPrompt` cases in `groq.test.ts` |
| `.moreMenu .dangerText` in `src/app/globals.css` | Removed; no element renders that class |
| `estimateNeurons`, translation-settings storage version, session identity, stored snapshot and change types | Kept, `export` dropped; each is used only inside its own module |
| `BorderGlowProps`, `LineSidebarProps`, `SpotlightCardProps` barrel re-exports | Removed from `src/components/reactbits/index.ts`; no consumer imports them. `LineSidebarItem` stays |
| `.env.example` | Added `CAPTION_LOCAL_AUTH_BYPASS`, which `src/live/api.ts` reads and which no template listed |
| `package.json` | Added `qa:tutorial`, `qa:operator`, `qa:experience` and `qa:runtime` wrappers for the existing scripts. `CAPTION_QA_ORIGIN` for the runtime script is now documented |
| `.gitignore` | Removed the inert `.supabase/` rule; nothing in the repository uses Supabase |

Retained: the seven exports that only tests consume (`MIN_SPEECH_BUFFER_MS`,
`readBoundedText`, `buildTranscriptionPrompt`, `buildTranslationMessages`,
`parseSummary`, `Namespace`, and the `UsageStatus` return type), the tracked XcodeGen
output, ADR 0001 as superseded history, and every dependency. No orphan source, style,
script, document or review asset was found.

## Validation

| Check | Result |
| --- | --- |
| `npm run validate` | Pass on Node 26.5.0: 217 tests in 19 files, strict TypeScript, ESLint, Next.js build, OpenNext build, deployment dry run and whitespace check |
| `npm audit --omit=dev` | Zero known vulnerabilities |
| Full `npm audit` | Zero known vulnerabilities |

No runtime behavior, route, public contract, dependency or UI changed. Browser and
runtime QA scripts were not rerun; the 13 September results in
[Service-panel QA](SERVICE_PANEL_UX_QA.md) remain the latest browser evidence.
