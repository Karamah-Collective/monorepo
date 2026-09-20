const LABELS = { yes: "Approved", no: "Rejected", pending: "Pending", "": "Pending" };

export default function StatusBadge({ status, labels = LABELS }) {
  const key = (status || "pending").toLowerCase();
  const cls = key === "yes" ? "pp-badge-yes" : key === "no" ? "pp-badge-no" : "pp-badge-pending";
  return <span className={`pp-badge ${cls}`}>{labels[key] || status}</span>;
}
