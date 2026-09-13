# Decision record: caption completion and multilingual word boundaries

Date: 12 September 2026. Status: implemented for controlled testing; operator bilingual and
church terminology review remains pending. Related findings: G01, G06, and G07 in the
[gap analysis](../GAP_ANALYSIS.md). This record covers bounded correctness changes
authorized with the next-step work, not language-quality approval. Current deployment
identity is in [Deployment](../DEPLOYMENT.md); the semantic/rehearsal limits below remain.

## One-time inference dispatch

The Worker verifies Access before a separate atomic claim for each transcription and
translation stage. Each stage may consume a reserved attempt once, within the existing
900-attempt ceiling. Reject inference-path aliases and unsupported `/_next/data/*` URLs
before OpenNext routing can bypass that boundary. A downstream rejection still consumes
its claim; do not retry the same attempt automatically.

Pause and confirmed refresh invalidate every earlier reservation, including after
Resume. Legacy state invalidates existing reservations because their dispatch history is
unknown. Fresh reservations preserve service usage and expiry. This conservative policy
can discard work that had not reached Groq, but prevents replay from spending outside the
current service state. These controls pass local checks; deployed enforcement remains
pending the [rehearsal prerequisites](../DEPLOYMENT_REHEARSAL_READINESS.md).

## Public word filtering

Use the target language's native `Intl.Segmenter` word boundaries for filter terms that
contain Han, Hiragana, or Katakana characters. A match must cover the exact configured
term and start and end at segment boundaries. Multiword terms may span consecutive
segments. This allows ordinary unspaced Chinese/Japanese text to match a complete term
without changing every filter to an arbitrary substring search.

Examples confirmed in local deterministic tests:

- `测试` in `这是测试内容` becomes `这是••内容`.
- `測試` in `這是測試內容` becomes `這是••內容`.
- `秘密` in `これは秘密です。` becomes `これは••です。`.
- `京都` does not match inside `東京都`.
- English `ass` does not match inside `classic`; Indonesian `biru` does not match inside
  `membiru`, but a separate `biru` is masked.

Other terms retain the existing case-insensitive Unicode whole-word policy. The existing
internal `matchInsideWords` opt-in remains explicit and unchanged; no new substring
control is added to the operator UI. Masking, replacement, and hide-segment rules share
the same boundaries. Public rules never rewrite protected source or the unmoderated
translated form. A browser missing native segmentation cannot publish an affected
caption; it receives an actionable browser-update error instead of silently relaxing
the filter.

Native word segmentation follows the
[ECMAScript Internationalization API](https://tc39.es/ecma402/#segmenter-objects).
Word boundaries depend on the runtime's language data. This is a conservative matching
policy, not an exhaustive safety filter. Inflections, homophones, unusual proper names,
mixed-script spellings, and terms split across different captions can remain unmatched.
There is no stemming, phonetic matching, translation of filter words, or cross-caption
retention. Review actual terms in the intended browser and each approved target language.
Do not treat passing the synthetic examples as Chinese/Japanese language certification.

## Provider output completion

Publishable provider output requires both a nonempty text string and a non-streaming
chat completion whose `finish_reason` is `stop`. Treat `length`, tool/function-call
reasons, unknown/missing reasons, empty content, and non-text content as incomplete.
Strip the unusable text immediately but retain sanitized token usage and provider
headroom for the protected Worker acknowledgement path.

Groq's [official SDK response contract](https://github.com/groq/groq-typescript/blob/main/src/resources/chat/completions.ts)
distinguishes normal stopping from reaching the token ceiling; its
[API reference](https://console.groq.com/docs/api-reference#chat-create) documents the
completion-token limit and usage response. Neither a `stop` reason nor a nonempty caption
proves semantic accuracy or theological correctness.

The Worker must acknowledge the completed provider work in service usage before returning
the structured `422 translation_incomplete` response. A missing or failed usage
acknowledgement takes precedence and stops capture through the existing fail-closed
usage path. The browser accounts acknowledged usage, skips public publication, and tells
the operator that the caption was skipped. Do not substitute source text, retry the same
claim, increase token limits automatically, or switch to a paid provider. If skipped
captions repeat, the operator must Pause to review the buffer/settings or End the service.

This completion policy does not finish incomplete speech. A faithfully translated source
fragment such as “if we...” may legitimately have provider finish reason `stop` and must
remain a fragment. The policy prevents known provider truncation from masquerading as a
complete result; it does not enforce a visual line count or remove content to fit OBS.
OBS density, line handling, speaker cues, and reading-time acceptance remain separate
rehearsal work.

## Evaluation evidence

The [30 Indonesian→English samples](id-en-synthetic.json) and
[bilingual review sheet](ID_EN_REVIEW.md) are preparation only. The user selected
the operator as reviewer. All semantic scores, reference and terminology approvals, audio
runs, and deployment results remain pending. Mocked provider
tests prove control handling and usage preservation, not model or church-language quality.
