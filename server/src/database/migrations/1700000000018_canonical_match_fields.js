export const up = pgm => pgm.sql(`
    LOCK TABLE matches IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM matches WHERE time_control IS DISTINCT FROM rating_category
            OR type IS DISTINCT FROM CASE WHEN tournament_id IS NOT NULL THEN 'tournament'
                WHEN is_rated THEN 'rated' ELSE 'casual' END) THEN
            RAISE EXCEPTION 'Legacy match fields disagree with canonical fields; reconcile before migrating';
        END IF;
    END $$;
    CREATE OR REPLACE FUNCTION populate_rating_history_scope()
    RETURNS TRIGGER AS $$
    DECLARE scoped_match RECORD;
    BEGIN
        SELECT club_id, rating_category, played_at INTO scoped_match FROM matches WHERE id = NEW.match_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Rating history match % does not exist', NEW.match_id; END IF;
        NEW.club_id := scoped_match.club_id;
        NEW.category := scoped_match.rating_category;
        NEW.played_at := scoped_match.played_at;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    ALTER TABLE matches DROP COLUMN time_control, DROP COLUMN type;
`);

export const down = pgm => pgm.sql(`
    ALTER TABLE matches
        ADD COLUMN time_control TEXT NOT NULL DEFAULT 'blitz' CHECK (time_control IN ('blitz','rapid','classical')),
        ADD COLUMN type TEXT NOT NULL DEFAULT 'casual' CHECK (type IN ('casual','rated','tournament'));
    UPDATE matches SET time_control = rating_category,
        type = CASE WHEN tournament_id IS NOT NULL THEN 'tournament' WHEN is_rated THEN 'rated' ELSE 'casual' END;
    CREATE INDEX IF NOT EXISTS idx_matches_club_category_chronology ON matches (club_id, time_control, played_at, id);
`);
