import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useLeague } from "../data";
import { ACTIVE_LEAGUES, LEAGUE_DEFS } from "../leagues";

/** The nav items. The former Analysis menu is gone: team defence and
    decision EV migrated into /league as lenses/sections, and the lineups and
    value boards stay routable but unlinked (reachable from the player page
    and /methodology). Calibration is deliberately not here either: it reads
    as an appendix to the method, so it is linked from /methodology. */
function useNavItems() {
  return [
    { to: "/leaderboard", label: "Leaderboard" },
    { to: "/league", label: "League" },
    { to: "/referees", label: "Referees" },
    { to: "/methodology", label: "Methodology" },
  ];
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `font-display text-sm font-medium tracking-wide transition-colors duration-150 ${
    isActive
      ? "text-ink underline decoration-brand decoration-2 underline-offset-4"
      : "text-ink-soft hover:text-ink"
  }`;

const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-4 py-3 font-display text-[15px] font-medium ${
    isActive ? "text-ink" : "text-ink-soft"
  }`;

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M1.5 3.5 L5 7 L8.5 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {open ? (
        <path
          d="M5 5 L15 15 M15 5 L5 15"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M3 5.5 H17 M3 10 H17 M3 14.5 H17"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/** Current league collapsed into one pill; tap to pick another. Universal
    across breakpoints — the full inline row got unwieldy past ~7 leagues. */
function LeaguePicker() {
  const { league, setLeague } = useLeague();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 font-display text-xs font-semibold tracking-wide text-ink transition-colors duration-150 hover:border-ink-faint"
      >
        {LEAGUE_DEFS[league].short}
        <ChevronIcon />
      </button>
      {open && (
        <>
          <button
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <ul
            role="listbox"
            aria-label="Choose league"
            className="absolute left-0 z-50 mt-2 w-48 overflow-hidden rounded-lg border border-line bg-paper py-1 shadow-lg"
          >
            {ACTIVE_LEAGUES.map((lg) => (
              <li key={lg}>
                <button
                  type="button"
                  role="option"
                  aria-selected={league === lg}
                  onClick={() => {
                    setLeague(lg);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left font-display text-sm ${
                    league === lg ? "text-ink" : "text-ink-soft"
                  }`}
                >
                  {LEAGUE_DEFS[lg].label}
                  {league === lg && (
                    <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Mobile: nav links collapsed behind a hamburger; tap to reveal the tabs. */
function MobileMenu({ onSearch }: { onSearch: () => void }) {
  const [open, setOpen] = useState(false);
  const navItems = useNavItems();
  return (
    <div className="relative md:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid h-8 w-8 place-items-center rounded-md text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <MenuIcon open={open} />
      </button>
      {open && (
        <>
          <button
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <nav
            aria-label="Site"
            className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border border-line bg-paper py-1 shadow-lg"
          >
            <button
              type="button"
              onClick={() => {
                onSearch();
                setOpen(false);
              }}
              className="block w-full px-4 py-3 text-left font-display text-[15px] font-medium text-ink-soft"
            >
              Search <span className="text-ink-faint">⌘K</span>
            </button>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={mobileLinkClass}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}

export default function Nav({ onSearch }: { onSearch: () => void }) {
  const navItems = useNavItems();
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-y-2 px-5 py-4 sm:px-8">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="font-display text-2xl font-bold tracking-tight text-ink sm:text-[28px]"
          >
            <span className="text-brand">O</span>E
            <span className="ml-2.5 hidden font-serif text-[15px] font-normal text-ink-faint sm:inline">
              over expected
            </span>
          </Link>
          <LeaguePicker />
        </div>
        <div className="md:hidden">
          <MobileMenu onSearch={onSearch} />
        </div>
        <nav className="hidden items-baseline gap-5 md:flex md:gap-7">
          <button
            type="button"
            onClick={onSearch}
            className="font-display text-sm font-medium tracking-wide text-ink-soft transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Search
            <kbd className="ml-1.5 hidden rounded border border-line px-1 font-mono text-[10px] text-ink-faint sm:inline">
              ⌘K
            </kbd>
          </button>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
