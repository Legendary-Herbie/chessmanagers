export const up = pgm => {
    // ─── Helper Functions ─────────────────────────────────────────────────────

    pgm.sql(`
        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    `);

    pgm.sql(`
        CREATE OR REPLACE FUNCTION create_updated_at_trigger(tbl TEXT)
        RETURNS VOID AS $$
        BEGIN
            EXECUTE format(
                'DROP TRIGGER IF EXISTS trg_updated_at ON %I;
                 CREATE TRIGGER trg_updated_at
                 BEFORE UPDATE ON %I
                 FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
                tbl, tbl
            );
        END;
        $$ LANGUAGE plpgsql;
    `);

    pgm.sql(`
        CREATE OR REPLACE FUNCTION update_player_stats_on_match()
        RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'DELETE' THEN
                -- Revert stats for White player
                UPDATE players SET
                    games       = games  - 1,
                    wins        = wins   - CASE WHEN OLD.result = 'white' THEN 1 ELSE 0 END,
                    draws       = draws  - CASE WHEN OLD.result = 'draw'  THEN 1 ELSE 0 END,
                    losses      = losses - CASE WHEN OLD.result = 'black' THEN 1 ELSE 0 END,
                    updated_at  = NOW()
                WHERE id = OLD.white_player_id;

                -- Revert stats for Black player
                UPDATE players SET
                    games       = games  - 1,
                    wins        = wins   - CASE WHEN OLD.result = 'black' THEN 1 ELSE 0 END,
                    draws       = draws  - CASE WHEN OLD.result = 'draw'  THEN 1 ELSE 0 END,
                    losses      = losses - CASE WHEN OLD.result = 'white' THEN 1 ELSE 0 END,
                    updated_at  = NOW()
                WHERE id = OLD.black_player_id;

                RETURN OLD;

            ELSIF TG_OP = 'UPDATE' THEN
                -- Revert OLD stats
                UPDATE players SET
                    games       = games  - 1,
                    wins        = wins   - CASE WHEN OLD.result = 'white' THEN 1 ELSE 0 END,
                    draws       = draws  - CASE WHEN OLD.result = 'draw'  THEN 1 ELSE 0 END,
                    losses      = losses - CASE WHEN OLD.result = 'black' THEN 1 ELSE 0 END
                WHERE id = OLD.white_player_id;

                UPDATE players SET
                    games       = games  - 1,
                    wins        = wins   - CASE WHEN OLD.result = 'black' THEN 1 ELSE 0 END,
                    draws       = draws  - CASE WHEN OLD.result = 'draw'  THEN 1 ELSE 0 END,
                    losses      = losses - CASE WHEN OLD.result = 'white' THEN 1 ELSE 0 END
                WHERE id = OLD.black_player_id;

                -- Apply NEW stats
                UPDATE players SET
                    games       = games  + 1,
                    wins        = wins   + CASE WHEN NEW.result = 'white' THEN 1 ELSE 0 END,
                    draws       = draws  + CASE WHEN NEW.result = 'draw'  THEN 1 ELSE 0 END,
                    losses      = losses + CASE WHEN NEW.result = 'black' THEN 1 ELSE 0 END,
                    last_played = GREATEST(last_played, NEW.played_at),
                    updated_at  = NOW()
                WHERE id = NEW.white_player_id;

                UPDATE players SET
                    games       = games  + 1,
                    wins        = wins   + CASE WHEN NEW.result = 'black' THEN 1 ELSE 0 END,
                    draws       = draws  + CASE WHEN NEW.result = 'draw'  THEN 1 ELSE 0 END,
                    losses      = losses + CASE WHEN NEW.result = 'white' THEN 1 ELSE 0 END,
                    last_played = GREATEST(last_played, NEW.played_at),
                    updated_at  = NOW()
                WHERE id = NEW.black_player_id;

                RETURN NEW;

            ELSIF TG_OP = 'INSERT' THEN
                -- White player
                UPDATE players SET
                    games       = games  + 1,
                    wins        = wins   + CASE WHEN NEW.result = 'white' THEN 1 ELSE 0 END,
                    draws       = draws  + CASE WHEN NEW.result = 'draw'  THEN 1 ELSE 0 END,
                    losses      = losses + CASE WHEN NEW.result = 'black' THEN 1 ELSE 0 END,
                    last_played = GREATEST(last_played, NEW.played_at),
                    updated_at  = NOW()
                WHERE id = NEW.white_player_id;

                -- Black player
                UPDATE players SET
                    games       = games  + 1,
                    wins        = wins   + CASE WHEN NEW.result = 'black' THEN 1 ELSE 0 END,
                    draws       = draws  + CASE WHEN NEW.result = 'draw'  THEN 1 ELSE 0 END,
                    losses      = losses + CASE WHEN NEW.result = 'white' THEN 1 ELSE 0 END,
                    last_played = GREATEST(last_played, NEW.played_at),
                    updated_at  = NOW()
                WHERE id = NEW.black_player_id;

                RETURN NEW;
            END IF;
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
    `);

    // ─── Users ───────────────────────────────────────────────────────────────

    pgm.createTable('users', {
        id: { type: 'text', primaryKey: true, default: pgm.func('\'usr_\' || md5(random()::text || clock_timestamp()::text)') },
        email: { type: 'text', notNull: true, unique: true },
        name: { type: 'text', unique: true },
        password_hash: { type: 'text', notNull: true },
        role: {
            type: 'text',
            notNull: true,
            default: 'member',
            check: `role IN ('admin', 'linked_player', 'member', 'staff')`,
        },
        created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
        updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    });

    pgm.sql(`SELECT create_updated_at_trigger('users');`);

    // ─── Clubs ───────────────────────────────────────────────────────────────

    pgm.createTable('clubs', {
        id: { type: 'text', primaryKey: true, default: pgm.func('\'club_\' || md5(random()::text || clock_timestamp()::text)') },
        name: { type: 'text', notNull: true },
        description: { type: 'text' },
        logo: { type: 'text' },
        contact_info: { type: 'text' },
        owner_id: { type: 'text', notNull: true, references: 'users(id)', onDelete: 'cascade' },
        share_token: { type: 'text' },
        public_leaderboard: { type: 'boolean', notNull: true, default: false },
        share_expires: { type: 'timestamptz' },
        settings_json: { type: 'jsonb', notNull: true, default: '{}' },
        created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
        updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    });

    pgm.sql(`SELECT create_updated_at_trigger('clubs');`);

    // ─── User Clubs ──────────────────────────────────────────────────────────

    pgm.createTable('user_clubs', {
        user_id: { type: 'text', notNull: true, references: 'users(id)', onDelete: 'cascade' },
        club_id: { type: 'text', notNull: true, references: 'clubs(id)', onDelete: 'cascade' },
        joined_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    }, { constraints: { primaryKey: ['user_id', 'club_id'] } });

    // ─── Players ──────────────────────────────────────────────────────────────

    pgm.createTable('players', {
        id: { type: 'text', primaryKey: true, default: pgm.func('\'player_\' || md5(random()::text || clock_timestamp()::text)') },
        club_id: { type: 'text', notNull: true, references: 'clubs(id)', onDelete: 'cascade' },
        name: { type: 'text', notNull: true },
        bio: { type: 'text' },
        rating: { type: 'integer', notNull: true, default: 1200 },
        start_rating: { type: 'integer', notNull: true, default: 1200 },
        games: { type: 'integer', notNull: true, default: 0, check: 'games >= 0' },
        wins: { type: 'integer', notNull: true, default: 0, check: 'wins >= 0' },
        draws: { type: 'integer', notNull: true, default: 0, check: 'draws >= 0' },
        losses: { type: 'integer', notNull: true, default: 0, check: 'losses >= 0' },
        last_played: { type: 'timestamptz' },
        created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
        updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    });

    pgm.sql(`
        ALTER TABLE players ADD CONSTRAINT chk_player_stats
        CHECK (wins + draws + losses <= games);
    `);

    pgm.sql(`SELECT create_updated_at_trigger('players');`);

    // ─── Tournaments ──────────────────────────────────────────────────────────

    pgm.createTable('tournaments', {
        id: { type: 'text', primaryKey: true, default: pgm.func('\'tour_\' || md5(random()::text || clock_timestamp()::text)') },
        club_id: { type: 'text', notNull: true, references: 'clubs(id)', onDelete: 'cascade' },
        name: { type: 'text', notNull: true },
        type: { type: 'text', notNull: true, check: `type IN ('round_robin', 'knockout', 'swiss', 'arena')` },
        status: { type: 'text', notNull: true, default: 'upcoming', check: `status IN ('upcoming', 'active', 'completed')` },
        start_date: { type: 'timestamptz', notNull: true },
        end_date: { type: 'timestamptz' },
        settings_json: { type: 'jsonb', notNull: true, default: '{}' },
        created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
        updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    });

    pgm.sql(`
        ALTER TABLE tournaments ADD CONSTRAINT chk_tournament_dates
        CHECK (end_date IS NULL OR end_date >= start_date);
    `);

    pgm.sql(`SELECT create_updated_at_trigger('tournaments');`);

    // ─── Tournament Players ───────────────────────────────────────────────────

    pgm.createTable('tournament_players', {
        tournament_id: { type: 'text', notNull: true, references: 'tournaments(id)', onDelete: 'cascade' },
        player_id: { type: 'text', notNull: true, references: 'players(id)', onDelete: 'cascade' },
        joined_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    }, { constraints: { primaryKey: ['tournament_id', 'player_id'] } });

    // ─── Matches ──────────────────────────────────────────────────────────────

    pgm.createTable('matches', {
        id: { type: 'text', primaryKey: true, default: pgm.func('\'match_\' || md5(random()::text || clock_timestamp()::text)') },
        club_id: { type: 'text', notNull: true, references: 'clubs(id)', onDelete: 'cascade' },
        white_player_id: { type: 'text', notNull: true, references: 'players(id)', onDelete: 'cascade' },
        black_player_id: { type: 'text', notNull: true, references: 'players(id)', onDelete: 'cascade' },
        result: { type: 'text', notNull: true, check: `result IN ('white', 'black', 'draw')` },
        type: { type: 'text', notNull: true, default: 'casual', check: `type IN ('casual', 'rated', 'tournament')` },
        tournament_id: { type: 'text', references: 'tournaments(id)', onDelete: 'set null' },
        notes: { type: 'text' },
        played_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
        created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
        updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    });

    pgm.sql(`
        ALTER TABLE matches ADD CONSTRAINT chk_match_different_players
        CHECK (white_player_id <> black_player_id);
    `);

    pgm.sql(`
        ALTER TABLE matches ADD CONSTRAINT chk_match_tournament_consistency
        CHECK (
            (type = 'tournament' AND tournament_id IS NOT NULL) OR
            (type <> 'tournament' AND tournament_id IS NULL)
        );
    `);

    pgm.sql(`SELECT create_updated_at_trigger('matches');`);

    pgm.sql(`
        DROP TRIGGER IF EXISTS trg_player_stats ON matches;
        CREATE TRIGGER trg_player_stats
            AFTER INSERT OR UPDATE OR DELETE ON matches
            FOR EACH ROW EXECUTE FUNCTION update_player_stats_on_match();
    `);

    // ─── Rating History ──────────────────────────────────────────────────────

    pgm.createTable('rating_history', {
        id: { type: 'text', primaryKey: true, default: pgm.func('\'rh_\' || md5(random()::text || clock_timestamp()::text)') },
        player_id: { type: 'text', notNull: true, references: 'players(id)', onDelete: 'cascade' },
        match_id: { type: 'text', notNull: true, references: 'matches(id)', onDelete: 'cascade' },
        rating_before: { type: 'integer', notNull: true },
        rating_after: { type: 'integer', notNull: true },
        created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    });

    pgm.addConstraint('rating_history', 'unique_player_match', {
        unique: ['player_id', 'match_id'],
    });

    // ─── Player Links ────────────────────────────────────────────────────────

    pgm.createTable('player_links', {
        id: { type: 'text', primaryKey: true, default: pgm.func('\'plink_\' || md5(random()::text || clock_timestamp()::text)') },
        player_id: { type: 'text', notNull: true, references: 'players(id)', onDelete: 'cascade' },
        user_id: { type: 'text', notNull: true, references: 'users(id)', onDelete: 'cascade' },
        status: { type: 'text', notNull: true, default: 'pending', check: `status IN ('pending', 'approved', 'rejected')` },
        created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
        reviewed_at: { type: 'timestamptz' },
    });

    pgm.addConstraint('player_links', 'unique_player_user', {
        unique: ['player_id', 'user_id'],
    });

    pgm.createIndex('player_links', 'player_id', { where: `status IN ('pending', 'approved')`, unique: true, name: 'ux_player_links_active_player' });
    pgm.createIndex('player_links', 'user_id', { where: `status IN ('pending', 'approved')`, unique: true, name: 'ux_player_links_active_user' });

    // ─── Refresh Tokens ──────────────────────────────────────────────────────

    pgm.createTable('refresh_tokens', {
        id: { type: 'text', primaryKey: true, default: pgm.func('\'rt_\' || md5(random()::text || clock_timestamp()::text)') },
        user_id: { type: 'text', notNull: true, references: 'users(id)', onDelete: 'cascade' },
        token_hash: { type: 'text', notNull: true },
        expires_at: { type: 'timestamptz', notNull: true },
        created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
        revoked: { type: 'boolean', notNull: true, default: false },
    });

    // ─── Password Resets ─────────────────────────────────────────────────────

    pgm.createTable('password_resets', {
        id: { type: 'text', primaryKey: true, default: pgm.func('\'pr_\' || md5(random()::text || clock_timestamp()::text)') },
        user_id: { type: 'text', notNull: true, references: 'users(id)', onDelete: 'cascade' },
        token_hash: { type: 'text', notNull: true },
        expires_at: { type: 'timestamptz', notNull: true },
        created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
        used_at: { type: 'timestamptz' },
        request_ip: { type: 'text' },
        user_agent: { type: 'text' },
        attempts: { type: 'integer', notNull: true, default: 0, check: 'attempts >= 0' },
    });

    // ─── Indexes ─────────────────────────────────────────────────────────────

    pgm.createIndex('clubs', 'owner_id', { name: 'idx_clubs_owner' });
    pgm.createIndex('clubs', 'share_token', { name: 'idx_clubs_share_token' });

    pgm.createIndex('user_clubs', 'user_id', { name: 'idx_user_clubs_user' });
    pgm.createIndex('user_clubs', 'club_id', { name: 'idx_user_clubs_club' });

    pgm.createIndex('players', 'club_id', { name: 'idx_players_club' });
    pgm.createIndex('players', ['club_id', 'rating'], { name: 'idx_players_rating_sort', sort: 'DESC' });
    pgm.createIndex('players', ['club_id', 'name'], { name: 'idx_players_name_search' });

    pgm.createIndex('player_links', 'player_id', { name: 'idx_player_links_player' });
    pgm.createIndex('player_links', 'user_id', { name: 'idx_player_links_user' });
    pgm.createIndex('player_links', 'status', { name: 'idx_player_links_status' });

    pgm.createIndex('matches', 'club_id', { name: 'idx_matches_club' });
    pgm.createIndex('matches', ['club_id', 'played_at'], { name: 'idx_matches_date_sort', sort: 'DESC' });
    pgm.createIndex('matches', 'white_player_id', { name: 'idx_matches_white_player' });
    pgm.createIndex('matches', 'black_player_id', { name: 'idx_matches_black_player' });
    pgm.createIndex('matches', 'tournament_id', { name: 'idx_matches_tournament' });

    pgm.createIndex('rating_history', 'player_id', { name: 'idx_rating_history_player' });
    pgm.createIndex('rating_history', 'match_id', { name: 'idx_rating_history_match' });

    pgm.createIndex('tournaments', 'club_id', { name: 'idx_tournaments_club' });
    pgm.createIndex('tournaments', ['club_id', 'status'], { name: 'idx_tournaments_status' });

    pgm.createIndex('tournament_players', 'tournament_id', { name: 'idx_tournament_players_tour' });
    pgm.createIndex('tournament_players', 'player_id', { name: 'idx_tournament_players_player' });

    pgm.createIndex('refresh_tokens', 'user_id', { name: 'idx_refresh_token_user' });
    pgm.createIndex('refresh_tokens', 'token_hash', { name: 'idx_refresh_token_hash' });

    pgm.createIndex('password_resets', 'token_hash', { name: 'idx_password_resets_token' });
    pgm.createIndex('password_resets', 'user_id', { name: 'idx_password_resets_user' });
    // ─── Views ───────────────────────────────────────────────────────────────

    pgm.sql(`
        DROP VIEW IF EXISTS v_club_leaderboard;
        CREATE VIEW v_club_leaderboard AS
        SELECT
            p.id,
            p.club_id,
            p.name,
            p.rating,
            p.games                     AS played,
            p.wins,
            p.draws,
            p.losses,
            p.last_played               AS last_active,
            pl.status                   AS link_status,
            (p.wins + p.draws * 0.5)    AS points
        FROM players p
        LEFT JOIN player_links pl ON pl.player_id = p.id AND pl.status = 'approved';
    `);

    pgm.sql(`
        DROP VIEW IF EXISTS v_tournament_standings;
        CREATE VIEW v_tournament_standings AS
        SELECT
            tp.tournament_id,
            p.id                                                            AS player_id,
            p.name,
            COUNT(m.id)                                                     AS played,
            SUM(CASE
                WHEN m.white_player_id = p.id AND m.result = 'white' THEN 1
                WHEN m.black_player_id = p.id AND m.result = 'black' THEN 1
                ELSE 0
            END)                                                            AS wins,
            SUM(CASE WHEN m.result = 'draw' THEN 1 ELSE 0 END)             AS draws,
            SUM(CASE
                WHEN m.white_player_id = p.id AND m.result = 'black' THEN 1
                WHEN m.black_player_id = p.id AND m.result = 'white' THEN 1
                ELSE 0
            END)                                                            AS losses,
            SUM(CASE
                WHEN m.white_player_id = p.id AND m.result = 'white' THEN 1.0
                WHEN m.black_player_id = p.id AND m.result = 'black' THEN 1.0
                WHEN m.result = 'draw'                                THEN 0.5
                ELSE 0.0
            END)                                                            AS score
        FROM tournament_players tp
        JOIN  players p ON p.id = tp.player_id
        LEFT JOIN matches m
            ON  m.tournament_id = tp.tournament_id
            AND (m.white_player_id = p.id OR m.black_player_id = p.id)
        GROUP BY tp.tournament_id, p.id, p.name;
    `);
};

export const down = pgm => {
    pgm.sql(`DROP VIEW IF EXISTS v_tournament_standings;`);
    pgm.sql(`DROP VIEW IF EXISTS v_club_leaderboard;`);

    pgm.dropTable('password_resets', { ifExists: true });
    pgm.dropTable('refresh_tokens', { ifExists: true });
    pgm.dropTable('player_links', { ifExists: true });
    pgm.dropTable('rating_history', { ifExists: true });
    pgm.dropTable('matches', { ifExists: true });
    pgm.dropTable('tournament_players', { ifExists: true });
    pgm.dropTable('tournaments', { ifExists: true });
    pgm.dropTable('players', { ifExists: true });
    pgm.dropTable('user_clubs', { ifExists: true });
    pgm.dropTable('clubs', { ifExists: true });
    pgm.dropTable('users', { ifExists: true });

    pgm.sql(`DROP FUNCTION IF EXISTS update_player_stats_on_match();`);
    pgm.sql(`DROP FUNCTION IF EXISTS create_updated_at_trigger(TEXT);`);
    pgm.sql(`DROP FUNCTION IF EXISTS set_updated_at();`);
};
