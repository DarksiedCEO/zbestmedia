# Brand Events Contracts

## Versioning Policy

Event payload schemas use SemVer.

- **Minor (safe):** additive fields only, optional only, no enum narrowing.
- **Major (breaking):** removing fields, making optionalrequired, enum narrowing, or type changes.

**Rule:** services may accept older minor versions, but must emit the current version.
