import { useAdminStats } from "../api/queries.js";

const TILES = [
  { key: "pendingNew", label: "Pending New Places" },
  { key: "pendingEdits", label: "Pending Edits" },
  { key: "pendingEvents", label: "Pending Events" },
  { key: "pendingEventEdits", label: "Pending Event Edits" },
  { key: "unrepliedContacts", label: "Unreplied Contacts" },
  { key: "pendingWishes", label: "Pending Wishes" },
  { key: "totalPlaces", label: "Total Places" },
  { key: "totalWishes", label: "Total Wishes" },
];

export default function DashboardPage() {
  const { data, isLoading, error } = useAdminStats();

  return (
    <div>
      <h1 className="pp-page-title">Overview</h1>
      {isLoading && <p>Loading…</p>}
      {error && <p className="pp-error-text">{error.message}</p>}
      {data && (
        <>
          <div className="pp-stats-grid">
            {TILES.map((t) => (
              <div className="pp-stat-tile" key={t.key}>
                <div className="pp-stat-value">{data[t.key] ?? 0}</div>
                <div className="pp-stat-label">{t.label}</div>
              </div>
            ))}
          </div>
          <h2 style={{ fontSize: 15 }}>Places by type</h2>
          <div className="pp-stats-grid">
            {Object.entries(data.byType || {}).map(([type, count]) => (
              <div className="pp-stat-tile" key={type}>
                <div className="pp-stat-value">{count}</div>
                <div className="pp-stat-label">{type}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
