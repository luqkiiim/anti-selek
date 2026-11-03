# Session location and court labels

Session details contains a manual Location field and an optional Map link.
Hosts can enter any venue name and paste a link from their preferred map provider.
Both fields are saved and included in the session message. Location entry does
not use an external service or require an API key.

Court labels appear here during creation and when editing an existing session.
Each label is optional and limited to 24 characters; a blank label uses Court N.
Changing the setup court count changes the visible label inputs. Removed courts
are excluded when submitting. Details and label updates share one transaction,
the existing host permission check, and waiting/active session restrictions.
Omitting labels leaves existing labels alone. Inactive courts retain their data.
No database migration is needed: labels use the existing Court.label column.
