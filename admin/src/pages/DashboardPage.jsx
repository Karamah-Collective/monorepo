import { useAdminStats } from "../api/queries.js";
import StatTile from "../components/StatTile.jsx";

const TILES = [
  { key: "pendingNew", label: "Pending New Places", icon: "plusCircle", color: "warning" },
  { key: "pendingEdits", label: "Pending Edits", icon: "pencil", color: "warning" },
  { key: "pendingEvents", label: "Pending Events", icon: "calendar", color: "warning" },
  { key: "pendingEventEdits", label: "Pending Event Edits", icon: "calendar", color: "warning" },
  { key: "unrepliedContacts", label: "Unreplied Contacts", icon: "mail", color: "danger" },
  { key: "pendingWishes", label: "Pending Wishes", icon: "heart", color: "violet" },
  { key: "totalPlaces", label: "Total Places", icon: "pin", color: "accent" },
  { key: "totalWishes", label: "Total Wishes", icon: "heart", color: "info" },
];

const TYPE_TILES = [
  { key: "mosque", label: "Mosque", icon: "building", color: "accent" },
  { key: "restaurant", label: "Restaurant", icon: "utensils", color: "info" },
  { key: "shop", label: "Shop", icon: "bag", color: "warning" },
  { key: "prayer_room", label: "Prayer Room", icon: "moon", color: "violet" },
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
              <StatTile key={t.key} icon={t.icon} color={t.color} value={data[t.key] ?? 0} label={t.label} />
            ))}
          </div>
          <h2 className="pp-section-heading">Places by type</h2>
          <div className="pp-stats-grid">
            {TYPE_TILES.map((t) => (
              <StatTile key={t.key} icon={t.icon} color={t.color} value={data.byType?.[t.key] ?? 0} label={t.label} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
