import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

const LINKS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/places", label: "Places" },
  { to: "/submissions/new", label: "Pending New" },
  { to: "/submissions/edits", label: "Pending Edits" },
  { to: "/events", label: "Events" },
  { to: "/events/edits", label: "Event Edits" },
  { to: "/eid", label: "Eid" },
  { to: "/reviews", label: "Reviews" },
  { to: "/wishes", label: "Wishes" },
  { to: "/contacts", label: "Contacts" },
  { to: "/log", label: "Activity Log" },
];

export default function Nav() {
  const { user, signOut } = useAuth();

  return (
    <nav className="pp-nav">
      <div className="pp-nav-brand">Karamah Maps Admin</div>
      <div className="pp-nav-links">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) => "pp-nav-link" + (isActive ? " active" : "")}
          >
            {link.label}
          </NavLink>
        ))}
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
