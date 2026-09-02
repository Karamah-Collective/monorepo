import { useAdminStats } from "../api/queries.js";
import StatTile from "../components/StatTile.jsx";

const TILES = [
  { key: "pendingNew", label: "Pending New Places", icon: "plusCircle", color: "warning", to: "/submissions/new" },
  { key: "pendingEdits", label: "Pending Edits", icon: "pencil", color: "warning", to: "/submissions/edits" },
  { key: "pendingEvents", label: "Pending Events", icon: "calendar", color: "warning", to: "/events" },
  { key: "pendingEventEdits", label: "Pending Event Edits", icon: "calendar", color: "warning", to: "/events/edits" },
  { key: "unrepliedContacts", label: "Unreplied Contacts", icon: "mail", color: "danger", to: "/contacts" },
  { key: "pendingWishes", label: "Pending Wishes", icon: "heart", color: "violet", to: "/wishes" },
  { key: "totalPlaces", label: "Total Places", icon: "pin", color: "accent", to: "/places" },
  { key: "totalWishes", label: "Total Wishes", icon: "heart", color: "info", to: "/wishes" },
];

const TYPE_TILES = [
  { key: "mosque", label: "Mosque", icon: "building", color: "accent", to: "/places" },
  { key: "restaurant", label: "Restaurant", icon: "utensils", color: "info", to: "/places" },
  { key: "shop", label: "Shop", icon: "bag", color: "warning", to: "/places" },
  { key: "prayer_room", label: "Prayer Room", icon: "moon", color: "violet", to: "/places" },
];

export default function DashboardPage() {
  const { data, isLoading, error } = useAdminStats();

  return (
    <div className="pp-page">
      <h1 className="pp-page-title">Overview</h1>
      {isLoading && <p>Loading…</p>}
      {error && <p className="pp-error-text">{error.message}</p>}
      {data && (
        <>
          <div className="pp-stats-grid">
            {TILES.map((t) => (
              <StatTile key={t.key} icon={t.icon} color={t.color} value={data[t.key] ?? 0} label={t.label} to={t.to} />
            ))}
          </div>
          <h2 className="pp-section-heading">Places by type</h2>
          <div className="pp-stats-grid">
            {TYPE_TILES.map((t) => (
              <StatTile key={t.key} icon={t.icon} color={t.color} value={data.byType?.[t.key] ?? 0} label={t.label} to={t.to} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
