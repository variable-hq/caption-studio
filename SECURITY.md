# Security policy

## Reporting a vulnerability

Do not open a public GitHub issue for vulnerabilities or exposed credentials.

Until a private reporting channel is configured, contact the repository owner directly through an agreed private channel and include only the minimum information needed to reproduce the problem. Do not include real sermon recordings, transcripts, member details, or secrets.

## Sensitive data

Treat the following as sensitive:

- API keys and access tokens
- overlay session tokens
- raw or processed audio
- sermon transcripts and summaries
- church-member identities and roles
- unpublished service details
- glossary entries that reveal private names
- audit and usage records

## Development rules

- Keep all provider secrets on the server.
- Protect deployed inference routes with Cloudflare Access and verify its signed JWT.
- Fail closed when the Access audience or team domain is missing.
- Store local secrets only in ignored environment files.
- Use synthetic or approved test data.
- Apply least-privilege access and workspace isolation.
- Make overlay credentials short-lived and revocable.
- Avoid raw transcript text in operational logs.
- Review dependencies and deployment settings before production use.
- Rotate any credential immediately if it is exposed.

## Supported versions

The project is pre-release. Security fixes will be made on the current main branch.
