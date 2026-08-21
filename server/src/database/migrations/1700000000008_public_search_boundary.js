export const PUBLIC_SEARCH_BOUNDARY_SQL = `
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

    ALTER TABLE players ADD COLUMN IF NOT EXISTS public_id TEXT;
    UPDATE players
    SET public_id = 'public_player_' || SUBSTRING(MD5(id || ':' || club_id || ':' || RANDOM()::TEXT), 1, 24)
    WHERE public_id IS NULL;
    ALTER TABLE players
        ALTER COLUMN public_id SET DEFAULT ('public_player_' || SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT), 1, 24)),
        ALTER COLUMN public_id SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_players_public_id ON players(public_id);

    CREATE INDEX IF NOT EXISTS idx_public_clubs_name_trgm
        ON clubs USING GIN (name gin_trgm_ops)
        WHERE visibility = 'public' AND status = 'active' AND deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_public_clubs_federation_trgm
        ON clubs USING GIN (federation gin_trgm_ops)
        WHERE visibility = 'public' AND status = 'active' AND deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_active_players_club_name_trgm
        ON players USING GIN (name gin_trgm_ops)
        WHERE status = 'active' AND deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_matches_notes_trgm
        ON matches USING GIN (notes gin_trgm_ops)
        WHERE status <> 'deleted';
`;

export async function up(pgm) {
    pgm.sql(PUBLIC_SEARCH_BOUNDARY_SQL);
}

export async function down() {
    throw new Error('This public-search migration is intentionally irreversible.');
}
