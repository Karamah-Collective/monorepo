import { useMemo } from "react";
import { LoadingState } from "../components/QueryState.jsx";
import { createColumnHelper } from "@tanstack/react-table";
import DataTable from "../components/DataTable.jsx";
import ActionCell from "../components/ActionCell.jsx";
import {
  usePendingEid,
  useAdminEidPrayers,
  useApproveEid,
  useRejectEid,
} from "../api/queries.js";
import { useToast } from "../components/Toast.jsx";

const pendingColumnHelper = createColumnHelper();
const prayerColumnHelper = createColumnHelper();

export default function EidPage() {
  const pending = usePendingEid();
  const prayers = useAdminEidPrayers();
  const approve = useApproveEid();
  const reject = useRejectEid();
  const showToast = useToast();

  const pendingColumns = useMemo(
    () => [
      pendingColumnHelper.accessor("timestamp", { header: "Submitted" }),
      pendingColumnHelper.accessor("name", { header: "Name" }),
      pendingColumnHelper.accessor("address", { header: "Address" }),
      pendingColumnHelper.accessor("organizer", { header: "Organizer" }),
      pendingColumnHelper.accessor("date", { header: "Date" }),
      pendingColumnHelper.display({
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
              onReject={() =>
                reject.mutate(
                  { rowId: row.rowId },
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

  const prayerColumns = useMemo(
    () => [
      prayerColumnHelper.accessor("name", { header: "Name" }),
      prayerColumnHelper.accessor("address", { header: "Address" }),
      prayerColumnHelper.accessor("organizer", { header: "Organizer" }),
      prayerColumnHelper.accessor("date", { header: "Date" }),
      prayerColumnHelper.accessor("jamaats", { header: "Jamaats" }),
    ],
    [],
  );

  return (
    <div className="pp-page">
      <h1 className="pp-page-title">Eid Prayers</h1>

      <div className="pp-page" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>
          Pending Submissions
        </h2>
        {pending.isLoading && <LoadingState />}
        {pending.error && (
          <p className="pp-error-text">{pending.error.message}</p>
        )}
        {pending.data && (
          <DataTable
            data={pending.data}
            columns={pendingColumns}
            getRowId={(row) => row.rowId}
            emptyMessage="No pending Eid submissions."
          />
        )}
      </div>

      <div className="pp-page">
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>
          Approved Eid Prayers
        </h2>
        {prayers.isLoading && <LoadingState />}
        {prayers.error && (
          <p className="pp-error-text">{prayers.error.message}</p>
        )}
        {prayers.data && (
          <DataTable
            data={prayers.data}
            columns={prayerColumns}
            getRowId={(row) => String(row.id)}
            emptyMessage="No Eid prayer locations yet."
          />
        )}
      </div>
    </div>
  );
}
