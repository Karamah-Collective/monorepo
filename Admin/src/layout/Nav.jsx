import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { useAdminStats } from "../api/queries.js";
import { Icons, CloseIcon } from "../icons.jsx";
import { NAV_GROUPS } from "./navigation.js";
import logoLightUrl from "../../../Website/assets/images/kc_logo_small.webp";
import logoDarkUrl from "../../../Website/assets/images/kc_logo_small_dark.webp";

export function Brand() {
  return (
    <>
      <span className="brand-mark">
        <img className="brand-logo brand-logo--light" src={logoLightUrl} alt="" />
        <img className="brand-logo brand-logo--dark" src={logoDarkUrl} alt="" />
      </span>
      <span className="brand-copy">
        Karamah Collective<span>ADMIN</span>
      </span>
    </>
  );
}

export default function Nav({ open, collapsed, onClose, onCollapse, navRef }) {
  const { user, signOut } = useAuth();
  const { data } = useAdminStats();
  const name = user?.displayName || user?.email || "Administrator";
  return (
    <aside
      ref={navRef}
      id="workspace-navigation"
      className={`pp-nav${open ? " pp-nav-open" : ""}`}
      aria-label="Workspace navigation"
    >
      <div className="pp-nav-brand">
        <NavLink to="/" aria-label="Karamah Collective overview">
          <Brand />
        </NavLink>
        <button
          className="pp-nav-close icon-button"
          onClick={onClose}
          aria-label="Close menu"
        >
          <CloseIcon />
        </button>
      </div>
      <div className="workspace-label">
        <span className="workspace-icon">
          <Icons.globe />
        </span>
        <span>
          Collective workspace<small>Maps, website &amp; links</small>
        </span>
        <span className="live-dot" />
      </div>
      <nav className="pp-nav-links pp-scroll" aria-label="Main navigation">
        {NAV_GROUPS.map((group) => (
          <div className="nav-group" key={group.label}>
            <div className="nav-group-label">{group.label}</div>
            {group.links.map((link) => {
              const Icon = Icons[link.icon];
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  title={link.label}
                  aria-label={link.label}
                  className={({ isActive }) =>
                    `pp-nav-link${isActive ? " active" : ""}`
                  }
                >
                  <Icon />
                  <span className="nav-link-label">{link.label}</span>
                  {data?.[link.count] > 0 && (
                    <span className="nav-count">{data[link.count]}</span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="nav-bottom">
        <a
          className="nav-public-link"
          href="https://maps.karamahcollective.com"
          target="_blank"
          rel="noreferrer"
          aria-label="Open public map"
        >
          <Icons.globe />
          <span>Open public map</span>
          <Icons.arrowUpRight />
        </a>
        <button
          className="nav-collapse"
          onClick={onCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          <Icons.sidebar />
          <span>Collapse sidebar</span>
        </button>
        <div className="pp-nav-user">
          <span className="user-avatar">
            {name
              .split(/\s+/)
              .map((part) => part[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </span>
          <span className="user-details">
            <strong>{name}</strong>
            <small>Administrator</small>
          </span>
          <button
            className="icon-button"
            onClick={signOut}
            aria-label="Sign out"
            title="Sign out"
          >
            <Icons.signOut />
          </button>
        </div>
      </div>
    </aside>
  );
}
