const LABELS = { yes: "Approved", no: "Rejected", pending: "Pending", "": "Pending" };

export default function StatusBadge({ status }) {
  const key = (status || "pending").toLowerCase();
  const cls = key === "yes" ? "pp-badge-yes" : key === "no" ? "pp-badge-no" : "pp-badge-pending";
  return <span className={`pp-badge ${cls}`}>{LABELS[key] || status}</span>;
}
