import { useEffect, useState } from "react";
import { useLocation, Outlet } from "react-router-dom";
import Nav from "./Nav.jsx";
import { HamburgerIcon } from "../icons.jsx";

export default function AppLayout() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  // Auto-close the drawer whenever the route changes (link tap on mobile).
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="pp-app-shell">
      <div className="pp-mobile-topbar">
        <button className="pp-hamburger" onClick={() => setNavOpen(true)} aria-label="Open menu">
          <HamburgerIcon />
        </button>
        <span className="pp-mobile-topbar-title">Karamah Maps Admin</span>
      </div>

      <div className={`pp-nav-backdrop${navOpen ? " pp-nav-backdrop-visible" : ""}`} onClick={() => setNavOpen(false)} />

      <Nav open={navOpen} onClose={() => setNavOpen(false)} />

      <main className="pp-main pp-scroll">
        <Outlet />
      </main>
    </div>
  );
}
