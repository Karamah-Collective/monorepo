import { NavLink, useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { useAdminStats } from "../api/queries.js";
import { Icons } from "../icons.jsx";
import { NAV_GROUPS } from "./navigation.js";
import { canRoute } from "../auth/permissions.js";
import logoLightUrl from "../../../Website/assets/images/kc_logo_small.webp";
import logoDarkUrl from "../../../Website/assets/images/kc_logo_small_dark.webp";

const HIDDEN_NAV_GROUPS = new Set(["Communications"]);

export function Brand() {
  return (
    <span className="brand-lockup">
      <span className="brand-mark">
        <img className="brand-logo brand-logo--light" src={logoLightUrl} alt="" />
        <img className="brand-logo brand-logo--dark" src={logoDarkUrl} alt="" />
      </span>
    </span>
  );
}

export default function Nav({ open, collapsed, onCollapse, onSearch, navRef }) {
  const { user, access } = useAuth();
  const { data } = useAdminStats();
  const location = useLocation();
  const [closedGroups, setClosedGroups] = useState(() => new Set(NAV_GROUPS.map(group => group.label)));
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
        <button className="nav-search" type="button" onClick={onSearch} aria-label="Find a page">
          <Icons.search size={17} />
          <span>Find a page…</span>
          <kbd>Ctrl K</kbd>
        </button>
      </div>
      <nav className="pp-nav-links pp-scroll" aria-label="Main navigation">
        {NAV_GROUPS.map((group) => {
          if (HIDDEN_NAV_GROUPS.has(group.label)) return null;
          const links = group.links.filter(link => link.permission ? canRoute(access, link.permission) : canRoute(access, link.to));
          if (!links.length) return null;
          const active = links.some(link => location.pathname === link.to || (!link.end && location.pathname.startsWith(`${link.to}/`)));
          const isClosed = Boolean(group.label) && closedGroups.has(group.label) && !active;
          return (
          <section className={`nav-group${!group.label ? " nav-group-root" : ""}${isClosed ? " is-collapsed" : ""}`} key={group.label || "overview"}>
            {group.label && <button className="nav-group-label" type="button" onClick={() => setClosedGroups(current => { const next = new Set(current); if (next.has(group.label)) next.delete(group.label); else next.add(group.label); return next; })} aria-expanded={!isClosed}><span>{group.label}</span><Icons.right size={13} /></button>}
            <div className="nav-group-links"><div className="nav-group-links-inner">{links.map((link) => {
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
            })}</div></div>
          </section>
        )})}
      </nav>
      <div className="nav-bottom">
        <button
          className="nav-collapse"
          onClick={onCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          <Icons.sidebar />
          <span>Collapse sidebar</span>
        </button>
        <NavLink to="/workspace/profile" className="pp-nav-user pp-nav-profile" aria-label="Open your profile">
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
            <small>{access?.roleName || "Workspace member"}</small>
          </span>
          <Icons.right className="nav-profile-arrow" size={15} />
        </NavLink>
      </div>
    </aside>
  );
}
