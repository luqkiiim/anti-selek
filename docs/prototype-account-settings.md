# Account settings

The chooser and club header avatars open the shared account sheet. It loads `/api/user/me`, saves name/gender through PATCH, and uses the existing user avatar upload/delete routes. Photos can be cropped and changed repeatedly; saving refreshes the visible avatars and profile data.

Name and gender each have an independent, single self-service change. The backend reports edit eligibility, guards each update atomically with its unused timestamp, and rejects further edits. Existing accounts start with the new gender-change allowance unused; setting a previously unspecified gender consumes that allowance. Quick-access accounts cannot edit. No member genders are overridden in session setup; mixed sessions use their saved profiles, while guests retain session gender inputs.

Migration `20260913090000_add_self_gender_changed_at` was applied to local SQLite and production Turso. API tests cover edit limits and photo authorization; a mobile browser exercise verified profile save/locking, second-change rejection, crop/upload and header refresh with a temporary local account, then removed the test account and uploaded photo.
