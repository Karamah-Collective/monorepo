import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import DataTable from "../components/DataTable.jsx";
import ActionCell from "../components/ActionCell.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { useAdminReviews, useApproveReview, useRejectReview } from "../api/queries.js";
import { useToast } from "../components/Toast.jsx";

const columnHelper = createColumnHelper();
const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "yes", label: "Approved" },
  { value: "no", label: "Rejected" },
];

export default function ReviewsPage() {
  const { data, isLoading, error } = useAdminReviews();
  const approve = useApproveReview();
  const reject = useRejectReview();
  const showToast = useToast();

  const columns = useMemo(
    () => [
      columnHelper.accessor("timestamp", { header: "Submitted" }),
      columnHelper.accessor("placeId", { header: "Place ID" }),
      columnHelper.accessor("rating", { header: "Rating" }),
      columnHelper.accessor("text", { header: "Text" }),
      columnHelper.accessor("status", {
        header: "Status",
        meta: { filterVariant: "select", options: STATUS_OPTIONS },
        filterFn: (row, id, value) => (row.getValue(id) || "pending") === value,
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }),
      columnHelper.display({
        id: "actions",
        header: "Actions",
        cell: (info) => {
          const row = info.row.original;
          if (row.status !== "pending" && row.status !== "") return null;
          return (
            <ActionCell
              approving={approve.isPending}
              rejecting={reject.isPending}
              onApprove={() =>
                approve.mutate(
                  { rowIndex: row.rowIndex },
                  { onSuccess: () => showToast("Approved"), onError: (e) => showToast(e.message, "error") }
                )
              }
              onReject={() =>
                reject.mutate(
                  { rowIndex: row.rowIndex },
                  { onSuccess: () => showToast("Rejected"), onError: (e) => showToast(e.message, "error") }
                )
              }
            />
          );
        },
      }),
    ],
    [approve, reject, showToast]
  );

  return (
    <div className="pp-page">
      <h1 className="pp-page-title">Reviews</h1>
      {isLoading && <p>Loading…</p>}
      {error && <p className="pp-error-text">{error.message}</p>}
      {data && <DataTable data={data} columns={columns} getRowId={(row) => row.rowIndex} emptyMessage="No reviews." />}
    </div>
  );
}
