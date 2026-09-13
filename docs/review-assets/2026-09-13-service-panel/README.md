# Service-panel review assets — 13 September 2026

Synthetic browser QA for [issue #31](https://github.com/lukaskawira/church-live-caption/issues/31),
using the local production Next build with mocked APIs and a fake microphone. Screenshots
contain synthetic captions only; active production links and private sermon material are
not used. These replace the earlier dashboard layout as the current UI candidate.

| Screenshot | View |
| --- | --- |
| [Collapsed desktop](overview-desktop.png) | 1920px overview with service controls closed |
| [Expanded desktop](panel-desktop.png) | 1920 × 1080, service controls docked on the right |
| [Collapsed mobile](overview-mobile.png) | 320px overview without repeated Start or preview |
| [Expanded mobile](panel-mobile.png) | 320 × 844, modal service drawer |
| [Paused mobile](paused-mobile.png) | 390px, quick controls and grouped output destinations |
| [Appearance desktop](appearance-desktop.png) | 1920px, output preview remains beside the editor |

[Operator results](operator-results.json), [tutorial results](tutorial-results.json) and
[experience results](experience-results.json) record the final browser checks.
The [design and QA record](../../SERVICE_PANEL_UX_QA.md) covers validation and limitations.
