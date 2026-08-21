import { replayRatingCategory } from '../services/RatingService.js';

/** Rebuild one club's independent rating ladder in chronological match order. */
export async function recalculateRatingsForClub(clubId, timeControl, trx) {
    return replayRatingCategory(trx, clubId, timeControl);
}
