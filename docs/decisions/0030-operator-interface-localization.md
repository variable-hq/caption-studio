# ADR 0030: operator interface localization

Date: 30 October 2026. Status: accepted, Phases 1–4 implemented; Indonesian pending native review.

## Decision

Use a small, typed lookup in `src/i18n/` instead of an i18n library. The operator dashboard
is a client-heavy single page with no locale routing; its needs are two locales, named
interpolation, fallback, and small plural messages. English messages in `messages/en.ts`
are the source of truth. Indonesian overrides live in `messages/id.ts`; missing translations
fall back to English. Flat dot-separated keys are namespaced by component, and complete
sentences stay in a single message instead of being assembled from translated fragments.
Where a sentence surrounds an inline bold control label, the sentence is split around that
label so the message itself contains no markup.

The interface locale is distinct from source and target caption languages. `uiLocale` is a
personal `OperatorPreferences` field and is excluded from the church-wide setup. A saved
account value wins. When account preferences cannot be reached, a browser copy is used;
otherwise a null preference follows `navigator.languages`, preferring Indonesian when
listed and falling back to English. The selected locale updates `<html lang>`.

Localization proceeds in separate phases: Phase 1 provides the mechanism and migrates the
shell; Phase 2 migrates operator panels and their hook messages; Phase 3 migrates Help and
the phone remote; Phase 4 localizes public reader surfaces from the request's
`Accept-Language`, never operator preferences. The OBS overlay contains no text. The phone
remote does not load account preferences, so it uses that browser's saved interface-language
copy or its browser language, then English.

Out of scope are AI prompts and the immutable model envelope, server errors returned in API
JSON (unless a stable existing error code is available to map), ADRs and documentation,
and caption-language names in `LANGUAGE_OPTIONS`.

The current Indonesian copy is an implementation draft and remains **pending native
review**. Reviewers should use this terminology consistently:

| English | Indonesian draft | Use |
| --- | --- | --- |
| caption | caption | Published text shown to the audience |
| service | layanan | One live church session |
| Terms | Istilah | Settings section for names, terms, and filters |
| caption wait time | waktu tunggu caption | Recording window setting |
| Apply now | Terapkan sekarang | Apply drafted translation settings |
| Quick override | Quick override | Immediate live correction control |
| Caption controls | Kontrol caption | Live actions group |
| Check captions before they show | Periksa caption sebelum ditampilkan | Output buffer |
| Live | Live | Active operator view/session |
| This system | sistem ini | The local operator device |
| Capture system | sistem caption | The device that runs the dashboard and microphone |
| Operator view | Tampilan operator | Heard pane, visible to the operator only |
| Audience view | Tampilan audiens | Public caption pane |
| Transcripts | Transkrip | Saved service archive |

## Tradeoffs and verification

- A custom lookup avoids a runtime dependency and routing machinery, at the cost of
  maintaining interpolation and plural selection in a small local module.
- English is always available if a translation is missing. Automated tests compare
  translation keys and placeholder sets, reject empty messages, and exercise fallback,
  interpolation, plural rules and browser-locale normalization.
- Phase 1 localizes the shell and the Interface language setting; Phase 2 localizes the
  operator panels, page messages, and their hook and request fallbacks; Phase 3 localizes
  the Help screen and phone remote; Phase 4 localizes the public reader page and the
  Worker-rendered viewer document from `Accept-Language`. The JSX literal guard covers the
  operator components, the dashboard, the mobile page and the reader page; viewer-document
  copy lives in the same catalogs. Responsive Indonesian review is still required, and
  Indonesian copy and terminology require review by a native speaker before the locale is
  considered complete.
