export const MATCH_DISCOVERY_INDEXES_SQL = `
    CREATE INDEX IF NOT EXISTS idx_matches_discovery_created
        ON matches (club_id, created_at DESC, id)
        WHERE status <> 'deleted';
`;

export async function up(pgm) {
    pgm.sql(MATCH_DISCOVERY_INDEXES_SQL);
}

export async function down(pgm) {
    pgm.sql('DROP INDEX IF EXISTS idx_matches_discovery_created;');
}
