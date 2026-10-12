# Club joining

Signed-in active accounts can find clubs by name. Discovery returns clubs that are accepting join requests. Existing club invite links remain supported and go through the same entry and admission checks. Personal player invitations keep their direct invitation and redemption path.

A club may optionally require a shared join code. After entry is verified, the next step immediately asks whether the account holder has played with that club before. They can request to claim an unowned profile from that club's roster or request a new club-specific profile. New profile details are prefilled from the account. Profiles and match history stay separate across clubs; no sporting identity or history is reused from another club. Requests remain pending admin review until an admin links the selected roster profile or creates the new profile.

For a protected club, successful same-origin code verification through `/api/clubs/join-entry` issues a signed, HTTP-only, same-site cookie for 30 minutes. It is bound to the account, club, session version, and a fingerprint of the current code hash, so replacing the code invalidates earlier grants. The `/api/clubs/join-proof` endpoint remains a response-compatible adapter that issues the same new grant; old proof cookies cannot authorize admission. The code is stored only as a bcrypt hash; neither the cookie nor server storage contains the plaintext code. Removing protection lets players continue without a code, while admin approval remains required.

Club admins can set, replace, or remove the shared code in club settings. This uses the existing club protection fields, so no new schema migration is expected. Production rollout is not yet complete and must be verified separately before it is described as complete.
