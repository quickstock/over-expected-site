/**
 * One canonical description of the site, stated in the same words everywhere it
 * appears. Consistent wording is how a search engine or a retrieval model comes
 * to recognise an entity, so this string is the single source of it.
 *
 * `scripts/generate-static.mjs` mirrors it for the prerendered blocks (it is
 * plain .mjs and cannot import this file); the predeploy gate asserts the two
 * are byte-identical, because a sentence that drifts is worse than no constant.
 */
export const SITE_LINE =
  "Over Expected is a basketball shot-value platform covering NBA, EuroLeague, EuroCup, Liga ACB, Lega Basket Serie A, Basketball Bundesliga, Greek Basket League, ABA Liga, WNBA.";
