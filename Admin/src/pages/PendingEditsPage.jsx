import { LoadingState } from "../components/QueryState.jsx";
import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import DataTable from "../components/DataTable.jsx";
import ActionCell from "../components/ActionCell.jsx";
import {
  usePendingEdits,
  useApproveEdit,
  useRejectEdit,
} from "../api/queries.js";
import { useToast } from "../components/Toast.jsx";

const columnHelper = createColumnHelper();

function CurrentVsProposed({ current, proposed, field }) {
  const currentVal = current?.[field] ?? "";
  const proposedVal = proposed ?? "";
  if (!proposedVal || proposedVal === currentVal)
    return <span>{currentVal || "—"}</span>;
  return (
    <span className="pp-current-diff">
      <strong>{proposedVal}</strong>
      <br />
      was: {currentVal || "—"}
    </span>
  );
}

export default function PendingEditsPage() {
  const { data, isLoading, error } = usePendingEdits();
  const approve = useApproveEdit();
  const reject = useRejectEdit();
  const showToast = useToast();

  const columns = useMemo(
    () => [
      columnHelper.accessor("timestamp", { header: "Submitted" }),
      columnHelper.accessor("placeId", { header: "Place ID" }),
      columnHelper.display({
        id: "name",
        header: "Name",
        cell: (info) => (
          <CurrentVsProposed
            current={info.row.original.current}
            proposed={info.row.original.name}
            field="name"
          />
        ),
      }),
      columnHelper.display({
        id: "address",
        header: "Address",
        cell: (info) => (
          <CurrentVsProposed
            current={info.row.original.current}
            proposed={info.row.original.address}
            field="address"
          />
        ),
      }),
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
      <h1 className="pp-page-title">Pending Edits</h1>
      {isLoading && <LoadingState />}
      {error && <p className="pp-error-text">{error.message}</p>}
      {data && (
        <DataTable
          data={data}
          columns={columns}
          getRowId={(row) => row.rowId}
          emptyMessage="No pending edits."
        />
      )}
    </div>
  );
}
