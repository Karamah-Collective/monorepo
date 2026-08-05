import { Icons } from "../icons.jsx";

// color: "accent" | "warning" | "danger" | "info" | "violet" — maps to the
// matching --{color}/--{color}-bg CSS tokens for the icon badge.
export default function StatTile({ icon, color = "accent", value, label }) {
  const Icon = Icons[icon];
  return (
    <div className="pp-stat-tile">
      <div className={`pp-stat-icon pp-stat-icon-${color}`}>
        <Icon />
      </div>
      <div>
        <div className="pp-stat-value">{value}</div>
        <div className="pp-stat-label">{label}</div>
      </div>
    </div>
  );
}
