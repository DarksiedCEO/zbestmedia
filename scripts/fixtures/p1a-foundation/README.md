# P1-A foundation fixtures

The component fixture matrices are constructed from immutable literal identities by `scripts/test-p1a-foundation.mjs` and `scripts/test-p1a-foundation-mutations.mjs`. They are hermetic: no network, ambient Git repository, environment fallback, credential, or wall-clock input is used.

The frozen bootstrap verifier remains external at `7fce7ca8361f505d62f210b890ec13f2431431db`; it is deliberately absent from this sibling's ancestry and file inventory.
