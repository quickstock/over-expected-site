import { useEffect, useLayoutEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import Nav from "./components/Nav";
import Footer from "./components/Footer";
import CommandK from "./components/CommandK";
import Landing from "./views/Landing";
import Leaderboard from "./views/Leaderboard";
import LineupsBoard from "./views/boards/LineupsBoard";
import ValueBoard from "./views/boards/ValueBoard";
import Calibration from "./views/Calibration";
import Player from "./views/Player";
import Methodology from "./views/Methodology";
import MethodologyLineups from "./views/MethodologyLineups";
import MethodologyValue from "./views/MethodologyValue";
import MethodologyCoaching from "./views/MethodologyCoaching";
import MethodologyDefense from "./views/MethodologyDefense";
import LineupDetail from "./views/LineupDetail";
import OpenData from "./views/OpenData";
import Compare from "./views/Compare";
import Glossary from "./views/Glossary";
import League from "./views/League";
import Referees from "./views/Referees";
import Referee from "./views/Referee";
import Feedback from "./views/Feedback";
import Story from "./views/Story";
import Comparison, { ComparisonIndex } from "./views/Comparison";
import Changelog from "./views/Changelog";
import About from "./views/About";
import { GlossaryTermPage as GlossaryTermPage } from "./views/Glossary";

import { useLeague } from "./data";
import {
  ACTIVE_LEAGUES,
  DEFAULT_LEAGUE,
  LEAGUE_DEFS,
  oklchCss,
  type League as LeagueCode,
} from "./leagues";
import {
  DEFAULT_LEAGUE_LENS,
  LEGACY_TARGETS,
  leagueLensSlugs,
  leaguePath,
  type LeagueLensSlug,
} from "./routes";

/**
 * Removes the prerendered static block, in the same paint that commits the real
 * page content. A layout effect, not a normal one: with `useEffect` the browser
 * painted the app's content below the still-present block and then painted again
 * without it, and everything jumped up by the block's height.
 *
 * Routes are imported eagerly on purpose. Splitting them with `React.lazy` cut the
 * initial bundle from 152 to 88 KB gzipped, but `lazy` resolves asynchronously
 * even with the chunk preloaded, so every split route painted once without its
 * content and the footer was committed and then detached: 0.349 CLS measured on
 * five page types, against 0.017 on the homepage, which was the only route still
 * eager. CLS is a quarter of the Lighthouse score and 0.349 scores near zero on
 * it, so the payload win was not worth it. Revisit only with a fix for the
 * fallback paint, not by re-adding `lazy`.
 */
function DropStaticBlock() {
  useLayoutEffect(() => {
    document.getElementById("oe-static")?.remove();
  }, []);
  return null;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** /lineups (no league) -> the active league's board. */
function LineupsIndex() {
  const { league } = useLeague();
  return <Navigate to={`/lineups/${league}`} replace />;
}

/** /calibration (no league) -> the active league's page. */
function CalibrationIndex() {
  const { league } = useLeague();
  return <Navigate to={`/calibration/${league}`} replace />;
}

/** The decision-EV and team-defence boards migrated into /league; old URLs stay
    alive by landing on the matching lens. The league travels in the path now, so
    there is no active-league state to set on the way. */
function LeagueRedirect({ lens = DEFAULT_LEAGUE_LENS }: { lens?: LeagueLensSlug }) {
  const { lg } = useParams();
  const code =
    lg && ACTIVE_LEAGUES.includes(lg as LeagueCode)
      ? (lg as LeagueCode)
      : DEFAULT_LEAGUE;
  const slug = leagueLensSlugs(code).includes(lens) ? lens : DEFAULT_LEAGUE_LENS;
  return <Navigate to={leaguePath(code, slug)} replace />;
}

/** /value (no league) -> the active league's board. */
function ValueIndex() {
  const { league } = useLeague();
  return <Navigate to={`/value/${league}`} replace />;
}

/** Push the active league's diverging poles onto the root as CSS custom
    properties, so Tailwind's warm/cool utilities re-theme with the toggle. */
function ThemeVars() {
  const { league } = useLeague();
  useEffect(() => {
    const def = LEAGUE_DEFS[league];
    const root = document.documentElement;
    root.style.setProperty("--color-warm", oklchCss(def.warm));
    root.style.setProperty("--color-cool", oklchCss(def.cool));
    root.style.setProperty("--color-brand", oklchCss(def.brand));
    root.dataset.league = league;
  }, [league]);
  return null;
}

export default function App() {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollToTop />
      <ThemeVars />
      <Nav onSearch={() => setSearchOpen(true)} />
      <main className="flex-1">
        <DropStaticBlock />
        <Routes>
          <Route path="/" element={<Landing />} />
          {/* League, season and lens live in the path. The season-less form
              means "current season" and is the canonical URL for it. Legacy
              bare paths are served a real 301 from vercel.json in production;
              these Navigate routes keep `vite dev` and in-app navigation
              agreeing with that. */}
          <Route path="/leaderboard" element={<Navigate to={LEGACY_TARGETS.leaderboard} replace />} />
          <Route path="/leaderboard/:lg/:lens" element={<Leaderboard />} />
          <Route path="/leaderboard/:lg/:season/:lens" element={<Leaderboard />} />
          <Route path="/shot-value" element={<Navigate to={LEGACY_TARGETS.leaderboard} replace />} />
          <Route path="/player/:lg/:id" element={<Player />} />
          <Route path="/lineups" element={<LineupsIndex />} />
          <Route path="/lineups/:lg" element={<LineupsBoard />} />
          <Route path="/lineups/:lg/:lineupId" element={<LineupDetail />} />
          <Route path="/value" element={<ValueIndex />} />
          <Route path="/value/:lg" element={<ValueBoard />} />
          <Route path="/coaching" element={<LeagueRedirect />} />
          <Route path="/coaching/:lg" element={<LeagueRedirect />} />
          <Route path="/defense" element={<LeagueRedirect lens="quality-forced" />} />
          <Route path="/defense/:lg" element={<LeagueRedirect lens="quality-forced" />} />
          <Route path="/calibration" element={<CalibrationIndex />} />
          <Route path="/calibration/:lg" element={<Calibration />} />
          <Route path="/methodology" element={<Methodology />} />
          <Route path="/methodology/lineups" element={<MethodologyLineups />} />
          <Route path="/methodology/value" element={<MethodologyValue />} />
          <Route path="/methodology/coaching" element={<MethodologyCoaching />} />
          <Route path="/methodology/defense" element={<MethodologyDefense />} />
          <Route path="/glossary" element={<Glossary />} />
          <Route path="/glossary/:slug" element={<GlossaryTermPage />} />
          <Route path="/metrics" element={<ComparisonIndex />} />
          <Route path="/metrics/:slug" element={<Comparison />} />
          <Route path="/changelog" element={<Changelog />} />
          <Route path="/about" element={<About />} />
          <Route path="/data" element={<OpenData />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/league" element={<Navigate to={LEGACY_TARGETS.league} replace />} />
          <Route path="/league/:lg/:lens" element={<League />} />
          <Route path="/league/:lg/:season/:lens" element={<League />} />
          <Route path="/referees" element={<Navigate to={LEGACY_TARGETS.referees} replace />} />
          <Route path="/referees/:lg" element={<Referees />} />
          <Route path="/referees/:lg/:season" element={<Referees />} />
          <Route path="/referee/:id" element={<Referee />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/crackdown" element={<Story />} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </main>
      <Footer />
      <CommandK open={searchOpen} onClose={() => setSearchOpen(false)} />
      <Analytics />
      <SpeedInsights />
    </div>
  );
}
