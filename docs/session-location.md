# Session location and court labels

Session details contains a Location field with Geoapify suggestions. Choosing
a result fills the venue name and a Google Maps link to its coordinates. Hosts can also enter a
location manually and use Add map link for an unlisted venue or another map
provider. Editing the location clears its previous map link.

Court labels appear here during creation and when editing an existing session.
Each label is optional and limited to 24 characters; a blank label uses Court N.
Changing the setup court count changes the visible label inputs. Removed courts
are excluded when submitting. Details and label updates share one transaction,
the existing host permission check, and waiting/active session restrictions.
Omitting labels leaves existing labels alone. Inactive courts retain their data.
No database migration is needed: labels use the existing Court.label column.

## Geoapify setup

1. Create a free account at https://myprojects.geoapify.com/; no card is required.
2. Create an anti-selek project and open its API Keys section.
3. Add `GEOAPIFY_API_KEY` as a Vercel Secret for the environments that need
   location search. For local development, set it in the ignored `.env.local`.
   Keep this variable server-only; do not use a `NEXT_PUBLIC_` prefix.
4. Deploy after adding the variable. Existing deployments do not gain new values.

`POST /api/clubs/[id]/locations` accepts a search query. Only authenticated operators with active
access to that club (or global admins) can call Geoapify. Quick access is excluded.
Requests are limited to 40 per minute per account/source. Queries are debounced,
stale requests are aborted, and a selection uses its existing name and coordinates
without a second provider request. Results prefer Malaysia without excluding other
countries. Geoapify responses are not cached.
The browser receives names, addresses and the selected link, never the API key.
The suggestions include Geoapify and OpenStreetMap attribution. Google Maps links
do not use a paid Google API or require a Google API key.

If the key is absent or the provider fails, the field offers manual entry and a
map link. Live autocomplete verification requires a configured key; browser
fixtures exercise selection, editing, sharing and stale-response handling without
calling the external provider. The free plan allows 3,000 credits per day; each
autocomplete request uses one credit. This is a request allowance, not a count of
venues or sessions, because typing can issue multiple debounced requests.

Provider references:

- [Geoapify autocomplete](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/)
- [Geoapify free plan](https://www.geoapify.com/pricing/)
- [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
