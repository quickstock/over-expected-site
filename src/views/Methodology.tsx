import { useLeague } from "../data";
import MethodologyNBA from "./MethodologyNBA";
import MethodologyEuro from "./MethodologyEuro";

/**
 * The methodology text differs by build: the NBA measures shooting-foul
 * free throws with a style-adjusted baseline and a padding-K reliability
 * model; the European builds measure all drawn free throws, bonus
 * included, with no tracking data. Dispatch on the active league.
 */
export default function Methodology() {
  const { league } = useLeague();
  return league === "NBA" ? <MethodologyNBA /> : <MethodologyEuro />;
}
