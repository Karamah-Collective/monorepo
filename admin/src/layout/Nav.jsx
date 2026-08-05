import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { Icons, CloseIcon } from "../icons.jsx";

const LINKS = [
  { to: "/", label: "Dashboard", end: true, icon: "dashboard" },
  { to: "/places", label: "Places", icon: "pin" },
  { to: "/submissions/new", label: "Pending New", icon: "plusCircle" },
  { to: "/submissions/edits", label: "Pending Edits", icon: "pencil" },
  { to: "/events", label: "Events", end: true, icon: "calendar" },
  { to: "/events/edits", label: "Event Edits", icon: "calendar" },
  { to: "/eid", label: "Eid", icon: "moon" },
  { to: "/reviews", label: "Reviews", icon: "star" },
  { to: "/wishes", label: "Wishes", icon: "heart" },
  { to: "/contacts", label: "Contacts", icon: "mail" },
  { to: "/log", label: "Activity Log", icon: "list" },
];

export default function Nav({ open, onClose }) {
  const { user, signOut } = useAuth();

  return (
    <nav className={`pp-nav pp-scroll${open ? " pp-nav-open" : ""}`}>
      <div className="pp-nav-brand">
        Karamah Maps Admin
        <button className="pp-nav-close" onClick={onClose} aria-label="Close menu">
          <CloseIcon />
        </button>
      </div>
      <div className="pp-nav-links">
        {LINKS.map((link) => {
          const Icon = Icons[link.icon];
          return (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => "pp-nav-link" + (isActive ? " active" : "")}
            >
              <Icon />
              {link.label}
            </NavLink>
          );
        })}
      </div>
      <div className="pp-nav-user">
        {user?.displayName || user?.email}
        <button className="pp-nav-signout" onClick={signOut}>
          Sign out
        </button>
      </div>
    </nav>
  );
}
