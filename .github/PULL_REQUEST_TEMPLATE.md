## What changed

Describe the change in plain language.

## Why

Explain the user, operator, or contributor need.

## Validation

- [ ] Relevant automated checks pass (list each command and its result for the head commit)
- [ ] `npm audit --omit=dev` and full `npm audit` results are recorded separately
- [ ] Manual behavior was tested where appropriate
- [ ] Screenshots or recordings are attached for visible changes

## Risk review

Risk: critical, high, moderate, low or none (see CONTRIBUTING.md, "Pull requests").
From moderate up, say what could break, what it affects, and how it is contained.

- [ ] No credentials or private sermon data are included
- [ ] Recording and retention behavior is explicit
- [ ] Operator routes remain Cloudflare Access-protected
- [ ] OBS overlay access remains read-only, token-protected, explicitly rotatable, and long-lived
- [ ] Mobile-viewer access remains read-only, separately tokenized, service-scoped, and replaceable
- [ ] Reader access stays separate from private source/summary data; the paired remote grants no inference capability
- [ ] Seven-day opted-in content retention and independent rolling 30-day usage remain explicit
- [ ] Source-text context and AI-output risks, testing, and required human oversight are documented
- [ ] Failure and recovery behavior were considered

## Documentation

- [ ] Maintained documentation matches the implemented behavior; every maintained guide, including `README.md` and `SECURITY.md`, was searched for claims this change makes false
- [ ] Historical evidence remains clearly separated from current validation claims
- [ ] Deployment changes include the build, deploy dry run, and relevant Cloudflare result

## Follow-up

List anything intentionally left for another issue or pull request.
