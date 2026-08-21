export const RECONCILIATION_SQL = `
    ALTER TABLE users
        ADD COLUMN IF NOT EXISTS username TEXT,
        ADD COLUMN IF NOT EXISTS full_name TEXT,
        ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

    UPDATE users
    SET full_name = COALESCE(NULLIF(BTRIM(name), ''), NULLIF(split_part(email, '@', 1), ''), id)
    WHERE full_name IS NULL;

    UPDATE users
    SET username = COALESCE(
        NULLIF(TRIM(BOTH '_' FROM LOWER(regexp_replace(
            COALESCE(NULLIF(BTRIM(name), ''), NULLIF(split_part(email, '@', 1), ''), 'user'),
            '[^a-zA-Z0-9]+', '_', 'g'
        ))), ''),
        'user'
    ) || '_' || SUBSTRING(md5(id) FROM 1 FOR 8)
    WHERE username IS NULL;

    ALTER TABLE users
        ALTER COLUMN username SET NOT NULL,
        ALTER COLUMN full_name SET NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username_lower ON users (LOWER(username));
    CREATE INDEX IF NOT EXISTS idx_users_active_email ON users (LOWER(email)) WHERE deleted_at IS NULL;

    ALTER TABLE clubs
        ADD COLUMN IF NOT EXISTS slug TEXT,
        ADD COLUMN IF NOT EXISTS visibility TEXT,
        ADD COLUMN IF NOT EXISTS status TEXT,
        ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

    UPDATE clubs
    SET slug = COALESCE(
        NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))), ''),
        'club'
    ) || '-' || SUBSTRING(md5(id) FROM 1 FOR 8)
    WHERE slug IS NULL;

    UPDATE clubs
    SET visibility = CASE WHEN public_leaderboard THEN 'public' ELSE 'private' END
    WHERE visibility IS NULL;

    UPDATE clubs SET status = 'active' WHERE status IS NULL;

    ALTER TABLE clubs
        ALTER COLUMN slug SET NOT NULL,
        ALTER COLUMN visibility SET DEFAULT 'private',
        ALTER COLUMN visibility SET NOT NULL,
        ALTER COLUMN status SET DEFAULT 'active',
        ALTER COLUMN status SET NOT NULL;

    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_clubs_visibility' AND conrelid = 'clubs'::regclass) THEN
            ALTER TABLE clubs ADD CONSTRAINT chk_clubs_visibility
                CHECK (visibility IN ('public', 'private'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_clubs_status' AND conrelid = 'clubs'::regclass) THEN
            ALTER TABLE clubs ADD CONSTRAINT chk_clubs_status
                CHECK (status IN ('active', 'archived', 'deleted'));
        END IF;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS ux_clubs_slug ON clubs (slug);
    CREATE INDEX IF NOT EXISTS idx_clubs_visibility_active ON clubs (visibility, status)
        WHERE deleted_at IS NULL;

    ALTER TABLE user_clubs
        ADD COLUMN IF NOT EXISTS status TEXT,
        ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS status_changed_by TEXT,
        ADD COLUMN IF NOT EXISTS status_reason TEXT;

    UPDATE user_clubs SET status = 'ACTIVE_MEMBER' WHERE status IS NULL;
    UPDATE user_clubs SET updated_at = joined_at WHERE updated_at IS NULL;

    ALTER TABLE user_clubs
        ALTER COLUMN status SET DEFAULT 'ACTIVE_MEMBER',
        ALTER COLUMN status SET NOT NULL,
        ALTER COLUMN updated_at SET DEFAULT NOW(),
        ALTER COLUMN updated_at SET NOT NULL;

    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_user_clubs_status' AND conrelid = 'user_clubs'::regclass) THEN
            ALTER TABLE user_clubs ADD CONSTRAINT chk_user_clubs_status
                CHECK (status IN ('PENDING_APPROVAL', 'ACTIVE_MEMBER', 'REJECTED', 'REVOKED'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_clubs_status_actor' AND conrelid = 'user_clubs'::regclass) THEN
            ALTER TABLE user_clubs ADD CONSTRAINT fk_user_clubs_status_actor
                FOREIGN KEY (status_changed_by) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
    END $$;

    INSERT INTO user_clubs (
        user_id, club_id, role, joined_at, status, rejected_at, updated_at, status_reason
    )
    SELECT
        request.user_id,
        request.club_id,
        'member',
        request.created_at,
        CASE request.status
            WHEN 'approved' THEN 'ACTIVE_MEMBER'
            WHEN 'rejected' THEN 'REJECTED'
            ELSE 'PENDING_APPROVAL'
        END,
        CASE WHEN request.status = 'rejected' THEN request.processed_at END,
        COALESCE(request.processed_at, request.created_at),
        CASE WHEN request.status = 'rejected' THEN 'Migrated from rejected join request' END
    FROM club_join_requests request
    ON CONFLICT (user_id, club_id) DO NOTHING;

    SELECT create_updated_at_trigger('user_clubs');
    CREATE INDEX IF NOT EXISTS idx_user_clubs_user_status ON user_clubs (user_id, status);
    CREATE INDEX IF NOT EXISTS idx_user_clubs_club_status_role ON user_clubs (club_id, status, role);

    ALTER TABLE players
        ADD COLUMN IF NOT EXISTS date_of_birth DATE,
        ADD COLUMN IF NOT EXISTS federation_id TEXT,
        ADD COLUMN IF NOT EXISTS photo_url TEXT,
        ADD COLUMN IF NOT EXISTS status TEXT,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

    UPDATE players SET status = 'active' WHERE status IS NULL;

    ALTER TABLE players
        ALTER COLUMN status SET DEFAULT 'active',
        ALTER COLUMN status SET NOT NULL;

    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_players_status' AND conrelid = 'players'::regclass) THEN
            ALTER TABLE players ADD CONSTRAINT chk_players_status
                CHECK (status IN ('active', 'inactive', 'deleted'));
        END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_players_club_active ON players (club_id, name)
        WHERE status = 'active' AND deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_players_club_federation_id ON players (club_id, federation_id)
        WHERE federation_id IS NOT NULL AND deleted_at IS NULL;

    ALTER TABLE player_links
        ADD COLUMN IF NOT EXISTS club_id TEXT,
        ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
        ADD COLUMN IF NOT EXISTS review_reason TEXT,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS unlinked_at TIMESTAMPTZ;

    UPDATE player_links pl
    SET club_id = p.club_id
    FROM players p
    WHERE p.id = pl.player_id AND pl.club_id IS NULL;

    DO $$
    DECLARE unmapped TEXT;
    BEGIN
        SELECT string_agg(id, ', ' ORDER BY id) INTO unmapped
        FROM player_links WHERE club_id IS NULL;
        IF unmapped IS NOT NULL THEN
            RAISE EXCEPTION 'Cannot reconcile player_links without a player club: %', unmapped;
        END IF;
    END $$;

    UPDATE player_links
    SET updated_at = COALESCE(reviewed_at, created_at, NOW())
    WHERE updated_at IS NULL;

    ALTER TABLE player_links
        ALTER COLUMN club_id SET NOT NULL,
        ALTER COLUMN updated_at SET DEFAULT NOW(),
        ALTER COLUMN updated_at SET NOT NULL;

    DROP INDEX IF EXISTS ux_player_links_active_player;
    DROP INDEX IF EXISTS ux_player_links_active_user;
    ALTER TABLE player_links DROP CONSTRAINT IF EXISTS player_links_player_id_user_id_key;
    ALTER TABLE player_links DROP CONSTRAINT IF EXISTS player_links_status_check;

    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_player_links_status' AND conrelid = 'player_links'::regclass) THEN
            ALTER TABLE player_links ADD CONSTRAINT chk_player_links_status
                CHECK (status IN ('pending', 'approved', 'rejected', 'unlinked'));
        END IF;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS ux_player_links_active_club_player
        ON player_links (club_id, player_id) WHERE status IN ('pending', 'approved');
    CREATE UNIQUE INDEX IF NOT EXISTS ux_player_links_active_club_user
        ON player_links (club_id, user_id) WHERE status IN ('pending', 'approved');
    CREATE INDEX IF NOT EXISTS idx_player_links_club_status ON player_links (club_id, status);
    SELECT create_updated_at_trigger('player_links');

    ALTER TABLE clubs DROP CONSTRAINT IF EXISTS clubs_owner_id_fkey;
    ALTER TABLE user_clubs DROP CONSTRAINT IF EXISTS user_clubs_user_id_fkey;
    ALTER TABLE user_clubs DROP CONSTRAINT IF EXISTS user_clubs_club_id_fkey;
    ALTER TABLE players DROP CONSTRAINT IF EXISTS players_club_id_fkey;
    ALTER TABLE player_links DROP CONSTRAINT IF EXISTS player_links_player_id_fkey;
    ALTER TABLE player_links DROP CONSTRAINT IF EXISTS player_links_user_id_fkey;
    ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_club_id_fkey;
    ALTER TABLE tournament_players DROP CONSTRAINT IF EXISTS tournament_players_tournament_id_fkey;
    ALTER TABLE tournament_players DROP CONSTRAINT IF EXISTS tournament_players_player_id_fkey;
    ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_club_id_fkey;
    ALTER TABLE matches DROP CONSTRAINT IF EXISTS fk_white_player_club;
    ALTER TABLE matches DROP CONSTRAINT IF EXISTS fk_black_player_club;
    ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_tournament_id_fkey;
    ALTER TABLE rating_history DROP CONSTRAINT IF EXISTS rating_history_player_id_fkey;
    ALTER TABLE rating_history DROP CONSTRAINT IF EXISTS rating_history_match_id_fkey;
    ALTER TABLE club_join_requests DROP CONSTRAINT IF EXISTS club_join_requests_club_id_fkey;
    ALTER TABLE club_join_requests DROP CONSTRAINT IF EXISTS club_join_requests_user_id_fkey;
    ALTER TABLE club_invites DROP CONSTRAINT IF EXISTS club_invites_club_id_fkey;

    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_clubs_owner_preserve' AND conrelid = 'clubs'::regclass) THEN
            ALTER TABLE clubs ADD CONSTRAINT fk_clubs_owner_preserve
                FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_clubs_user_preserve' AND conrelid = 'user_clubs'::regclass) THEN
            ALTER TABLE user_clubs ADD CONSTRAINT fk_user_clubs_user_preserve
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_clubs_club_preserve' AND conrelid = 'user_clubs'::regclass) THEN
            ALTER TABLE user_clubs ADD CONSTRAINT fk_user_clubs_club_preserve
                FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_players_club_preserve' AND conrelid = 'players'::regclass) THEN
            ALTER TABLE players ADD CONSTRAINT fk_players_club_preserve
                FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_player_links_player_club_preserve' AND conrelid = 'player_links'::regclass) THEN
            ALTER TABLE player_links ADD CONSTRAINT fk_player_links_player_club_preserve
                FOREIGN KEY (player_id, club_id) REFERENCES players(id, club_id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_player_links_user_preserve' AND conrelid = 'player_links'::regclass) THEN
            ALTER TABLE player_links ADD CONSTRAINT fk_player_links_user_preserve
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_player_links_reviewer' AND conrelid = 'player_links'::regclass) THEN
            ALTER TABLE player_links ADD CONSTRAINT fk_player_links_reviewer
                FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tournaments_club_preserve' AND conrelid = 'tournaments'::regclass) THEN
            ALTER TABLE tournaments ADD CONSTRAINT fk_tournaments_club_preserve
                FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tournament_players_tournament_preserve' AND conrelid = 'tournament_players'::regclass) THEN
            ALTER TABLE tournament_players ADD CONSTRAINT fk_tournament_players_tournament_preserve
                FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tournament_players_player_preserve' AND conrelid = 'tournament_players'::regclass) THEN
            ALTER TABLE tournament_players ADD CONSTRAINT fk_tournament_players_player_preserve
                FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_matches_club_preserve' AND conrelid = 'matches'::regclass) THEN
            ALTER TABLE matches ADD CONSTRAINT fk_matches_club_preserve
                FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_matches_white_player_club_preserve' AND conrelid = 'matches'::regclass) THEN
            ALTER TABLE matches ADD CONSTRAINT fk_matches_white_player_club_preserve
                FOREIGN KEY (white_player_id, club_id) REFERENCES players(id, club_id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_matches_black_player_club_preserve' AND conrelid = 'matches'::regclass) THEN
            ALTER TABLE matches ADD CONSTRAINT fk_matches_black_player_club_preserve
                FOREIGN KEY (black_player_id, club_id) REFERENCES players(id, club_id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_matches_tournament_preserve' AND conrelid = 'matches'::regclass) THEN
            ALTER TABLE matches ADD CONSTRAINT fk_matches_tournament_preserve
                FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rating_history_player_preserve' AND conrelid = 'rating_history'::regclass) THEN
            ALTER TABLE rating_history ADD CONSTRAINT fk_rating_history_player_preserve
                FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rating_history_match_preserve' AND conrelid = 'rating_history'::regclass) THEN
            ALTER TABLE rating_history ADD CONSTRAINT fk_rating_history_match_preserve
                FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_join_requests_club_preserve' AND conrelid = 'club_join_requests'::regclass) THEN
            ALTER TABLE club_join_requests ADD CONSTRAINT fk_join_requests_club_preserve
                FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_join_requests_user_preserve' AND conrelid = 'club_join_requests'::regclass) THEN
            ALTER TABLE club_join_requests ADD CONSTRAINT fk_join_requests_user_preserve
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_club_invites_club_preserve' AND conrelid = 'club_invites'::regclass) THEN
            ALTER TABLE club_invites ADD CONSTRAINT fk_club_invites_club_preserve
                FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE RESTRICT;
        END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_matches_club_category_chronology
        ON matches (club_id, time_control, played_at, id);
`;

export async function up(pgm) {
    pgm.sql(RECONCILIATION_SQL);
}

export async function down() {
    throw new Error('This reconciliation migration is intentionally irreversible.');
}
