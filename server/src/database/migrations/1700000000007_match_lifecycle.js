export const MATCH_LIFECYCLE_SQL = `
    ALTER TABLE tournaments
        ADD COLUMN IF NOT EXISTS rating_category TEXT,
        ADD COLUMN IF NOT EXISTS is_rated BOOLEAN;

    UPDATE tournaments tournament
    SET rating_category = COALESCE(
            CASE WHEN LOWER(tournament.settings_json->>'ratingCategory') IN ('blitz', 'rapid', 'classical')
                THEN LOWER(tournament.settings_json->>'ratingCategory') END,
            (SELECT match.time_control FROM matches match
             WHERE match.tournament_id = tournament.id
             ORDER BY match.played_at, match.id LIMIT 1),
            'blitz'
        ),
        is_rated = COALESCE(
            CASE WHEN tournament.settings_json ? 'rated'
                THEN (tournament.settings_json->>'rated')::BOOLEAN END,
            TRUE
        )
    WHERE rating_category IS NULL OR is_rated IS NULL;

    ALTER TABLE tournaments
        ALTER COLUMN rating_category SET DEFAULT 'blitz',
        ALTER COLUMN rating_category SET NOT NULL,
        ALTER COLUMN is_rated SET DEFAULT TRUE,
        ALTER COLUMN is_rated SET NOT NULL;

    ALTER TABLE matches
        ADD COLUMN IF NOT EXISTS rating_category TEXT,
        ADD COLUMN IF NOT EXISTS is_rated BOOLEAN,
        ADD COLUMN IF NOT EXISTS status TEXT,
        ADD COLUMN IF NOT EXISTS void_reason TEXT,
        ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS voided_by TEXT,
        ADD COLUMN IF NOT EXISTS delete_reason TEXT,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS deleted_by TEXT;

    UPDATE matches
    SET rating_category = COALESCE(rating_category, time_control),
        is_rated = COALESCE(is_rated, type IN ('rated', 'tournament')),
        status = COALESCE(status, 'active')
    WHERE rating_category IS NULL OR is_rated IS NULL OR status IS NULL;

    ALTER TABLE matches
        ALTER COLUMN rating_category SET DEFAULT 'blitz',
        ALTER COLUMN rating_category SET NOT NULL,
        ALTER COLUMN is_rated SET DEFAULT FALSE,
        ALTER COLUMN is_rated SET NOT NULL,
        ALTER COLUMN status SET DEFAULT 'active',
        ALTER COLUMN status SET NOT NULL,
        ALTER COLUMN played_at DROP DEFAULT;

    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tournament_rating_category' AND conrelid = 'tournaments'::regclass) THEN
            ALTER TABLE tournaments ADD CONSTRAINT chk_tournament_rating_category
                CHECK (rating_category IN ('blitz', 'rapid', 'classical'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_match_rating_category' AND conrelid = 'matches'::regclass) THEN
            ALTER TABLE matches ADD CONSTRAINT chk_match_rating_category
                CHECK (rating_category IN ('blitz', 'rapid', 'classical'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_match_lifecycle_status' AND conrelid = 'matches'::regclass) THEN
            ALTER TABLE matches ADD CONSTRAINT chk_match_lifecycle_status
                CHECK (status IN ('active', 'voided', 'deleted'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_match_void_metadata' AND conrelid = 'matches'::regclass) THEN
            ALTER TABLE matches ADD CONSTRAINT chk_match_void_metadata CHECK (
                status <> 'voided' OR (void_reason IS NOT NULL AND voided_at IS NOT NULL AND voided_by IS NOT NULL)
            );
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_match_delete_metadata' AND conrelid = 'matches'::regclass) THEN
            ALTER TABLE matches ADD CONSTRAINT chk_match_delete_metadata CHECK (
                status <> 'deleted' OR (deleted_at IS NOT NULL AND deleted_by IS NOT NULL)
            );
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_matches_voided_by' AND conrelid = 'matches'::regclass) THEN
            ALTER TABLE matches ADD CONSTRAINT fk_matches_voided_by
                FOREIGN KEY (voided_by) REFERENCES users(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_matches_deleted_by' AND conrelid = 'matches'::regclass) THEN
            ALTER TABLE matches ADD CONSTRAINT fk_matches_deleted_by
                FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE RESTRICT;
        END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS match_audit_events (
        id TEXT PRIMARY KEY DEFAULT ('mae_' || md5(random()::text || clock_timestamp()::text)),
        club_id TEXT NOT NULL,
        match_id TEXT NOT NULL,
        actor_user_id TEXT,
        event_type TEXT NOT NULL,
        reason TEXT,
        old_state JSONB,
        new_state JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_match_audit_event_type CHECK (event_type IN ('match.created', 'match.updated', 'match.voided', 'match.deleted')),
        CONSTRAINT fk_match_audit_club FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE RESTRICT,
        CONSTRAINT fk_match_audit_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE RESTRICT,
        CONSTRAINT fk_match_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
    );

    CREATE OR REPLACE FUNCTION refresh_player_match_stats(target_player_id TEXT)
    RETURNS VOID AS $$
    BEGIN
        UPDATE players player
        SET games = stats.games,
            wins = stats.wins,
            draws = stats.draws,
            losses = stats.losses,
            last_played = stats.last_played,
            updated_at = NOW()
        FROM (
            SELECT
                COUNT(*)::INTEGER AS games,
                COUNT(*) FILTER (WHERE
                    (match.white_player_id = target_player_id AND match.result = 'white') OR
                    (match.black_player_id = target_player_id AND match.result = 'black')
                )::INTEGER AS wins,
                COUNT(*) FILTER (WHERE match.result = 'draw')::INTEGER AS draws,
                COUNT(*) FILTER (WHERE
                    (match.white_player_id = target_player_id AND match.result = 'black') OR
                    (match.black_player_id = target_player_id AND match.result = 'white')
                )::INTEGER AS losses,
                MAX(match.played_at) AS last_played
            FROM matches match
            WHERE match.status = 'active'
              AND (match.white_player_id = target_player_id OR match.black_player_id = target_player_id)
        ) stats
        WHERE player.id = target_player_id;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION update_player_stats_on_match()
    RETURNS TRIGGER AS $$
    BEGIN
        IF TG_OP IN ('UPDATE', 'DELETE') THEN
            PERFORM refresh_player_match_stats(OLD.white_player_id);
            PERFORM refresh_player_match_stats(OLD.black_player_id);
        END IF;
        IF TG_OP IN ('INSERT', 'UPDATE') THEN
            PERFORM refresh_player_match_stats(NEW.white_player_id);
            PERFORM refresh_player_match_stats(NEW.black_player_id);
        END IF;
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END;
    $$ LANGUAGE plpgsql;

    UPDATE players player
    SET games = stats.games,
        wins = stats.wins,
        draws = stats.draws,
        losses = stats.losses,
        last_played = stats.last_played
    FROM (
        SELECT player_row.id,
               COUNT(match.id)::INTEGER AS games,
               COUNT(match.id) FILTER (WHERE
                   (match.white_player_id = player_row.id AND match.result = 'white') OR
                   (match.black_player_id = player_row.id AND match.result = 'black')
               )::INTEGER AS wins,
               COUNT(match.id) FILTER (WHERE match.result = 'draw')::INTEGER AS draws,
               COUNT(match.id) FILTER (WHERE
                   (match.white_player_id = player_row.id AND match.result = 'black') OR
                   (match.black_player_id = player_row.id AND match.result = 'white')
               )::INTEGER AS losses,
               MAX(match.played_at) AS last_played
        FROM players player_row
        LEFT JOIN matches match ON match.status = 'active'
          AND (match.white_player_id = player_row.id OR match.black_player_id = player_row.id)
        GROUP BY player_row.id
    ) stats
    WHERE player.id = stats.id;

    DROP VIEW IF EXISTS v_tournament_standings;
    CREATE VIEW v_tournament_standings AS
    SELECT
        tp.tournament_id,
        player.id AS player_id,
        player.name,
        COUNT(match.id) AS played,
        COUNT(match.id) FILTER (WHERE
            (match.white_player_id = player.id AND match.result = 'white') OR
            (match.black_player_id = player.id AND match.result = 'black')
        ) AS wins,
        COUNT(match.id) FILTER (WHERE match.result = 'draw') AS draws,
        COUNT(match.id) FILTER (WHERE
            (match.white_player_id = player.id AND match.result = 'black') OR
            (match.black_player_id = player.id AND match.result = 'white')
        ) AS losses,
        COALESCE(SUM(CASE
            WHEN match.white_player_id = player.id AND match.result = 'white' THEN 1.0
            WHEN match.black_player_id = player.id AND match.result = 'black' THEN 1.0
            WHEN match.result = 'draw' THEN 0.5 ELSE 0.0
        END), 0.0) AS score
    FROM tournament_players tp
    JOIN players player ON player.id = tp.player_id
    LEFT JOIN matches match ON match.tournament_id = tp.tournament_id
      AND match.status = 'active'
      AND (match.white_player_id = player.id OR match.black_player_id = player.id)
    GROUP BY tp.tournament_id, player.id, player.name;

    CREATE INDEX IF NOT EXISTS idx_matches_active_club_chronology
        ON matches (club_id, played_at DESC, id) WHERE status <> 'deleted';
    CREATE INDEX IF NOT EXISTS idx_matches_active_rating_replay
        ON matches (club_id, rating_category, played_at, id) WHERE status = 'active' AND is_rated;
    CREATE INDEX IF NOT EXISTS idx_match_audit_match_created
        ON match_audit_events (club_id, match_id, created_at, id);
`;

export async function up(pgm) {
    pgm.sql(MATCH_LIFECYCLE_SQL);
}

export async function down() {
    throw new Error('This match-lifecycle migration is intentionally irreversible.');
}
