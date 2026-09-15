import { LoadingState } from "../components/QueryState.jsx";
import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import DataTable from "../components/DataTable.jsx";
import ActionCell from "../components/ActionCell.jsx";
import {
  usePendingEventEdits,
  useApproveEventEdit,
  useRejectEventEdit,
} from "../api/queries.js";
import { useToast } from "../components/Toast.jsx";

const columnHelper = createColumnHelper();

export default function EventEditsPage() {
  const { data, isLoading, error } = usePendingEventEdits();
  const approve = useApproveEventEdit();
  const reject = useRejectEventEdit();
  const showToast = useToast();

  const columns = useMemo(
    () => [
      columnHelper.accessor("timestamp", { header: "Submitted" }),
      columnHelper.accessor("placeName", { header: "Place" }),
      columnHelper.accessor("title", { header: "Title" }),
      columnHelper.accessor("eventDate", { header: "Date" }),
      columnHelper.accessor("changesSummary", { header: "Summary" }),
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
                  {
                    onSuccess: () => showToast("Approved"),
                    onError: (e) => showToast(e.message, "error"),
                  },
                )
              }
              onReject={(reason) =>
                reject.mutate(
                  { rowId: row.rowId, reason },
                  {
                    onSuccess: () => showToast("Rejected"),
                    onError: (e) => showToast(e.message, "error"),
                  },
                )
              }
            />
          );
        },
      }),
    ],
    [approve, reject, showToast],
  );

  return (
    <div className="pp-page">
      <h1 className="pp-page-title">Event Edits</h1>
      {isLoading && <LoadingState />}
      {error && <p className="pp-error-text">{error.message}</p>}
      {data && (
        <DataTable
          data={data}
          columns={columns}
          getRowId={(row) => row.rowId}
          emptyMessage="No pending event edits."
        />
      )}
    </div>
  );
}
