# ADR 0037: Local QR for the phone viewer link

Date: 6 November 2026. Status: accepted; QR is an additional way to hand off the current session's phone viewer link.

## Decision

- The Live screen's Share card may reveal a QR code for the current phone viewer link after an operator requests it. Existing copy and preview actions remain available.
- Generate the QR in the operator's browser with `qrcode-generator` (MIT, version 2.0.4), using the same URL already shown and copied by the Share card. Do not send the URL to a QR service.
- Accept only a valid HTTP(S) URL whose path is `/view` and whose UTF-8 encoding is at most 300 bytes. Never encode an OBS URL or controller credential.
- Draw black modules on white as an inline SVG with a four-module quiet zone. Give the image an accessible label that does not include the URL.
- Keep visibility in component state associated with the current viewer URL. Hide the code when the URL changes or disappears, Live unmounts, or the operator chooses Hide. Do not store, download, print, or project it automatically.

## Tradeoffs and verification

- A QR is the same short-lived bearer credential as the copied link. It is visible only after an explicit action, so operators can keep it out of a broadcast by default; anyone who scans it can view the current moderated session captions.
- A local encoder adds browser bundle size, measured in the implementation PR. It adds no API, storage, token, network request, or provider call.
- Copying and opening the viewer link remain available to people who cannot scan a code. No permanent joining URL, short code, analytics, account, or additional settings surface is introduced.
- Automated tests verify accepted and rejected URL shapes and deterministic matrices; browser QA verifies reveal/hide, end, responsive layout, accessibility, and no network request. Real phone scanning and native-language copy review remain manual checks.
