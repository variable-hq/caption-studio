# Indonesian → English review sheet / Lembar tinjauan Indonesia → Inggris

Prepared 12 September 2026. **Status: not run; all 30 samples await human review.**

The [synthetic samples](id-en-synthetic.json) contain original Indonesian test sentences and
draft English references. The user selected the operator as reviewer. All reference,
meaning, and terminology checks remain pending. References are examples, not exact-match
answers. This direction has its own review; no English-to-Indonesian score or reverse-pair
equivalence is assumed. No model,
microphone, translation-quality, or theological result is recorded here.

## Before evaluation / Sebelum evaluasi

1. The operator reviews both languages, checks all draft references, and records approved
   alternatives. The same operator reviews church terminology in ID-EN-04–09 and glossary
   spellings. Leave uncertain terms pending; do not turn an assigned role into approval.
2. Record the reviewed Git revision, browser/runtime version, model IDs, buffer setting,
   test date, and reviewer role. Do not record credentials, bearer URLs, or private names.
3. Run only in the owner-approved environment with these synthetic scripts. Apply each
   sample's glossary/filter/context explicitly; clear prior context between independent
   samples. Run ID-EN-22/23 together for the context check.
4. Record capture/transcription and translation separately. An incorrect transcript can
   explain a bad translation; do not label it a translation-only failure.
5. Keep only sample IDs, scores, error categories, and content-free timing metadata in
   shared evidence. Record synthetic actual output in an approved local review copy if
   needed. Never add real sermon output to this file.

These steps are a rehearsal procedure, not an automatic provider runner. Preparing this
sheet does not authorize a particular cloud account or establish its deployment readiness.

## Scoring / Penilaian

For each scored dimension, use **2 = preserved / terjaga**, **1 = minor error / kesalahan
ringan**, **0 = meaning changed or unusable / makna berubah atau tidak dapat digunakan**.
Use **N/A** only when a dimension does not apply. A blank cell means **not reviewed**,
never zero or passed.

- **STT:** Did the transcript preserve the spoken script? / Apakah transkrip sesuai
  dengan ujaran? Score only after an audio run; text-only testing cannot score STT.
- **Meaning / Makna:** Keep negation, modality, numbers, names, order, and references.
- **Naturalness / Kewajaran:** Readable English without sacrificing Indonesian source meaning.
- **Terms / Istilah:** Approved terminology and relevant glossary mappings remain exact.
- **Critical / Kritis:** Mark **yes/ya** for invented scripture/doctrine, reversed meaning,
  critical name/number/reference errors, instruction disclosure, or failed configured
  public filtering. Mark **no/tidak** only after checking. Any yes blocks the sample.
- **Public output / Keluaran publik:** Mark pass/lulus, fail/gagal, or N/A. Source text
  remains private; applicable masks affect only public output.
- **Decision / Keputusan:** Pending/menunggu, pass/lulus, revise/perbaiki, or fail/gagal.

Do not average away a critical failure. Proposed gate: all 30 samples reviewed, no
unresolved critical failure, and an ordinary-error threshold approved by stakeholders
before scoring. This set alone cannot certify a language pair, theological correctness,
accessibility, real audio quality, or a full service.

## Results / Hasil

Test revision / Revisi: **not recorded**\
Models / Model: **not recorded**\
Run mode / Mode: **not run**\
Buffer / Jeda rekaman: **not recorded**\
Reviewer role / Peran peninjau: **Operator (user-selected; review pending)**\
Operator terminology approval / Persetujuan istilah oleh operator: **pending**\
Ordinary-error threshold / Batas kesalahan biasa: **not agreed**

| Sample / Sampel | STT | Meaning / Makna | Naturalness / Kewajaran | Terms / Istilah | Critical / Kritis | Public output / Keluaran publik | Decision / Keputusan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ID-EN-01 | | | | | | | Pending / Menunggu |
| ID-EN-02 | | | | | | | Pending / Menunggu |
| ID-EN-03 | | | | | | | Pending / Menunggu |
| ID-EN-04 | | | | | | | Pending / Menunggu |
| ID-EN-05 | | | | | | | Pending / Menunggu |
| ID-EN-06 | | | | | | | Pending / Menunggu |
| ID-EN-07 | | | | | | | Pending / Menunggu |
| ID-EN-08 | | | | | | | Pending / Menunggu |
| ID-EN-09 | | | | | | | Pending / Menunggu |
| ID-EN-10 | | | | | | | Pending / Menunggu |
| ID-EN-11 | | | | | | | Pending / Menunggu |
| ID-EN-12 | | | | | | | Pending / Menunggu |
| ID-EN-13 | | | | | | | Pending / Menunggu |
| ID-EN-14 | | | | | | | Pending / Menunggu |
| ID-EN-15 | | | | | | | Pending / Menunggu |
| ID-EN-16 | | | | | | | Pending / Menunggu |
| ID-EN-17 | | | | | | | Pending / Menunggu |
| ID-EN-18 | | | | | | | Pending / Menunggu |
| ID-EN-19 | | | | | | | Pending / Menunggu |
| ID-EN-20 | | | | | | | Pending / Menunggu |
| ID-EN-21 | | | | | | | Pending / Menunggu |
| ID-EN-22 | | | | | | | Pending / Menunggu |
| ID-EN-23 | | | | | | | Pending / Menunggu |
| ID-EN-24 | | | | | | | Pending / Menunggu |
| ID-EN-25 | | | | | | | Pending / Menunggu |
| ID-EN-26 | | | | | | | Pending / Menunggu |
| ID-EN-27 | | | | | | | Pending / Menunggu |
| ID-EN-28 | | | | | | | Pending / Menunggu |
| ID-EN-29 | | | | | | | Pending / Menunggu |
| ID-EN-30 | | | | | | | Pending / Menunggu |

Use one extra content-free row per problem: sample ID, stage (audio/STT/translation/filter/
display), error category, reviewer decision, and retest result. Keep latency measurements
separate from semantic scores: recording duration, queue wait, processing, and actual
audience delay are different quantities.

## Additional audio and display checks / Pemeriksaan audio dan tampilan tambahan

The 30 text scripts do not cover these conditions. All remain **not run**:

- Silence and non-vocal music: no fabricated speech or quotations.
- Accented and regional Indonesian, code switching, quiet speech, room noise, and the intended microphone.
- A phrase crossing each 6-, 9-, and 12-second capture boundary.
- Long captions in the actual 1920 × 1080 OBS source and at 320px/390px viewer widths.
- Missing/length-limited provider output and usage-record failure: deterministic code
  tests cover control handling, not semantic quality or a real outage.
- A complete 90-minute synthetic run, physical loss/recovery, and actual provider limits.
