import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
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
import LineupDetail from "./views/LineupDetail";
import OpenData from "./views/OpenData";
import Compare from "./views/Compare";
import League from "./views/League";
import Referees from "./views/Referees";
import Referee from "./views/Referee";
import Feedback from "./views/Feedback";
import Story from "./views/Story";
import { useLeague } from "./data";
import { LEAGUE_DEFS, oklchCss } from "./leagues";

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
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/shot-value" element={<Navigate to="/leaderboard?lens=value" replace />} />
          <Route path="/player/:lg/:id" element={<Player />} />
          <Route path="/lineups" element={<LineupsIndex />} />
          <Route path="/lineups/:lg" element={<LineupsBoard />} />
          <Route path="/lineups/:lg/:lineupId" element={<LineupDetail />} />
          <Route path="/value" element={<ValueIndex />} />
          <Route path="/value/:lg" element={<ValueBoard />} />
          <Route path="/calibration" element={<CalibrationIndex />} />
          <Route path="/calibration/:lg" element={<Calibration />} />
          <Route path="/methodology" element={<Methodology />} />
          <Route path="/methodology/lineups" element={<MethodologyLineups />} />
          <Route path="/methodology/value" element={<MethodologyValue />} />
          <Route path="/data" element={<OpenData />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/league" element={<League />} />
          <Route path="/referees" element={<Referees />} />
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
