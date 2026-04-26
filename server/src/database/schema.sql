CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper macro to attach the trigger to any table that has updated_at.
-- Call once per table after CREATE TABLE.
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

-- ─── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id            TEXT        PRIMARY KEY DEFAULT ('usr_' || md5(random()::text || clock_timestamp()::text)),
    email         TEXT        UNIQUE NOT NULL,
    name          TEXT        UNIQUE,
    password_hash TEXT        NOT NULL,
    role          TEXT        NOT NULL DEFAULT 'member'
                              CHECK (role IN ('admin', 'linked_player', 'member', 'staff')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SELECT create_updated_at_trigger('users');

CREATE TABLE IF NOT EXISTS clubs (
    id                 TEXT        PRIMARY KEY DEFAULT ('club_' || md5(random()::text || clock_timestamp()::text)),
    name               TEXT        NOT NULL,
    description        TEXT,
    logo               TEXT,
    contact_info       TEXT,
    owner_id           TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    share_token        TEXT,
    -- Was INTEGER 0/1; now a real boolean. pg driver returns true/false natively.
    public_leaderboard BOOLEAN     NOT NULL DEFAULT FALSE,
    share_expires      TIMESTAMPTZ,
    -- Was TEXT; now JSONB so Postgres validates structure and supports operators/indexes.
    settings_json      JSONB       NOT NULL DEFAULT '{}',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SELECT create_updated_at_trigger('clubs');

CREATE TABLE IF NOT EXISTS user_clubs (
    user_id   TEXT        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    club_id   TEXT        NOT NULL REFERENCES clubs(id)  ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, club_id)
);

CREATE TABLE IF NOT EXISTS players (
    id           TEXT        PRIMARY KEY DEFAULT ('player_' || md5(random()::text || clock_timestamp()::text)),
    club_id      TEXT        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    name         TEXT        NOT NULL,
    bio          TEXT,
    rating       INTEGER     NOT NULL DEFAULT 1200,
    start_rating INTEGER     NOT NULL DEFAULT 1200,
    games        INTEGER     NOT NULL DEFAULT 0  CHECK (games  >= 0),
    wins         INTEGER     NOT NULL DEFAULT 0  CHECK (wins   >= 0),
    draws        INTEGER     NOT NULL DEFAULT 0  CHECK (draws  >= 0),
    losses       INTEGER     NOT NULL DEFAULT 0  CHECK (losses >= 0),
    last_played  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- wins + draws + losses must not exceed games
    CONSTRAINT chk_player_stats CHECK (wins + draws + losses <= games)
);
SELECT create_updated_at_trigger('players');

CREATE TABLE IF NOT EXISTS tournaments (
    id            TEXT        PRIMARY KEY DEFAULT ('tour_' || md5(random()::text || clock_timestamp()::text)),
    club_id       TEXT        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    name          TEXT        NOT NULL,
    type          TEXT        NOT NULL CHECK (type IN ('round_robin', 'knockout', 'swiss', 'arena')),
    status        TEXT        NOT NULL DEFAULT 'upcoming'
                              CHECK (status IN ('upcoming', 'active', 'completed')),
    start_date    TIMESTAMPTZ NOT NULL,
    end_date      TIMESTAMPTZ,
    settings_json JSONB       NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_tournament_dates CHECK (end_date IS NULL OR end_date >= start_date)
);
SELECT create_updated_at_trigger('tournaments');

CREATE TABLE IF NOT EXISTS tournament_players (
    tournament_id TEXT        NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player_id     TEXT        NOT NULL REFERENCES players(id)     ON DELETE CASCADE,
    joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tournament_id, player_id)
);

CREATE TABLE IF NOT EXISTS matches (
    id              TEXT        PRIMARY KEY DEFAULT ('match_' || md5(random()::text || clock_timestamp()::text)),
    club_id         TEXT        NOT NULL REFERENCES clubs(id)    ON DELETE CASCADE,
    white_player_id TEXT        NOT NULL REFERENCES players(id)  ON DELETE CASCADE,
    black_player_id TEXT        NOT NULL REFERENCES players(id)  ON DELETE CASCADE,
    result          TEXT        NOT NULL CHECK (result IN ('white', 'black', 'draw')),
    type            TEXT        NOT NULL DEFAULT 'casual'
                                CHECK (type IN ('casual', 'rated', 'tournament')),
    tournament_id   TEXT        REFERENCES tournaments(id) ON DELETE SET NULL,
    notes           TEXT,
    played_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent a player from being matched against themselves.
    CONSTRAINT chk_match_different_players
        CHECK (white_player_id <> black_player_id),

    -- Both players must belong to the same club as the match record.
    -- Enforced at application level too, but the DB constraint is the safety net.
    CONSTRAINT fk_match_white_player_club
        FOREIGN KEY (white_player_id, club_id)
        REFERENCES players(id, club_id) ON DELETE CASCADE,
    CONSTRAINT fk_match_black_player_club
        FOREIGN KEY (black_player_id, club_id)
        REFERENCES players(id, club_id) ON DELETE CASCADE,
    -- Note: full cross-club enforcement requires triggers; these FKs are the base layer.

    -- Tournament matches must reference a tournament; non-tournament matches must not.
    CONSTRAINT chk_match_tournament_consistency
        CHECK (
            (type = 'tournament' AND tournament_id IS NOT NULL) OR
            (type <> 'tournament' AND tournament_id IS NULL)
        )
);
SELECT create_updated_at_trigger('matches');

