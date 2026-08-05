import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import DataTable from "../components/DataTable.jsx";
import ActionCell from "../components/ActionCell.jsx";
import { usePendingNew, useApproveNew, useRejectNew } from "../api/queries.js";
import { useToast } from "../components/Toast.jsx";
import { TYPE_OPTIONS } from "../constants.js";

const columnHelper = createColumnHelper();

export default function PendingNewPage() {
  const { data, isLoading, error } = usePendingNew();
  const approve = useApproveNew();
  const reject = useRejectNew();
  const showToast = useToast();

  const columns = useMemo(
    () => [
      columnHelper.accessor("timestamp", { header: "Submitted" }),
      columnHelper.accessor("name", { header: "Name" }),
      columnHelper.accessor("type", { header: "Type", meta: { filterVariant: "select", options: TYPE_OPTIONS }, filterFn: "equals" }),
      columnHelper.accessor("address", { header: "Address" }),
      columnHelper.accessor("tags", { header: "Tags" }),
      columnHelper.accessor("notes", { header: "Notes" }),
      columnHelper.display({
        id: "actions",
        header: "Actions",
        cell: (info) => {
          const row = info.row.original;
          return (
            <ActionCell
              approving={approve.isPending}
              rejecting={reject.isPending}
              onApprove={() =>
                approve.mutate(
                  { rowId: row.rowId },
                  { onSuccess: () => showToast("Approved"), onError: (e) => showToast(e.message, "error") }
                )
              }
              onReject={(reason) =>
                reject.mutate(
                  { rowId: row.rowId, reason },
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
      <h1 className="pp-page-title">Pending New Submissions</h1>
      {isLoading && <p>Loading…</p>}
      {error && <p className="pp-error-text">{error.message}</p>}
      {data && <DataTable data={data} columns={columns} getRowId={(row) => row.rowId} emptyMessage="No pending submissions." />}
    </div>
  );
}
