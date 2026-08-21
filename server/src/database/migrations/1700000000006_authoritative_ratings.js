export const AUTHORITATIVE_RATINGS_SQL = `
    CREATE TABLE IF NOT EXISTS player_rating_state (
        club_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        category TEXT NOT NULL,
        start_rating INTEGER NOT NULL,
        current_rating INTEGER NOT NULL,
        completed_rated_games INTEGER NOT NULL DEFAULT 0,
        peak_rating INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (player_id, category),
        CONSTRAINT chk_player_rating_state_category CHECK (category IN ('blitz', 'rapid', 'classical')),
        CONSTRAINT chk_player_rating_state_values CHECK (
            start_rating >= 0 AND current_rating >= 0
            AND completed_rated_games >= 0
            AND (peak_rating IS NULL OR peak_rating >= 0)
        )
    );

    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_player_rating_state_player_club' AND conrelid = 'player_rating_state'::regclass) THEN
            ALTER TABLE player_rating_state ADD CONSTRAINT fk_player_rating_state_player_club
                FOREIGN KEY (player_id, club_id) REFERENCES players(id, club_id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_player_rating_state_settings' AND conrelid = 'player_rating_state'::regclass) THEN
            ALTER TABLE player_rating_state ADD CONSTRAINT fk_player_rating_state_settings
                FOREIGN KEY (club_id, category) REFERENCES club_rating_settings(club_id, category) ON DELETE RESTRICT;
        END IF;
    END $$;

    INSERT INTO player_rating_state (
        club_id, player_id, category, start_rating, current_rating, completed_rated_games, peak_rating
    )
    SELECT
        player.club_id,
        player.id,
        settings.category,
        settings.initial_rating,
        CASE settings.category
            WHEN 'blitz' THEN player.blitz_rating
            WHEN 'rapid' THEN player.rapid_rating
            WHEN 'classical' THEN player.classical_rating
        END,
        COALESCE(match_counts.completed_games, 0),
        CASE WHEN COALESCE(match_counts.completed_games, 0) > 0 THEN
            GREATEST(
                CASE settings.category
                    WHEN 'blitz' THEN player.blitz_rating
                    WHEN 'rapid' THEN player.rapid_rating
                    WHEN 'classical' THEN player.classical_rating
                END,
                COALESCE(history_peak.peak_rating, 0)
            )
        ELSE NULL END
    FROM players player
    JOIN club_rating_settings settings ON settings.club_id = player.club_id
    LEFT JOIN LATERAL (
        SELECT COUNT(*)::INTEGER AS completed_games
        FROM matches match
        WHERE match.club_id = player.club_id
          AND match.time_control = settings.category
          AND match.type IN ('rated', 'tournament')
          AND (match.white_player_id = player.id OR match.black_player_id = player.id)
    ) match_counts ON TRUE
    LEFT JOIN LATERAL (
        SELECT MAX(history.rating_after)::INTEGER AS peak_rating
        FROM rating_history history
        JOIN matches match ON match.id = history.match_id
        WHERE history.player_id = player.id
          AND match.club_id = player.club_id
          AND match.time_control = settings.category
    ) history_peak ON TRUE
    ON CONFLICT (player_id, category) DO NOTHING;

    ALTER TABLE rating_history
        ADD COLUMN IF NOT EXISTS club_id TEXT,
        ADD COLUMN IF NOT EXISTS category TEXT,
        ADD COLUMN IF NOT EXISTS played_at TIMESTAMPTZ;

    UPDATE rating_history history
    SET club_id = match.club_id,
        category = match.time_control,
        played_at = match.played_at
    FROM matches match
    WHERE match.id = history.match_id
      AND (history.club_id IS NULL OR history.category IS NULL OR history.played_at IS NULL);

    DO $$
    DECLARE invalid_rows INTEGER;
    BEGIN
        SELECT COUNT(*) INTO invalid_rows
        FROM rating_history
        WHERE club_id IS NULL OR category IS NULL OR played_at IS NULL;
        IF invalid_rows > 0 THEN
            RAISE EXCEPTION 'Cannot scope % rating-history rows to a club/category/match chronology', invalid_rows;
        END IF;
    END $$;

    ALTER TABLE rating_history
        ALTER COLUMN club_id SET NOT NULL,
        ALTER COLUMN category SET NOT NULL,
        ALTER COLUMN played_at SET NOT NULL;

    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_rating_history_category' AND conrelid = 'rating_history'::regclass) THEN
            ALTER TABLE rating_history ADD CONSTRAINT chk_rating_history_category
                CHECK (category IN ('blitz', 'rapid', 'classical'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rating_history_player_club_scope' AND conrelid = 'rating_history'::regclass) THEN
            ALTER TABLE rating_history ADD CONSTRAINT fk_rating_history_player_club_scope
                FOREIGN KEY (player_id, club_id) REFERENCES players(id, club_id) ON DELETE RESTRICT;
        END IF;
    END $$;

    CREATE OR REPLACE FUNCTION populate_rating_history_scope()
    RETURNS TRIGGER AS $$
    DECLARE scoped_match RECORD;
    BEGIN
        SELECT club_id, time_control, played_at
        INTO scoped_match
        FROM matches
        WHERE id = NEW.match_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Rating history match % does not exist', NEW.match_id;
        END IF;
        NEW.club_id := scoped_match.club_id;
        NEW.category := scoped_match.time_control;
        NEW.played_at := scoped_match.played_at;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_rating_history_scope ON rating_history;
    CREATE TRIGGER trg_rating_history_scope
        BEFORE INSERT OR UPDATE OF match_id ON rating_history
        FOR EACH ROW EXECUTE FUNCTION populate_rating_history_scope();

    CREATE TABLE IF NOT EXISTS rating_recalculation_jobs (
        id TEXT PRIMARY KEY DEFAULT ('rrj_' || md5(random()::text || clock_timestamp()::text)),
        club_id TEXT NOT NULL,
        category TEXT NOT NULL,
        affected_from TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_rating_job_category CHECK (category IN ('blitz', 'rapid', 'classical')),
        CONSTRAINT chk_rating_job_status CHECK (status IN ('pending', 'running', 'completed', 'failed')),
        CONSTRAINT chk_rating_job_attempts CHECK (attempts >= 0)
    );

    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rating_jobs_settings' AND conrelid = 'rating_recalculation_jobs'::regclass) THEN
            ALTER TABLE rating_recalculation_jobs ADD CONSTRAINT fk_rating_jobs_settings
                FOREIGN KEY (club_id, category) REFERENCES club_rating_settings(club_id, category) ON DELETE RESTRICT;
        END IF;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS ux_rating_jobs_pending_category
        ON rating_recalculation_jobs (club_id, category) WHERE status = 'pending';
    CREATE INDEX IF NOT EXISTS idx_rating_jobs_status_created
        ON rating_recalculation_jobs (status, created_at);
    CREATE INDEX IF NOT EXISTS idx_rating_history_club_category_chronology
        ON rating_history (club_id, category, played_at, match_id, player_id);
    CREATE INDEX IF NOT EXISTS idx_player_rating_state_leaderboard
        ON player_rating_state (club_id, category, current_rating DESC, player_id);
    SELECT create_updated_at_trigger('player_rating_state');
    SELECT create_updated_at_trigger('rating_recalculation_jobs');

    INSERT INTO rating_recalculation_jobs (club_id, category, affected_from)
    SELECT match.club_id, match.time_control, MIN(match.played_at)
    FROM matches match
    WHERE match.type IN ('rated', 'tournament')
    GROUP BY match.club_id, match.time_control
    ON CONFLICT (club_id, category) WHERE status = 'pending'
    DO UPDATE SET affected_from = LEAST(rating_recalculation_jobs.affected_from, EXCLUDED.affected_from),
                  updated_at = NOW();
`;

export async function up(pgm) {
    pgm.sql(AUTHORITATIVE_RATINGS_SQL);
}

export async function down() {
    throw new Error('This authoritative-ratings migration is intentionally irreversible.');
}