CREATE TABLE IF NOT EXISTS rating_history (
    id            TEXT        PRIMARY KEY DEFAULT ('rh_' || md5(random()::text || clock_timestamp()::text)),
    player_id     TEXT        NOT NULL REFERENCES players(id)  ON DELETE CASCADE,
    match_id      TEXT        NOT NULL REFERENCES matches(id)  ON DELETE CASCADE,
    rating_before INTEGER     NOT NULL,
    rating_after  INTEGER     NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (player_id, match_id)
);

CREATE TABLE IF NOT EXISTS player_links (
    id          TEXT        PRIMARY KEY DEFAULT ('plink_' || md5(random()::text || clock_timestamp()::text)),
    player_id   TEXT        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    user_id     TEXT        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    status      TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    UNIQUE (player_id, user_id)
);

-- Only one pending-or-approved link per player, and per user.
CREATE UNIQUE INDEX IF NOT EXISTS ux_player_links_active_player
    ON player_links(player_id) WHERE status IN ('pending', 'approved');
CREATE UNIQUE INDEX IF NOT EXISTS ux_player_links_active_user
    ON player_links(user_id)   WHERE status IN ('pending', 'approved');

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         TEXT        PRIMARY KEY DEFAULT ('rt_' || md5(random()::text || clock_timestamp()::text)),
    user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT        NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Was INTEGER 0/1; now a real boolean.
    revoked    BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS password_resets (
    id         TEXT        PRIMARY KEY DEFAULT ('pr_' || md5(random()::text || clock_timestamp()::text)),
    user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT        NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_at    TIMESTAMPTZ,
    request_ip TEXT,
    user_agent TEXT,
    attempts   INTEGER     NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_clubs_owner               ON clubs(owner_id);
CREATE INDEX IF NOT EXISTS idx_clubs_share_token         ON clubs(share_token);
CREATE INDEX IF NOT EXISTS idx_user_clubs_user           ON user_clubs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_clubs_club           ON user_clubs(club_id);

CREATE INDEX IF NOT EXISTS idx_players_club              ON players(club_id);
CREATE INDEX IF NOT EXISTS idx_players_rating_sort       ON players(club_id, rating DESC);
CREATE INDEX IF NOT EXISTS idx_players_name_search       ON players(club_id, name);

CREATE INDEX IF NOT EXISTS idx_player_links_player       ON player_links(player_id);
CREATE INDEX IF NOT EXISTS idx_player_links_user         ON player_links(user_id);
CREATE INDEX IF NOT EXISTS idx_player_links_status       ON player_links(status);

CREATE INDEX IF NOT EXISTS idx_matches_club              ON matches(club_id);
CREATE INDEX IF NOT EXISTS idx_matches_date_sort         ON matches(club_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_white_player      ON matches(white_player_id);
CREATE INDEX IF NOT EXISTS idx_matches_black_player      ON matches(black_player_id);
CREATE INDEX IF NOT EXISTS idx_matches_tournament        ON matches(tournament_id);

CREATE INDEX IF NOT EXISTS idx_rating_history_player     ON rating_history(player_id);
CREATE INDEX IF NOT EXISTS idx_rating_history_match      ON rating_history(match_id);

CREATE INDEX IF NOT EXISTS idx_tournaments_club          ON tournaments(club_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_status        ON tournaments(club_id, status);
CREATE INDEX IF NOT EXISTS idx_tournament_players_tour   ON tournament_players(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_players_player ON tournament_players(player_id);

CREATE INDEX IF NOT EXISTS idx_refresh_token_user        ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_token_hash        ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_resets_token     ON password_resets(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_resets_user      ON password_resets(user_id);