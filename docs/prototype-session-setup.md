# Session setup

The prototype's single-club creation flow is implemented in `SessionSetup.tsx`. It uses the existing POST `/api/sessions` contract and creates a WAITING session; the host starts play separately.

The main page contains session name, court stepper (1–10), a compact roster summary, matchmaking styles, and the balance metric. A searchable sheet with an inline clear-search button selects members and adds guests with editable ratings (default 1000, range 0–5000). Explicit linked offline identities appear once; names are never used to merge members.

More options contains mixed pairing, Competitive/Social groups, crossover frequency, automatic queueing, respect for saved rest preferences. Group assignments and session gender overrides appear in the roster only when needed. Creation validates at least two participants, explicit genders for mixed play, and at least two participants per enabled group. The backend remains authoritative for permissions and validation.

Defaults: two courts, Balanced, club rating, open pairing, no members selected, and automatic queueing disabled. No database changes. Interclub invitation/representation remains a separate future frontend flow.

Validation: existing request/service suite (27 tests), production build, lint, and mobile browser exercise at 390px and 320px. The browser test creates an isolated local fixture session, verifies saved settings and WAITING state, and removes only its own session and guest afterwards.
