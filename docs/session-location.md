# Session location and court labels

Session details contains a Location field with Google Places suggestions. Choosing
a result fills the venue name and its Google Maps link. Hosts can also enter a
location manually and use Add map link for an unlisted venue or another map
provider. Editing the location clears its previous map link.

Court labels appear here during creation and when editing an existing session.
Each label is optional and limited to 24 characters; a blank label uses Court N.
Changing the setup court count changes the visible label inputs. Removed courts
are excluded when submitting. Details and label updates share one transaction,
the existing host permission check, and waiting/active session restrictions.
Omitting labels leaves existing labels alone. Inactive courts retain their data.
No database migration is needed: labels use the existing Court.label column.

## Google setup

1. Enable billing and **Places API (New)** in a Google Cloud project.
2. Create a server API key restricted to Places API (New).
3. Add `GOOGLE_MAPS_API_KEY` as a Vercel Secret for the environments that need
   location search. For local development, set it in the ignored `.env.local`.
   Keep this variable server-only; do not use a `NEXT_PUBLIC_` prefix.
4. Deploy after adding the variable. Existing deployments do not gain new values.

`POST /api/clubs/[id]/locations` accepts either a query or a selected place ID,
plus the autocomplete session token. Only authenticated operators with active
access to that club (or global admins) can call Google. Quick access is excluded.
Requests are limited to 40 per minute per account/source. Queries are debounced,
stale requests are aborted, and each selection ends its autocomplete billing
session with a minimal Place Details request. Google responses are not cached.
The browser receives names, addresses and the selected link, never the API key.

If the key is absent or the provider fails, the field offers manual entry and a
map link. Live autocomplete verification requires a configured key; browser
fixtures exercise selection, editing, sharing and stale-response handling without
calling the paid provider.

Provider references:

- [Autocomplete (New)](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete)
- [Place Details (New)](https://developers.google.com/maps/documentation/places/web-service/place-details)
- [Usage and billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)
