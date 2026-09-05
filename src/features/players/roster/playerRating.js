export function playerRating(player, category) {
    return player.ratings?.[category]?.current_rating ?? player[`${category}_rating`] ?? null;
}
