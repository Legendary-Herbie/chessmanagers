export async function up(pgm) {
    pgm.sql(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
        UPDATE announcements announcement SET edited_at = changes.edited_at
        FROM (
            SELECT announcement_id, club_id, MAX(created_at) AS edited_at
            FROM announcement_audit_events
            WHERE event_type = 'announcement.updated' AND old_state->>'status' = 'published'
                AND (old_state->>'title' IS DISTINCT FROM new_state->>'title'
                    OR old_state->>'content_html' IS DISTINCT FROM new_state->>'content_html')
            GROUP BY announcement_id, club_id
        ) changes
        WHERE announcement.id = changes.announcement_id AND announcement.club_id = changes.club_id
            AND announcement.edited_at IS NULL;`);
}

export async function down(pgm) {
    pgm.dropColumns('announcements', ['edited_at']);
}
