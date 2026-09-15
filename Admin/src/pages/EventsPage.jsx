import { LoadingState } from "../components/QueryState.jsx";
import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import DataTable from "../components/DataTable.jsx";
import ActionCell from "../components/ActionCell.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import {
  useAdminEvents,
  useApproveEvent,
  useRejectEvent,
} from "../api/queries.js";
import { useToast } from "../components/Toast.jsx";

const columnHelper = createColumnHelper();
const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "yes", label: "Approved" },
  { value: "no", label: "Rejected" },
];

export default function EventsPage() {
  const { data, isLoading, error } = useAdminEvents();
  const approve = useApproveEvent();
  const reject = useRejectEvent();
  const showToast = useToast();

  const columns = useMemo(
    () => [
      columnHelper.accessor("title", { header: "Title" }),
      columnHelper.accessor("placeName", { header: "Place" }),
      columnHelper.accessor("eventDate", { header: "Date" }),
      columnHelper.accessor("eventTime", { header: "Time" }),
      columnHelper.accessor("status", {
        header: "Status",
        meta: { filterVariant: "select", options: STATUS_OPTIONS },
        filterFn: "equals",
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }),
      columnHelper.display({
        id: "actions",
        header: "Actions",
        cell: (info) => {
          const row = info.row.original;
          if (row.status !== "pending") return null;
          return (
            <ActionCell
              approving={approve.isPending}
              rejecting={reject.isPending}
              onApprove={() =>
                approve.mutate(
                  { eventId: row.eventId },
                  {
                    onSuccess: () => showToast("Approved"),
                    onError: (e) => showToast(e.message, "error"),
                  },
                )
              }
              onReject={(reason) =>
                reject.mutate(
                  { eventId: row.eventId, reason },
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
      <h1 className="pp-page-title">Events</h1>
      {isLoading && <LoadingState />}
      {error && <p className="pp-error-text">{error.message}</p>}
      {data && (
        <DataTable
          data={data}
          columns={columns}
          getRowId={(row) => String(row.eventId)}
          emptyMessage="No events."
        />
      )}
    </div>
  );
}
