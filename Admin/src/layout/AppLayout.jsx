import { useEffect, useRef, useState } from "react";
import { useLocation, Outlet } from "react-router-dom";
import Nav from "./Nav.jsx";
import { NAV_LINKS } from "./navigation.js";
import { HamburgerIcon, Icons } from "../icons.jsx";
import CommandMenu from "../components/CommandMenu.jsx";

export default function AppLayout() {
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem("admin-sidebar");
      return saved
        ? saved === "collapsed"
        : window.matchMedia("(min-width:768px) and (max-width:1100px)").matches;
    } catch {
      return false;
    }
  });
  const [commandOpen, setCommandOpen] = useState(false);
  const location = useLocation();
  const navRef = useRef(null);
  const mainRef = useRef(null);
  const current =
    NAV_LINKS.find((link) => link.to === location.pathname) || NAV_LINKS[0];
  useEffect(() => {
    setNavOpen(false);
    mainRef.current?.scrollTo(0, 0);
    document.title = `${current.label} · Karamah Collective Admin`;
  }, [location.pathname, current.label]);
  useEffect(() => {
    function keydown(event) {
      document.documentElement.dataset.inputMode = "keyboard";
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
    }
    function pointerdown() {
      document.documentElement.dataset.inputMode = "pointer";
    }
    window.addEventListener("keydown", keydown);
    window.addEventListener("pointerdown", pointerdown);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("pointerdown", pointerdown);
    };
  }, []);
  useEffect(() => {
    const tablet = window.matchMedia(
      "(min-width:768px) and (max-width:1100px)",
    );
    function sync() {
      try {
        if (!localStorage.getItem("admin-sidebar"))
          setCollapsed(tablet.matches);
      } catch {}
    }
    tablet.addEventListener("change", sync);
    return () => tablet.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    function sync() {
      if (navRef.current) navRef.current.inert = media.matches && !navOpen;
      if (!media.matches) setNavOpen(false);
    }
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [navOpen]);
  useEffect(() => {
    if (!navOpen) return;
    const previous = document.activeElement;
    navRef.current?.querySelector("button")?.focus();
    function trap(event) {
      if (event.key === "Escape") {
        setNavOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = [...navRef.current.querySelectorAll("a, button")].filter(
        (el) => el.getClientRects().length,
      );
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [navOpen]);
  function toggleCollapsed() {
    setCollapsed((value) => {
      try {
        localStorage.setItem("admin-sidebar", value ? "expanded" : "collapsed");
      } catch {}
      return !value;
    });
  }
  return (
    <div className={`pp-app-shell${collapsed ? " nav-is-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div
        className={`pp-nav-backdrop${navOpen ? " pp-nav-backdrop-visible" : ""}`}
        onClick={() => setNavOpen(false)}
      />
      <Nav
        navRef={navRef}
        open={navOpen}
        collapsed={collapsed}
        onClose={() => setNavOpen(false)}
        onCollapse={toggleCollapsed}
      />
      <div className="workspace-main" inert={navOpen ? "" : undefined}>
        <header className="workspace-topbar">
          <button
            className="mobile-menu icon-button"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            aria-expanded={navOpen}
            aria-controls="workspace-navigation"
          >
            <HamburgerIcon size={22} />
          </button>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <Icons.right size={12} />
            <strong>{current.label}</strong>
          </div>
          <button
            className="workspace-search"
            aria-label="Find a page"
            onClick={() => setCommandOpen(true)}
          >
            <Icons.search size={17} />
            <span>Find a page…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <a
            className="topbar-map icon-button"
            href="https://maps.karamahcollective.com"
            target="_blank"
            rel="noreferrer"
            aria-label="Open public map"
          >
            <Icons.arrowUpRight />
          </a>
        </header>
        <main
          id="main-content"
          ref={mainRef}
          className="pp-main pp-scroll"
          tabIndex={-1}
        >
          <div className="route-content" key={location.pathname}>
            {location.pathname !== "/" && (
              <div className="page-eyebrow">
                {current.group}
                <span>/</span>
                {current.description}
              </div>
            )}
            <Outlet />
          </div>
          <footer className="workspace-footer">
            <span>
              Karamah Collective <span className="footer-divider">/</span> Workspace
              administration
            </span>
            <span>Built around community.</span>
          </footer>
        </main>
      </div>
      {commandOpen && <CommandMenu onClose={() => setCommandOpen(false)} />}
    </div>
  );
}
