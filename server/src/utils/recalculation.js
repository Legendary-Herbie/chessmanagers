import { calculateNewRatings } from './ratings.js';

const RATING_COLUMNS = {
    blitz: 'blitz_rating',
    rapid: 'rapid_rating',
    classical: 'classical_rating',
};

/** Rebuild one club's independent rating ladder in chronological match order. */
export async function recalculateRatingsForClub(clubId, timeControl, trx) {
    const ratingColumn = RATING_COLUMNS[timeControl];
    if (!ratingColumn) throw new Error(`Unsupported time control: ${timeControl}`);

    const players = await trx.query(
        `SELECT id, name, start_rating FROM players WHERE club_id = $1 FOR UPDATE`,
        [clubId],
    ).then(result => result.rows);

    const state = new Map(players.map(player => [player.id, {
        ...player,
        rating: player.start_rating,
        games: 0,
    }]));
    const matches = await trx.query(
        `SELECT id, white_player_id, black_player_id, result
         FROM matches
         WHERE club_id = $1
           AND time_control = $2
           AND type IN ('rated', 'tournament')
         ORDER BY played_at ASC, created_at ASC, id ASC`,
        [clubId, timeControl],
    ).then(result => result.rows);

    await trx.query(
        `DELETE FROM rating_history rh
         USING matches m
         WHERE rh.match_id = m.id AND m.club_id = $1 AND m.time_control = $2`,
        [clubId, timeControl],
    );

    for (const match of matches) {
        const white = state.get(match.white_player_id);
        const black = state.get(match.black_player_id);
        if (!white || !black) continue;
        const { newWhiteRating, newBlackRating } = calculateNewRatings(
            white.rating, black.rating, match.result, white, black,
        );

        await trx.query(
            `INSERT INTO rating_history (player_id, match_id, rating_before, rating_after)
             VALUES ($1, $2, $3, $4), ($5, $2, $6, $7)`,
            [white.id, match.id, white.rating, newWhiteRating, black.id, black.rating, newBlackRating],
        );
        state.set(white.id, { ...white, rating: newWhiteRating, games: white.games + 1 });
        state.set(black.id, { ...black, rating: newBlackRating, games: black.games + 1 });
    }

    for (const player of state.values()) {
        await trx.query(
            `UPDATE players
             SET ${ratingColumn} = $1,
                 rating = CASE WHEN $2 = 'blitz' THEN $1 ELSE rating END,
                 updated_at = NOW()
             WHERE id = $3`,
            [player.rating, timeControl, player.id],
        );
    }
}
