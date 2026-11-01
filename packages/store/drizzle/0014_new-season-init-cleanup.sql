-- Custom SQL migration file, put your code below! --

-- Updates new_season_init() (from 0005) for the current schema: the failures
-- table was dropped in 0010 and metadata."oldestUnansweredQuestion" was
-- replaced by metadata.start in 0009, so the old body errored whenever the
-- V5RC forum reopened, failing the whole forum state update. The on_new_season
-- trigger stays bound to this function. Note that `drizzle-kit push` does not
-- run custom SQL migrations, so this must be applied manually.
CREATE OR REPLACE FUNCTION new_season_init()
RETURNS TRIGGER AS $$
DECLARE
    new_season_year integer;
    new_season_start integer;
BEGIN
    -- Check if the program is "V5RC" and the "open" column is updated to true
    IF NEW.program = 'V5RC' AND NEW.open = true THEN
        -- Set starting point for the new season. Use the newest question id (+1) from the previous season
        SELECT CAST(id AS INTEGER) + 1
        INTO new_season_start
        FROM questions
        ORDER BY CAST(id AS INTEGER) DESC
        LIMIT 1;

        SELECT CAST(SUBSTRING("currentSeason" FROM '-([0-9]+)$') AS integer)
        INTO new_season_year
        FROM metadata
        LIMIT 1;

        UPDATE metadata
        SET start = new_season_start,
            "currentSeason" = format('%s-%s', new_season_year, new_season_year + 1)
        WHERE id = 0;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
