# Club joining

Signed-in active accounts can find clubs by name. Discovery returns clubs that are accepting join requests. Existing club invite links remain supported and go through the same entry and admission checks. Personal player invitations keep their direct invitation and redemption path.

A club may optionally require a shared join code. After entry is verified, the next step immediately asks whether the account holder has played with that club before. They can request to claim an unowned profile from that club's roster or request a new club-specific profile. New profile details are prefilled from the account. Profiles and match history stay separate across clubs; no sporting identity or history is reused from another club. Requests remain pending admin review until an admin links the selected roster profile or creates the new profile.

For a protected club, successful same-origin code verification through `/api/clubs/join-entry` issues a signed, HTTP-only, same-site cookie for 30 minutes. It is bound to the account, club, session version, and a fingerprint of the current code hash, so replacing or removing the code invalidates earlier grants. The new joining flow uses this grant; the older `/api/clubs/join-proof` compatibility path is separate and does not grant entry to it. The code is stored only as a bcrypt hash; neither the cookie nor server storage contains the plaintext code.

Club admins can set, replace, or remove the shared code in club settings. This uses the existing club protection fields, so no new schema migration is expected. Production rollout is not yet complete and must be verified separately before it is described as complete.
