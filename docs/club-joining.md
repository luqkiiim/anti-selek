# Club joining

Signed-in active accounts can find clubs by name. Discovery returns clubs that are accepting join requests. Existing club invite links remain supported and go through the same entry and admission checks. Personal player invitations keep their direct invitation and redemption path.

A club may optionally require a shared join code. After entry is verified, the next step immediately asks whether the account holder has played with that club before. They can request to claim an unowned profile from that club's roster or request a new club-specific profile. For a new profile request, the sheet shows the account's canonical name and gender once as a read-only summary; those details cannot be edited in the joining flow. The admin creates a club-specific profile using those account details. Club profiles and match history stay separate across clubs; no sporting identity or history is reused from another club. Requests remain pending admin review until an admin links the selected roster profile or creates the new profile.

The request summary and full-width Send request action stay pinned in the sheet footer while the form fields scroll independently.

For a protected club, successful same-origin code verification through `/api/clubs/join-entry` issues a signed, HTTP-only, same-site cookie for 30 minutes. It is bound to the account, club, session version, and a fingerprint of the current code hash, so replacing the code invalidates earlier grants. The `/api/clubs/join-proof` endpoint remains a response-compatible adapter that issues the same new grant; old proof cookies cannot authorize admission. The code is stored only as a bcrypt hash; neither the cookie nor server storage contains the plaintext code. Removing protection lets players continue without a code, while admin approval remains required.

Club admins can set, replace, or remove the shared code in club settings. This uses the existing club protection fields, so no new schema migration is expected. Normal builds do not apply migrations; deployment, schema state, and runtime verification are separate operational checks.
