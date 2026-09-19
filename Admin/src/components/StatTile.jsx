import { Icons } from "../icons.jsx";
import { Link } from "react-router-dom";

// color: "accent" | "warning" | "danger" | "info" | "violet" — maps to the
// matching --{color}/--{color}-bg CSS tokens for the icon badge.
export default function StatTile({ icon, color = "accent", value, label, to }) {
  const Icon = Icons[icon];
  const content = (
    <>
      <div className={`pp-stat-icon pp-stat-icon-${color}`}>
        <Icon />
      </div>
      <div>
        <div className="pp-stat-value">{value}</div>
        <div className="pp-stat-label">{label}</div>
      </div>
    </>
  );

  if (to) {
    return (
      <Link className="pp-stat-tile pp-stat-tile-link" to={to} aria-label={`Open ${label}`}>
        {content}
      </Link>
    );
  }

  return (
    <div className="pp-stat-tile">
      {content}
    </div>
  );
}
