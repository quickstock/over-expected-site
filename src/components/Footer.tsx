import { Link } from "react-router-dom";
import { useData, useLeague } from "../data";
import { LEAGUE_LABEL, leagueDef } from "../leagues";
import { SITE_LINE } from "../lib/site";

export default function Footer() {
  const { meta } = useData();
  const { league } = useLeague();
  const seasons = meta.seasons;
  const stat = leagueDef(league).sftaOnly
    ? "Shooting fouls only"
    : "Free throws drawn from personal fouls";
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
          Shot value, shot-making, and foul-drawing: three reads on the same
          possession-level data, leak-free and anchored to each season's own
          league rate. The numbers blend playstyle, skill, and officiating. They
          don't separate them, and they don't prove referee bias.{" "}
          <Link to="/methodology" className="underline underline-offset-2 hover:text-ink">How it works</Link>
          , or look up any number in the{" "}
          <Link to="/glossary" className="underline underline-offset-2 hover:text-ink">glossary</Link>.
        </p>
        <p className="mt-4 max-w-2xl text-xs text-ink-faint">{SITE_LINE}</p>
        <p className="mt-4 text-xs text-ink-faint">
          Foul-drawing: {stat} · {LEAGUE_LABEL[league]} · {seasons[0]} to {seasons[seasons.length - 1]} ·
          built from possession-level play-by-play ·{" "}
          <Link to="/data" className="underline underline-offset-2 hover:text-ink">
            get the data
          </Link>{" "}
          ·{" "}
          <Link to="/feedback" className="underline underline-offset-2 hover:text-ink">
            send feedback
          </Link>{" "}
          ·{" "}
          <Link to="/metrics" className="underline underline-offset-2 hover:text-ink">
            metric comparisons
          </Link>{" "}
          ·{" "}
          <Link to="/changelog" className="underline underline-offset-2 hover:text-ink">
            changelog
          </Link>{" "}
          ·{" "}
          <Link to="/about" className="underline underline-offset-2 hover:text-ink">
            about
          </Link>
        </p>
        <p className="mt-2 text-xs text-ink-faint">
          Built by Kevin Krajnc ·{" "}
          <a
            href="https://x.com/kevin.krjn"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-ink"
          >
            @kevin.krjn
          </a>
        </p>
      </div>
    </footer>
  );
}
