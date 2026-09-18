# Announcement publication and edits

- Each draft has a **Notify club members when published** choice, enabled by default. Publication sends notifications only when both this choice and the club's announcement notification setting are enabled. Repeating publication does not resend notifications.
- Saving an update without supplying the notification choice preserves its stored value.
- Published edits remain published and do not notify members again. Changes to the title, content, or attachments show an **Updated** timestamp in the feed and detail page. Saving unchanged content does not mark it edited. Original publication time is retained.
- The composer and detail uploader share the JPEG, PNG, WebP, and PDF limit of 5 MB per file. Server content validation remains authoritative.
- Views are unique per announcement and signed-in user. Their announcement and club must match at the database level, and counts use both IDs. Migration 21 removes incorrectly scoped legacy view rows before adding the constraint; valid views are retained. Migration 22 adds edit timestamps and backfills published content edits from audit records.
